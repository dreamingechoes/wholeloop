# Performance investigation tools

Measurement-only tools kept from the P6-39 audit. They never run in the published CLI and record no arguments, paths, environment values, prompts, credentials or bodies: only operation names, counts, intervals, command families and function names.

| Command | What it does |
| --- | --- |
| `npm run perf:calibrate` | Runs a script with known operations under the preload and fails unless every counter, the phase change, the memory peak and caller attribution match exactly. Run it before trusting a measurement. |
| `npm run perf:route` | Builds, runs the model-free EVAL-09 rehearsal (needs Docker) with the preload in every Node process, and prints a per-phase table for each controller process. Add `-- --callers` for the top calling functions per phase. Profiles and `summary.json` stay in the printed directory. |
| `node scripts/perf/compare.mjs <before-run> <before-profiles> <after-run> <after-profiles>` | Refuses unless both rehearsals reached the same functional outcome and no profile overflowed, then prints before → after seconds and counters per phase. |

`preload.mjs` can also be loaded into any Node process with `NODE_OPTIONS="--import <absolute path>/scripts/perf/preload.mjs"` and `WHOLELOOP_PERF_OUTPUT=<existing absolute directory>`; set `WHOLELOOP_PERF_CALLERS=1` for caller attribution, which samples high-frequency filesystem and JSON calls one in eight.

Timings include profiler cost and describe one run, not a distribution. Compare counters, not seconds, unless the runs are uninstrumented and repeated. The method, findings and accepted limits are in the [audit ledger](../../roadmap/performance-audit.md).
