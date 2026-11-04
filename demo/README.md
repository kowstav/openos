# OpenOS demo showcases

Verified showcases that run on the **same** conversion and execution infrastructure as ordinary user-generated apps — no special-cased code paths. A showcase is just a conversion whose inputs and expected outputs are pinned for regression testing.

Generalization is measured separately: the evaluation tests also convert repositories that are **not** in this directory (markedjs/marked in JavaScript, un33k/python-slugify in Python) through the identical pipeline.

| Showcase | Repo | Status | Why |
|---|---|---|---|
| PDF workflows | Hopding/pdf-lib | Runnable | Trusted server adapter (merge/split/rotate/watermark/metadata + pipelines) |
| Background removal | danielgatis/rembg | Runnable | Browser ML adapter; image never leaves the device |
| Transcription | SYSTRAN/faster-whisper | Plan only | Needs a Python/GPU runtime that is not wired yet — OpenOS records an honest plan instead of faking a transcript |

Manifests live in `manifests/`, sample inputs in `fixtures/`, pinned outputs in `expected/`. Regression coverage: `tests/engine2.test.ts` and `tests/eval.test.ts`.

## Generalization measurement (finalized 2026-11-04)

Measured live through the general pipeline (see `generalization.json`): **markedjs/marked** (JavaScript, js-library) and **un33k/python-slugify** (Python, python-cli) — neither preconfigured here — both converted with validated sample outputs: **2/2 novel-repo conversions succeeded**. Other shapes (full web apps, containers, GPU libraries such as faster-whisper) end as honest partial plans until a Modal-grade runtime is wired (`docs/modal-sandboxes.md`).
