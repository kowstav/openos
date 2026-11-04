# Modal Sandboxes — investigation & wiring plan

Status: **investigated, not yet integrated.** No Modal account, token, or billing exists in this environment, so nothing below is claimed as running. The current runtime is the hardened local runner (`lib/runner.ts`); this document is the concrete path to replace it.

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
1. `SandboxProvider` seam (done): `lib/sandbox-provider.ts` defines `createSandbox/runInSandbox/destroySandbox`. `LocalProvider` wraps `lib/runner.ts`; `ModalProvider` throws a clear "not configured" error until credentials exist.
2. Add Modal SDK service in a separate worker (Python or Node) holding `MODAL_TOKEN_ID`/`MODAL_TOKEN_SECRET` server-side only. The Next.js app calls the worker over an authenticated internal endpoint — never the browser.
3. Build flow: control plane creates Sandbox(Image with git + toolchain) → `git clone` + checkout pinned SHA inside → install deps → run verification sample → stream logs to the job record → terminate, persisting only artifacts + manifests.
4. Runtime flow: per-execution Sandbox from the app's BuildManifest → copy approved input files in → run the fixed harness → copy outputs out → terminate. Permission-broker grants are checked by the control plane **before** sandbox creation.
5. Rollout gate: adversarial suite (network exfiltration, cross-app access, resource exhaustion, timeout kill) must pass on Modal before it becomes the default provider; `SANDBOX_PROVIDER=modal` flips it.

## What is required from the operator
A Modal account + workspace token with billing enabled, and a decision on per-conversion cost caps. Until then, `SANDBOX_PROVIDER` stays `local` and the UI states the real isolation level.

## Honest limits of the current local runner
Scrubbed child process (env/time/output limits, validated inputs) on the host kernel — weaker than a VM/microVM. It is suitable for the vetted-package execution OpenOS does today, not for arbitrary hostile code at scale. That is exactly what the Modal migration removes.
