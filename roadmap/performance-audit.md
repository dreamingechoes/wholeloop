# Harness performance audit

> **TL;DR** — P6-39 audits every unnecessary read, execution, write, lock, loop and retry. Runtime duration follows from that work; a fast path containing redundant operations is not complete.

> [!NOTE]
> **Status: 🚧 partial · 1.0 release blocker.** Preserve authority, current-input validation and original failures. The initial five-second total-controller ceiling does not replace operation-count and growth requirements. No complete coverage, platform parity or prompt comparison is claimed.

## Evidence boundaries

Operation counts below are executed on macOS arm64 with Node 24.22.0. Linux gates establish their stated correctness scope; Linux runtime profiling remains open. Windows/WSL2 and unavailable native accounts remain unvalidated. Synthetic clients and local publication transports establish no native-client, hosted-PR or model acceptance.

Distinguish direct process API calls, supervised IPC requests, logical event accesses, physical opens and filesystem metadata API calls. Do not sum overlapping inclusive timings or count IPC requests as additional observed OS spawns. Instrumented timing includes measurement cost. Never compare differently mutated fixtures, failed prefixes or different route outcomes as a speedup.

## Executed autonomous reference

Source a186e79 passes all thirteen stages and final endpoint in an unmodified model-free Docker/Git rehearsal: 182 seconds, fourteen successful synthetic receipts, zero human waits and local publication only. Both exact environments are observed retired. Original report SHA-256: c27d062953d09dcf3d251e1ffdee1e589e195c5bdc79ad498ba08155d82a6e1c. This passes correction verification and fails the broader performance objective.

The same source's separately instrumented reference passes in 185 seconds, with both environments retired; report SHA-256 a8e615d5ed43ea8d66d6ee52eba4127e1490b8a846af580260d5e43f96cb840f. The calibration independently observes three Git calls, four lstat calls and one supervised request in its declared phase. Counter buffers do not overflow. These timings are not paired latency statistics.

Controller totals: 7374 direct Git API calls, 4532137 lstat calls, 3385665 exists calls, 7100 fsyncs and 269066 JSON parses. The waiting public CLI parent separately makes 982967 lstat calls. Fourteen model receipts correspond to 84 supervised client commands including boundary probes, not fourteen OS launches. Their necessity must be audited individually. Some supervised child environments intentionally exclude the profiler; their requests remain separately labelled.

| Autonomous phase | Direct Git API calls | lstat calls | exists calls | fsync calls |
| --- | ---: | ---: | ---: | ---: |
| Bootstrap | 61 | 1010 | 5230 | 20 |
| Plan | 40 | 1443 | 5188 | 42 |
| Acceptance definition | 95 | 13005 | 26197 | 210 |
| Workspace | 140 | 10385 | 11515 | 80 |
| Build plan | 591 | 86490 | 86018 | 574 |
| Implementation | 96 | 34779 | 21162 | 196 |
| Commit | 291 | 49752 | 18863 | 118 |
| Verification | 859 | 845009 | 906869 | 1716 |
| Review | 1721 | 602112 | 199122 | 1342 |
| Reverification | 690 | 225844 | 63169 | 60 |
| Integration | 1162 | 2110440 | 1403727 | 2154 |
| Acceptance | 511 | 231516 | 181789 | 412 |
| Publication | 538 | 168177 | 205082 | 122 |
| Handoff | 453 | 121452 | 196192 | 38 |
| Finalization after handoff | 126 | 30723 | 55542 | 16 |

The final row includes completion bookkeeping; it is not an isolated read-only endpoint measurement. Verification repeats one exact volume-inspect request 29 times; integration repeats another 40 times and one exact daemon-info request sixteen times. Mutable readiness polls and repeated complete snapshots require separate caller analysis before any read is removed or shared.

## Canonical step coverage

Each row has an actual compiled before/after missing-input execution in an isolated empty repository, home and store. All preserve exit 2. Before: six fsyncs, three writes, seven mkdirs and four state entries per call. After [ADR-0230](../docs/decisions/0230-read-only-step-admission-and-linear-history.md): zero for every category and no process launches. Positive standalone, chained, cancellation and recovery traces remain separate open obligations for every row.

| Step | Missing-input trace | Remaining coverage |
| --- | --- | --- |
| research | Executed | Admitted/completed and other routes open |
| frame-problem | Executed; idempotent read and concurrent-close controls | Broader routes open |
| write-spec | Executed; completed-history growth control | Broader routes open |
| cut-scopes | Executed | Admitted/completed and other routes open |
| slice-work | Executed | Admitted/completed and other routes open |
| build-slice | Executed | Admitted/completed and other routes open |
| verify-works | Executed | Admitted/completed and other routes open |
| review-code | Executed | Admitted/completed and other routes open |
| open-pr | Executed | Admitted/completed and other routes open |
| prepare-launch | Executed | Admitted/completed and other routes open |
| ramp-exposure | Executed | Admitted/completed and other routes open |
| measure-impact | Executed | Admitted/completed and other routes open |
| decide-next | Executed | Admitted/completed and other routes open |

Shared core evidence does not establish native discovery/login/use for each CLI. Utilities next/status/setup/sync, discovery/config/providers, overview/watch, fan-out, cancellation and recovery retain their own trace obligations.

## Findings and remaining work

| Finding | Cause and status |
| --- | --- |
| Repeated complete proof reads | Original isolated endpoint: 4371 Git calls, 2011 journal reads and 1932733 lstat calls. Verified observation sharing retains exact bytes and revalidation; full-route amplification above remains open. |
| Quadratic state line splitting | Split once before iterating; corrected in 981a19e. |
| Observation quota regressions | Ordinary selections and original native registration members retain all projections under explicit bounds; corrected in edb12e0/a186e79. No cross-action authority cache. |
| Unbounded/overshooting lock waits | NaN, Infinity and clock rollback require an original-child watchdog; 0647c2c rejects invalid waits, uses monotonic time and one lazy bounded-sleep buffer. |
| No-op preflight/cache writes | Corrected locally with first-write admission and read-only discovery; required increment gates pending. |
| Quadratic active/start matching | Locally replaced full-history searches with ended-run and validated-prefix start indexes. At 400 completed runs, preflight event-field accesses fall from 2186016 to 102119; full increment gates pending. |
| Quadratic projection rendering | Executed 100/400-item controls make 47800/671200 event-field accesses: fourteenfold work for fourfold input. Still open; scope includes repeated per-item domain reconstruction and projection writes. |
| Parent and live guard polling | Parent makes almost one million metadata calls while waiting. Inspect ForegroundOwner.current, RunnerStore.currentState and repeated record/journal queries without weakening cancellation or authority checks. Open. |
| Supervised backend/client queries | Exact request repetition measured above; inspect every caller and intervening mutation/readiness change. Required current probes are not automatically defects. Open. |
| Effect-vector traversal | Assembly/workspace steps repeatedly inspect and search effects; static candidate, not yet a measured growth defect. Open. |
| Other loops and readers | Static inventory: 503 source modules, 2156 candidate I/O/proof sites and 689 loops, including six literal while-true loops. Counts are candidates, not defect totals. Executed caller coverage remains incomplete. |

Retain raw local reports, calibrated counters, source identities and original fixtures with the working-session evidence. These summaries cannot authorize execution or replace those originals. Complete all [P6-39 criteria](./phase-6-autonomous-delivery.md#p6-39--complete-harness-performance-audit-and-bounded-runtime-overhead) before closing the blocker.

[◀ Roadmap](./README.md) · [Journal](./journal.md)
