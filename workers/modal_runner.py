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
    mode = str(req.get("mode", "combined"))
    job_id = re.sub(r"[^A-Za-z0-9_-]", "", str(req.get("jobId", "adhoc")))[:64] or "adhoc"
    kind = str(req.get("kind", ""))
    spec = req.get("spec") or {}
    inp = str(req.get("input", ""))
    pkg, module, export = str(spec.get("packageName", "")), str(spec.get("module", "")), str(spec.get("exportName", ""))
    if mode in ("build", "run", "destroy") and kind not in ("js", "js-cli", "python", "transcribe"):
        return fail(f"unsupported kind: {kind!r}")
    if mode == "combined" and kind not in ("js", "js-cli", "python"):
        return fail(f"unsupported kind: {kind!r}")
    if len(inp) > MAX_INPUT:
        return fail("input too large")
    if not NAME_RE.match(pkg) or not NAME_RE.match(module or pkg) or not IDENT_RE.match(export):
        return fail("invalid package/module/export — refused")
    if kind == "js-cli" and not re.match(r"^[A-Za-z0-9_-]+$", export):
        return fail("invalid CLI bin — refused")

    app = modal.App.lookup("openos-conversions", create_if_missing=True)
    image = modal.Image.debian_slim(python_version="3.12").apt_install("nodejs", "npm", "git")
    # Per-job isolation: every job builds into its OWN directory on the
    # volume (jobs/<jobId>/pkg). Jobs never share a writable artifact path.
    job_name = f"openos-artifacts-{job_id}"
    try:
        volume = modal.Volume.from_name(job_name, create_if_missing=True)
    except Exception:
        volume = modal.Volume.from_name(VOLUME_NAME, create_if_missing=True)
    mount = "/artifacts"
    pkgdir = f"{mount}/jobs/{job_id}/pkg"
    build = runtime = None
    try:
        if mode == "destroy":
            runtime = modal.Sandbox.create(image=image, app=app, timeout=60, cpu=0.5, memory=256,
                                           block_network=True, volumes={mount: volume})
            run_checked(runtime, ["rm", "-rf", f"{mount}/jobs/{job_id}"])
            volume.commit()
            json.dump({"destroyed": job_id}, sys.stdout)
            return 0
        if mode == "run" or mode == "combined":
            pass  # runtime phase below; build first when combined/build
        # ---- Build phase (install only; egress needed for registries) ----
        if mode in ("build", "combined"):
            build = modal.Sandbox.create(image=image, app=app, timeout=300, cpu=1.0, memory=512,
                                         volumes={mount: volume})
            run_checked(build, ["mkdir", "-p", pkgdir])
            if kind == "python" or kind == "transcribe":
                run_checked(build, ["pip", "install", "--quiet", "--target", pkgdir, pkg])
            else:
                run_checked(build, ["npm", "install", "--prefix", pkgdir, "--no-audit",
                                    "--no-fund", "--ignore-scripts", pkg])
            digest = run_checked(build, ["python3", "-c",
                                         "import hashlib,os,sys; h=hashlib.sha256(); root=sys.argv[1];\n"
                                         "for dp,dn,fn in os.walk(root):\n"
                                         " for f in sorted(fn):\n"
                                         "  p=os.path.join(dp,f); h.update(os.path.relpath(p,root).encode()); h.update(open(p,'rb').read())\n"
                                         "print(h.hexdigest())", pkgdir]).strip()
            volume.commit()
            if mode == "build":
                json.dump({"digest": digest, "ref": f"jobs/{job_id}/pkg"}, sys.stdout)
                return 0
        if mode == "run":
            # Runtime NEVER installs: the exact built artifact must exist.
            probe = modal.Sandbox.create(image=image, app=app, timeout=30, cpu=0.5, memory=256,
                                         block_network=True, volumes={mount: volume})
            try:
                run_checked(probe, ["test", "-d", pkgdir])
            except Exception:
                return fail("artifact not found for this job — run mode never reinstalls", 5)
            finally:
                try: probe.terminate()
                except Exception: pass
        # ---- Runtime phase (exact built artifact; network denied) ----
        try:
            runtime = modal.Sandbox.create(image=image, app=app, timeout=30, cpu=1.0, memory=512,
                                           block_network=True, volumes={mount: volume})
        except TypeError:
            return fail("Modal SDK cannot enforce block_network — refusing untrusted job (egress profile unavailable)", 4)
        if kind == "python":
            fn = export.split(".")[-1]
            code = ("import sys, json\n"
                    f"sys.path.insert(0, '{pkgdir}')\n"
                    f"from {module} import {fn}\n"
                    "d = json.load(sys.stdin)\n"
                    f"v = {fn}(d['input'])\n"
                    "sys.stdout.write(v if isinstance(v, str) else json.dumps(v))")
            harness = f"{mount}/harness.py"
            run_checked(runtime, ["python3", "-c",
                                  "import sys; open(sys.argv[1], 'w').write(sys.argv[2])", harness, code])
            out = run_checked(runtime, ["python3", harness], stdin_text=json.dumps({"input": inp}))
        elif kind == "transcribe":
            # CPU-capable faster-whisper profile: tiny model, int8 compute.
            # Input is base64 audio on stdin (size-bounded by the caller).
            code = ("import sys, json, base64, tempfile, os\n"
                    f"sys.path.insert(0, '{pkgdir}')\n"
                    "from faster_whisper import WhisperModel\n"
                    "d = json.load(sys.stdin)\n"
                    "audio = base64.b64decode(d['input'])\n"
                    "model = WhisperModel(d.get('model', 'tiny'), device='cpu', compute_type='int8')\n"
                    "fd, path = tempfile.mkstemp(suffix='.wav'); os.write(fd, audio); os.close(fd)\n"
                    "segs, info = model.transcribe(path, beam_size=1)\n"
                    "out = [{'start': s.start, 'end': s.end, 'text': s.text.strip()} for s in segs]\n"
                    "sys.stdout.write(json.dumps({'segments': out, 'language': info.language}))")
            harness = f"{mount}/harness-transcribe.py"
            run_checked(runtime, ["python3", "-c",
                                  "import sys; open(sys.argv[1], 'w').write(sys.argv[2])", harness, code])
            out = run_checked(runtime, ["python3", harness], stdin_text=inp)
        elif kind == "js-cli":
            bin_path = f"{pkgdir}/node_modules/.bin/{export}"
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
            out = run_checked(runtime, ["node", harness, f"{pkgdir}/node_modules/{module}", export, inp])
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
