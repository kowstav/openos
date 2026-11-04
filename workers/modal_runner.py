#!/usr/bin/env python3
"""OpenOS Modal worker: physically separate build and runtime sandboxes.

Reads {"kind", "spec", "input"} on stdin, writes {"output"} on stdout.
Runs ONLY when MODAL_TOKEN_ID/MODAL_TOKEN_SECRET are configured server-side.
The sandboxes receive no OpenOS secrets.

Build sandbox: network allowed ONLY for the package install step, installs
the validated package, then the resulting tree is carried to the runtime
sandbox through a Modal Volume. Runtime sandbox: block_network=True, runs
the exact built artifact, never reinstalls. All commands are structured
argv (sandbox.exec) — no shell strings, no interpolated user input. User
input travels only as a final argv element / stdin JSON. Process exit
status is checked; stdout is bounded. Both sandboxes are always terminated.

Provider-API note: modal.Sandbox.create(block_network=...) and
sandbox.exec(*argv) are the current Modal SDK surface. If the installed SDK
cannot enforce block_network for the runtime profile, this worker refuses
(exit 4) rather than downgrading egress — see docs/modal-sandboxes.md.
Contract-tested only without credentials (tests/i2-modal-contract.test.ts
style fixtures); live isolation proof requires a Modal account.
"""
import json
import re
import sys

NAME_RE = re.compile(r"^[a-z0-9@][a-z0-9@/_.-]*$", re.I)
IDENT_RE = re.compile(r"^[A-Za-z_$][A-Za-z0-9_$.]*$")
MAX_INPUT = 20_000
MAX_OUTPUT = 200_000
VOLUME_NAME = "openos-build-artifacts"


def fail(msg: str, code: int = 3) -> int:
    print(msg, file=sys.stderr)
    return code


def bounded(text: str) -> str:
    return text[:MAX_OUTPUT]


def run_checked(sandbox, argv, stdin_text=None):
    """Run one structured argv command; raise on non-zero exit."""
    proc = sandbox.exec(*argv)
    if stdin_text is not None:
        proc.stdin.write(stdin_text.encode() if isinstance(stdin_text, str) else stdin_text)
        proc.stdin.write_eof()
    out = bounded(proc.stdout.read() if hasattr(proc.stdout, "read") else "")
    proc.wait()
    rc = proc.returncode
    if rc not in (0, None):
        err = ""
        try:
            err = (proc.stderr.read() or "")[-500:]
        except Exception:
            pass
        raise RuntimeError(f"command {argv[0]} exited {rc}: {err}")
    return out


def main() -> int:
    try:
        import modal
    except ImportError:
        return fail("modal SDK not installed on the worker: pip install modal", 2)
    try:
        req = json.load(sys.stdin)
    except Exception:
        return fail("invalid JSON request on stdin")
    kind = str(req.get("kind", ""))
    spec = req.get("spec") or {}
    inp = str(req.get("input", ""))
    pkg, module, export = str(spec.get("packageName", "")), str(spec.get("module", "")), str(spec.get("exportName", ""))
    if kind not in ("js", "js-cli", "python"):
        return fail(f"unsupported kind: {kind!r}")
    if len(inp) > MAX_INPUT:
        return fail("input too large")
    if not NAME_RE.match(pkg) or not NAME_RE.match(module or pkg) or not IDENT_RE.match(export):
        return fail("invalid package/module/export — refused")
    if kind == "js-cli" and not re.match(r"^[A-Za-z0-9_-]+$", export):
        return fail("invalid CLI bin — refused")

    app = modal.App.lookup("openos-conversions", create_if_missing=True)
    image = modal.Image.debian_slim(python_version="3.12").apt_install("nodejs", "npm", "git")
    volume = modal.Volume.from_name(VOLUME_NAME, create_if_missing=True)
    mount = "/artifacts"
    build = runtime = None
    try:
        # ---- Build phase (install only; egress needed for registries) ----
        build = modal.Sandbox.create(image=image, app=app, timeout=300, cpu=1.0, memory=512,
                                     volumes={mount: volume})
        run_checked(build, ["mkdir", "-p", f"{mount}/pkg"])
        if kind == "python":
            run_checked(build, ["pip", "install", "--quiet", "--target", f"{mount}/pkg", pkg])
        else:
            run_checked(build, ["npm", "install", "--prefix", f"{mount}/pkg", "--no-audit",
                                "--no-fund", "--ignore-scripts", pkg])
        volume.commit()
        # ---- Runtime phase (exact built artifact; network denied) ----
        try:
            runtime = modal.Sandbox.create(image=image, app=app, timeout=30, cpu=1.0, memory=512,
                                           block_network=True, volumes={mount: volume})
        except TypeError:
            return fail("Modal SDK cannot enforce block_network — refusing untrusted job (egress profile unavailable)", 4)
        if kind == "python":
            fn = export.split(".")[-1]
            code = ("import sys, json\n"
                    f"sys.path.insert(0, '{mount}/pkg')\n"
                    f"from {module} import {fn}\n"
                    "d = json.load(sys.stdin)\n"
                    f"v = {fn}(d['input'])\n"
                    "sys.stdout.write(v if isinstance(v, str) else json.dumps(v))")
            harness = f"{mount}/harness.py"
            run_checked(runtime, ["python3", "-c",
                                  "import sys; open(sys.argv[1], 'w').write(sys.argv[2])", harness, code])
            out = run_checked(runtime, ["python3", harness], stdin_text=json.dumps({"input": inp}))
        elif kind == "js-cli":
            bin_path = f"{mount}/pkg/node_modules/.bin/{export}"
            args = inp.split()[:8]
            if any(re.search(r"[;|&$`\\]", a) for a in args):
                return fail("arguments contain shell metacharacters — refused")
            out = run_checked(runtime, [bin_path, *args])
        else:
            harness_js = (
                "const m=require(process.argv[2]);let f=m;"
                "for(const p of process.argv[3].split('.')){if(f&&p in Object(f))f=f[p];}"
                "if(typeof f!=='function')f=m.default||m;"
                "Promise.resolve(f(process.argv[4])).then(v=>process.stdout.write(typeof v==='string'?v:JSON.stringify(v)))"
                ".catch(e=>{console.error(e);process.exit(1)});")
            harness = f"{mount}/harness.cjs"
            run_checked(runtime, ["node", "-e",
                                  "require('fs').writeFileSync(process.argv[1], process.argv[2])", harness, harness_js])
            out = run_checked(runtime, ["node", harness, f"{mount}/pkg/node_modules/{module}", export, inp])
        json.dump({"output": bounded(out)}, sys.stdout)
        return 0
    except Exception as e:  # failure propagation: non-zero exit, bounded stderr
        return fail(f"Modal execution failed: {str(e)[-500:]}")
    finally:
        for sb in (runtime, build):
            if sb is not None:
                try:
                    sb.terminate()
                except Exception:
                    pass


if __name__ == "__main__":
    raise SystemExit(main())
