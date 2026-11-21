# Preflight and receipt

- ⛔ `core-person-display` — show the returned display.text verbatim for a question, plan or completed result. Keep coordination acknowledgements and conclusion-writing context private. Do not reformat it, narrate internal fields or print the profile style block; the single header replaces the old preparation narrative. Use style only for the explanation around the display, never to change its text or coverage.
- ⛔ `display-no-raw-json` — never show raw command JSON, schema examples or scratch payloads to the person. JSON is a tool result. If a non-step command has no display yet, use its human form or report only the requested fact; never dump its internals.
- ⛔ `worker-completion-progress` — while assignments run, show one core-formatted line for each observed finish with elapsed time, and no intermediate narrative. Use native completion events and the original start time with `wl display progress --step <name> --worker <label> --elapsed-ms <observed-ms> --status <finished-or-failed-or-unavailable> --json`; show display.text only. Never infer elapsed time or success, add fixed sleeps or poll for presentation. A checked headless route with --progress already emits these same lines; do not duplicate them.

Before producing an artifact, show display.text from the step command. Load selected repository guidance and follow it while retaining the core contract. Add only a question or explanation needed for a person's decision.

After a successful command, show display.text, including produced artifacts and open questions. A returned wrapper's result carries the command display. Distinguish observed results from unavailable checks. Preserve an error's exit code and missing action; never present it as a successful result.

Only `wl` writes runtime state. Draft large artifacts quietly in the returned scratch directory and pass them to `step complete`; never edit projections directly. The next step is a suggestion until its availability and decisions are checked.

- ⛔ `quiet-step-inputs` — stream small non-secret decisions, worker results and normalized responses through --stdin, using the host input field or a quoted here-document with a delimiter absent from the payload. Never interpolate JSON into shell arguments or echo it. Keep remaining artifact files in the returned scratch directory, create it only when needed, and never write runtime state or scratch inside a repository. Reuse returned plans, schemas and assignments rather than calling again for the same observation; a changed round still needs fresh input.
