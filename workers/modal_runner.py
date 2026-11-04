#!/usr/bin/env python3
"""OpenOS Modal worker: one ephemeral Sandbox per execution.

Reads {"kind", "spec", "input"} on stdin, writes {"output"} on stdout.
Runs ONLY when MODAL_TOKEN_ID/MODAL_TOKEN_SECRET are configured server-side.
The sandbox itself receives no OpenOS secrets; network egress is restricted
to package registries during install. See docs/modal-sandboxes.md.
"""
import json
import sys


def main() -> int:
    try:
        import modal
    except ImportError:
        print("modal SDK not installed on the worker: pip install modal", file=sys.stderr)
        return 2
    req = json.load(sys.stdin)
    kind, spec, inp = req["kind"], req["spec"], req["input"]
    app = modal.App.lookup("openos-conversions", create_if_missing=True)
    image = (
        modal.Image.debian_slim(python_version="3.12")
        .apt_install("nodejs", "npm", "git")
    )
    if kind == "python":
        build = f"pip install --quiet {spec['packageName']}"
        code = (
            f"from {spec['module']} import {spec['exportName'].split('.')[-1]};"
            f"import sys; sys.stdout.write(str({spec['exportName'].split('.')[-1]}({inp!r})))"
        )
        cmd = ["python", "-c", code]
    else:
        build = f"npm install --prefix /work --ignore-scripts {spec['packageName']}"
        cmd = ["node", "-e", "const m=require(process.argv[1]);let f=m;for(const p of process.argv[2].split('.')){if(f&&p in Object(f))f=f[p];}Promise.resolve(f(process.argv[3])).then(v=>process.stdout.write(String(v)))", spec["module"], spec["exportName"], inp]
    sandbox = modal.Sandbox.create(
        "bash", "-c", f"mkdir -p /work && cd /work && {build} && exec \"$@\"", "openos-exec", *cmd,
        image=image, app=app, timeout=120, cpu=1.0, memory=512,
    )
    try:
        sandbox.wait()
        out = sandbox.stdout.read()
    finally:
        sandbox.terminate()
    json.dump({"output": out}, sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
