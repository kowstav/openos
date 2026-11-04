# Modal Sandboxes — investigation & wiring plan

Status: **wiring implemented, activation pending credentials (updated I5/S3).** The provider seam is live: conversion and execution both route through `activeProvider()` (`lib/sandbox-provider.ts`), and `workers/modal_runner.py` implements physically separate build/runtime Sandboxes. With no credentials the provider **refuses** untrusted jobs (fail closed) — there is no host fallback. The host runner (`lib/runner.ts`) runs only for explicitly trusted fixtures with `SANDBOX_PROVIDER=local-trusted-fixtures` + `OPENOS_ENABLE_LOCAL_FIXTURES=1`, never for arbitrary repositories. See [the release report](i5-release.md) for activation steps.

## What Modal Sandboxes provide (from Modal's product documentation)
- Programmatic, isolated containers created on demand via the Modal SDK (`modal.Sandbox.create`) from a defined Image, with per-sandbox CPU/memory limits, timeouts, and termination.
- Filesystem isolation per sandbox, configurable networking (including blocked egress), and exec of arbitrary commands inside the sandbox while the calling control plane stays outside.
- Sandboxes are ephemeral and API-managed, which maps directly onto OpenOS's build/runtime split.

## Why it fits OpenOS
| OpenOS need | Modal mapping |
|---|---|
| Untrusted repo build (install deps, run tests) | One Sandbox per conversion job, from a language Image (node/python), source cloned at pinned SHA inside the sandbox |
| Untrusted app execution | One short-lived Sandbox per execution (or per app session), inputs copied in, outputs copied out, sandbox terminated |
| No secrets in untrusted code | Tokens stay in the OpenOS control plane; sandboxes receive no `MODAL_TOKEN`, model keys, or user credentials |
| Resource limits | Sandbox cpu/memory/timeout parameters + OpenOS job budget caps |
| Network policy | Start with egress blocked; allow only package registries during install phase |

## Wiring plan (in order)
1. `SandboxProvider` seam (done): `lib/sandbox-provider.ts` exposes `run(kind, spec, input)` behind `activeProvider()`. `ModalProvider` spawns `workers/modal_runner.py`; without tokens it rejects with a clear "not configured" error. The fixture runner wraps `lib/runner.ts` behind its explicit opt-in.
2. Add Modal SDK service in a separate worker (Python or Node) holding `MODAL_TOKEN_ID`/`MODAL_TOKEN_SECRET` server-side only. The Next.js app calls the worker over an authenticated internal endpoint — never the browser.
3. Build flow: control plane creates Sandbox(Image with git + toolchain) → `git clone` + checkout pinned SHA inside → install deps → run verification sample → stream logs to the job record → terminate, persisting only artifacts + manifests.
4. Runtime flow: per-execution Sandbox from the app's BuildManifest → copy approved input files in → run the fixed harness → copy outputs out → terminate. Permission-broker grants are checked by the control plane **before** sandbox creation.
5. Rollout gate: adversarial suite (network exfiltration, cross-app access, resource exhaustion, timeout kill) must pass on Modal before it becomes the default provider; `SANDBOX_PROVIDER=modal` flips it.

## What is required from the operator
A Modal account + workspace token with billing enabled, and a decision on per-conversion cost caps. Until then `SANDBOX_PROVIDER` stays unset (refusing), never `local` for untrusted work, and health states the real isolation level. Exact variables and validation are in [the release report](i5-release.md#credential-activation).

## Honest limits of the trusted-fixture runner
Scrubbed child process (env/time/output limits, validated inputs) on the host kernel — weaker than a VM/microVM. It exists only so protocol tests can run explicitly trusted fixtures; it is never selected for an arbitrary repository. That boundary is what the Modal migration provides for untrusted code.
