# Experience evaluation

> **TL;DR** — Native-shaped synthetic transcripts test the parsers and budgets without a model. Live acceptance runs six steps in a disposable application, retains its observations outside repositories and requires an explicit quota confirmation. No live baseline has been recorded yet.

## Offline checks

Run the parser, budget, provenance and refusal tests:

```bash
npx vitest run test/unit/experience/experience.test.ts
```

The two files in `test/fixtures/experience/` are original synthetic event streams. They contain no captured conversation or personal paths. Codex launch completion is distinct from worker completion; Claude text deltas and complete messages are de-duplicated. Tool output is never counted as text shown to a person.

Replay a trace with `npm run eval:experience -- --replay <trace.json>`. Replay never launches a client. Without a calibrated baseline it exits 1 and reports `Live baseline calibration pending`; this is deliberate, including for the synthetic fixtures.

## Live acceptance (manual)

The live entry point takes `--target codex|claude`, optional `--out <new-external-directory>` and optional `--baseline <budgets.json>`. It refuses before building or launching unless `WHOLELOOP_LIVE_CONFIRM` is `spend-quota`. Do not put that variable in CI, a profile or a committed file.

Prepare a dedicated, signed-in client home and select it with `WHOLELOOP_EXPERIENCE_CLIENT_HOME`. The evaluator never reads or copies credential files. The native invocation disables inherited MCP configuration; use a clean client home with no personal customizations. Codex keeps its parent record in that dedicated home because its workers cannot start from an ephemeral parent. No permission bypass is passed, so refused operations remain part of the result.

The evaluator creates a tiny Node application with three tests, installs the current built wholeloop for the selected client into that application and runs research, framing, specification, scopes, slicing and an ad-hoc build. Fixture answers are embedded in each prompt: the step must present its ordinary question, then use the supplied answer. Publication, hosted trials and external service calls are forbidden. Each step is bounded to fifteen minutes and 32 MiB of native output. The script retains the application, external store, native traces, version, source revision and reports for review, including failed results. Build with `npm run build` before the manual run.

Collect the baseline on both reference clients **before UX fixes**, using this task's commit as the source revision. Combine the twelve `*.trace.json` documents into one JSON array outside the repository. `npm run eval:experience -- --calibrate <traces.json>` prints the initial budgets. Calibration refuses synthetic provenance, missing steps, unknown token usage or incomplete worker observations. Keep the original traces and resulting budgets in the external evaluation directory; record the summary in `roadmap/manual-verification.md`. Provenance labels are declarations, not proof that a client ran.

For subsequent calibrations pass the existing file with `--baseline`; every threshold takes the smaller value. Budgets cannot loosen through calibration. Replay with the resulting baseline to compare an individual trace. A full live run checks each of its six steps against the same budgets.

## What is measured

| Observation | Interpretation |
| --- | --- |
| Wall time, first question or plan | Milliseconds from process launch to observed native events; unsupported or missing output cannot pass |
| Input, cached and output tokens | Client-reported usage, never metered billing; Claude cache reads/creation are included in input, Codex cached input is already included |
| Workers and peak concurrency | Observed launches and terminal statuses; a missing finish is unknown, never an inferred parallel result |
| Tool calls, approval prompts | Native tool invocations and reported permission requests/denials; silent native policy decisions are not visible |
| Text, final lines, raw JSON, terms | Complete visible messages only; tool results and duplicate streaming deltas are excluded |
| Sources and questions | Actual tool/command names, MCP server IDs and required question phrases with a question mark; wording checks are a fixture convention, not a semantic judge |

Native streams may omit nested worker calls, usage or policy decisions. The report covers what the stream exposes; the per-client manual pass checks those limits. Unknown event shapes fail rather than quietly measuring zero.

Absolute budgets are quick research at most three minutes and three workers, Define steps at most five minutes, no unchosen source, no fixed sleep, no raw JSON, no internal vocabulary and a final answer at most 25 lines. Input/output token, first question, call-count and build-gate time ceilings come from the live baseline. Until that exists, the evaluation cannot report a full pass. The vocabulary lives in `src/display/terms.ts` so display and transcript checks share one list.
