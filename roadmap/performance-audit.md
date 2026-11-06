# Harness performance audit

> **TL;DR** — P6-39 audits every unnecessary read, execution, write, lock, loop and retry. Runtime duration follows from that work; a fast path containing redundant operations is not complete.

> [!NOTE]
> **Status: 🚧 partial · 1.0 release blocker.** Preserve authority, current-input validation and original failures. The initial five-second total-controller ceiling does not replace operation-count and growth requirements. No complete coverage, platform parity or prompt comparison is claimed.

## Evidence boundaries

Operation counts below are executed on macOS arm64 with Node 24.22.0. Linux gates establish their stated correctness scope; Linux runtime profiling remains open. Windows/WSL2 and unavailable native accounts remain unvalidated. Synthetic clients and local publication transports establish no native-client, hosted-PR or model acceptance.

Distinguish direct process API calls, supervised IPC requests, logical event accesses, physical opens and filesystem metadata API calls. Do not sum overlapping inclusive timings or count IPC requests as additional observed OS spawns. Instrumented timing includes measurement cost. Never compare differently mutated fixtures, failed prefixes or different route outcomes as a speedup.

## Executed autonomous reference

The later exact source c227058 also completes an instrumented thirteen-stage reference in 175 seconds with fourteen successful synthetic receipts, zero human waits and local transport only. Both original environments are observed retired. Preserve original report SHA-256 ac3c8c08f0f100ed07f849519d0c805f3dd6519092b02970ea7ffba5b675a65a. Its controller still makes 7384 direct Git calls, 3451611 lstat calls, 3255133 exists calls, 7034 fsyncs and 260594 JSON parses; the waiting public CLI adds 941937 lstat calls. This remains unacceptable overhead. Do not compare its instrumented time with an uninstrumented reference as a speedup.

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

## Lightweight investigation loop

The maintainer initially directed static analysis and isolated component executions, consolidating changes before complete suites or routes. On 2026-11-06 the maintainer authorizes the consolidated full gate, fresh complete model-free rehearsal, equivalent outcome/count/time comparison and remaining-bottleneck investigation. Keep isolated component checks for each confirmed fix; avoid repeating minutes-long routes after every local edit. Required final checks and fresh route/platform evidence still determine acceptance.

```bash
node scripts/audit-performance.mjs --self-test
node scripts/audit-performance.mjs src/runner src/state src/gates
npx vitest run test/unit/gates/report-performance.test.ts test/unit/runner/environment-bindings.test.ts --maxWorkers=1 --disableConsoleIntercept
```

The advisory tool uses the existing Biome TypeScript parser and GritQL, with no new dependency or product-code import. It searches array callbacks and for/of/in/indexed/while/do loops for nested array searches, direct read/replay/JSON work and direct synchronous process calls. Calibration covers positive/negative cases, comments/strings, multiple arguments, indexed loops and reductions. It reports actual diagnostic locations; Biome's summary.matches counts processed files, not matched nodes. Never count candidates as confirmed defects. Aliases, indirect calls, repeated composed readers, freshness and complexity still require caller inspection and measured execution; zero matches is not clearance.

For each confirmed candidate, retain the original failure/count, execute the same small input at two sizes, compare exact outputs and bound the operation count as well as its growth. Count before assertions or serialization can inspect instrumented proxies. Add real filesystem/process controls only for changed ownership, durability or recovery boundaries; fixture preparation cost is separate from the measured component.

Apply the official guidance at the correct layer:

- [TypeScript's performance guide](https://github.com/microsoft/TypeScript/wiki/Performance) concerns compiler/editor work. [Types disappear during compilation](https://www.typescriptlang.org/docs/handbook/2/basic-types.html#erased-types); runtime I/O requires auditing the emitted JavaScript and Node calls.
- [Node's event-loop guidance](https://nodejs.org/learn/asynchronous-work/dont-block-the-event-loop) explains synchronous I/O and large JSON work blocking the controller. Making repeated reads asynchronous does not remove their work. First remove repeated traversals, unnecessary copies/serialization and no-op writes; then measure remaining blocking and bound concurrency without moving authority across effects.
- [Node's profiling guide](https://nodejs.org/learn/getting-started/profiling) and [performance hooks](https://nodejs.org/docs/latest-v24.x/api/perf_hooks.html) locate CPU/caller cost. Timing alone cannot establish necessity or replace operation counters, byte/ownership checks or cold/warm growth controls.

No installed TypeScript/runtime-performance skill was found in this session. Use the official documentation and existing toolchain rather than adding an unrelated skill or dependency.

## Executed isolated corrections after c227058

| Exact component | Original work | Corrected work | Evidence boundary |
| --- | --- | --- | --- |
| Repeated same-nonce cancellation | 100/400 atomic publications for 100/400 requests, each with file/directory synchronization | One/one while current content matches | Fresh registration validation retained; deleted/foreign/damaged content republishes; read-observation mutation attempt refuses |
| Foreground/native cancellation bodies | Unbounded reads; actual FIFO blocks ready readers and can disable native timeout | Bounded nonblocking descriptors; no unbounded read | Original negative controls retained; actual live cancellation, pre-launch cancellation, FIFO during polling and timeout checked; no persistent nonce cache |
| Full publication replay at 100/400 publications | 10950/103800 event-field reads; 70900/1123600 source-vector reads | 3200/12800 fields; 700/2800 positions | Same complete original hashes; pending ambiguity, current testing and exact prior approval retained |
| Exact grant-owner replay at 100/400 runs | 16050/244200 state-field reads | 1000/4000 | Historical owner map retained; registration cannot release the old grant to another run; complete original output hashes equal |
| Attempt generation replay at 100/400 claims | 10100/160400 signature operations | 100/400 private tuple operations | Exact complete output hashes; latest lane includes run/unit/role/cell, survives revisions and cannot revive terminal work |
| Repeated unit selection across 100 claims, 20/80 declarations | 2060/8240 unit-id reads after the single-lookup refinement | 80/320 | No complete index for repeated first id; different ids index once; revised declarations invalidate the private selection |
| Changed delivery projection at 20/80 units | Two serializations; 6642/17922 generated JSON bytes | One serialization; 3321/8961 bytes | Complete original/current event/state history and actual projection bytes identical; cache version/facet/path guards retained |
| Valid stale delivery projection at 20/80 units | Two serializations; 6608/17888 generated JSON bytes | One serialization; 3304/8944 bytes | All preflights precede repair writes; missing/current/idempotent/unsupported cases checked; generated JSON counters exclude newline |
| Fresh 32/128-transaction journal query | 32/128 segment opens, 128/512 lstat | One segment open plus its directory, four lstat | Same complete event/state hashes; cold reader still parses every event; active ranges preserve retired digest witnesses; legacy prefixes keep original read cost |
| All writes of those 32/128-transaction references | 496/8128 segment opens; 2016/32640 lstat; 192/768 fsync | 111/575 segment opens; 476/2428 lstat; same 192/768 fsync | Includes fresh pre-pack input comparison. Publications remain 32/128; journal bytes increase 26889/107846 → 93907/484981, with bounded size-tiered copying and no deletion |
| Twelve independent journal layout selections | Twelve parses/sorts of fresh entry lists | One parse/sort after twelve exact current-vector comparisons | Twelve active physical reads retained; changed names/witnesses refuse or rebuild; local replay identity survives nested other-store reads |
| Journal component platform controls | Final code snapshot, 83 cases | macOS 83 pass; Linux arm64/Node 24.22.0 83 pass | Exact runtime/test snapshot 9bff3a860aeab3fb7e4179ff28fe7e0f22afc6055ddd4813ce99691011b5cff0; container filesystem/no network; no whole-route parity claim |
| Full closure replay at 100/400 slices | 52402/809602 item-field reads after the standalone readiness correction | 1307/5207 | Exact complete state hashes; private chronological indexes; all 32 sync controls and 5000 differential histories pass |
| Positive scope readiness at 100/400 slices | 41601/646401 item-field reads | 1002/4002 | Same boolean result, every part/direct proof and receipt retained; 1000 original-source graph observations identical; no cross-query index |
| Sync publication prefixes at 20/80 merges | 15700/289200 event-field reads; 1590/23160 source-vector reads | 2299/9199 fields; 279/1119 positions | Exact earlier prefix only, same complete original state; 5000 differential histories preserve outputs/errors; original copied-array positions are outside the counter |
| Fresh reservation/receipt matching | 20000/320000 matching-key reads at 100/400 reservations | 200/800 | Exact outputs, schema-valid fixtures; no persistent index or admission relaxation |
| Fresh distinct-currency accounting | 20400/321600 currency-field reads at 100/400 currencies | 300/1200 | 1000 original-source differential cases identical; overflow, incomplete metering, orphan inventory and provenance retained |
| Sealed review inspection | 422 Git; 182925 lstat; 46909 opens; one no-op writer lock | 37 Git; 4427 lstat; 1425 opens; zero locks | Same complete original observation/evidence, journal and report unchanged; no invocation or authoritative/cache write |
| Sealed verification inspection | 247 Git; 122321 lstat; 31645 opens; two no-op writer locks | 30 Git; 4537 lstat; 1591 opens; zero locks | Same original observation/evidence; original suite/native proofs retained; same write/invocation guards |
| Sealed reverification attestation, after inner verification correction | 73 Git; 28617 lstat; 7682 opens | 30 Git; 4569 lstat; 1595 opens | Same original complete observation; missing predecessor metadata keeps original recovery; damaged predecessors do not retry |
| Gate report, 100/400 results with votes | 40850/643400 logical field reads | 900/3600 | Exact original JSON hashes, linear growth, zero process/filesystem work |
| Missing-result gate report, 400 units | 1200 unit-id reads; unused result indexes | 400 id reads; no result indexes or vote work | Same negative coverage; one necessary traversal to produce missing ids |
| Gate history, 100/400 planned rounds | 5150/80600 event-subject reads | 100/400 | Exact complete original JSON hashes; creation order and independent lanes retained |
| Suite history, 100/400 intents after gate-history correction | 21500/326000 event-field reads | 1400/5600 | Exact original JSON hashes; prior-plan linkage and whole-gate validation retained |
| Environment tuple/observation selection | Nested first-match scans plus a second private-claim lookup | Fresh first-match indexes, retained tuple vector; empty/single selections avoid indexing | Pure growth/operation controls and 22 real macOS ownership/cancellation controls; not a route measurement |
| Complete validation/render composition, 100/400 simple items | Current compatibility composition: 17800/71200 event fields | Combined factory: 10100/40400 | Identical 102/402 files and bytes; includes all validation work |
| Missing sync receipts, 100/400 items | 602/2402 item-field reads despite a necessarily negative answer | Zero | Closure/delivery absence remains false; no descendant can supply the missing receipt |
| Audit result/finding selection, 100/400 results with three votes per finding | 125050/2000200 field reads | 400/1600 | Exact original selected report/source hashes; lazy first-match indexes local to one audit |
| One native first-finding lookup among 400 results | 1600 field reads and full finding flatten | Three field reads | Exact original source, no complete index or unrelated finding construction |
| Launch draft validation/render, 100/400 metrics | 15250/241000 metric-id reads | 300/1200 | Exact original artifact hashes and pinned positions; exact coverage still required |
| Two independent measurement validations, 100/400 identical-zone metrics | 200/800 formatter constructions | 2/2 | One exact identifier validation per call; distinct/invalid zones still checked |
| Fixed note/link/update and create actions on existing history | Five/six full domain validations | Three each | Includes fresh final get; exact returned items/journal/projection bytes; generic callback checks retained |
| Native manifest reads in the same retained review | Seven unbounded reads/33040 extra body bytes plus required bounded reads | Zero unbounded reads; required two bounded reads/9440 bytes retained | Metadata increases from two to nine presence/proof calls; complete original observation and immutable report/journal retained |

[ADR-0240](../docs/decisions/0240-sealed-observations-bounded-cancellation-and-drain.md) retains fresh original recovery outside the preliminary read-only selection. Three focused real review controls and 44 admission/recovery/read-barrier controls pass. [ADR-0236](../docs/decisions/0236-index-fresh-gate-launch-integration-and-environment-selections.md) retains report policy, first matches, duplicate examination weight and all tuple checks before private claims. The combined five pure controls execute in hundreds of milliseconds including test startup. Strict types pass. Full gates, current Linux runtime measurements and complete-route counters are deliberately pending; these corrections do not close P6-39.

[ADR-0236](../docs/decisions/0236-index-fresh-gate-launch-integration-and-environment-selections.md) removes two additional history scans. Nine pure history controls and the earlier five report/environment controls pass together in 551 ms including test startup. Ten selected actual Git/process gate/suite workflow cases pass in 9.22s; 55 unrelated cases are explicitly omitted by that invocation. Preserve the initial invalid-policy fixture failure separately from the corrected measured original failure. Six selected attestation refusal/cancellation controls pass in 22.78s, with eleven unrelated omissions.

[ADR-0237](../docs/decisions/0237-render-validated-state-facts-and-replay-sync-in-order.md) reuses domains inside one fixed synchronous validation/render factory. Rebuilds call every domain once rather than twice/four times for gates, repeat validation on the next call and retain final post-callback corruption refusal. It also groups repeated owner selections and learning output. All 26 focused state/projection/mailbox controls and five selected mixed-domain cases pass in 3.77/2.94s; the latter omits 82 unrelated cases. A pure original-renderer comparison on the actual untouched retained canonical state history (19 events, ten files) preserves hash 77c9ac6672f52ddea83436a79e32f79de317a58b98a57b484b1dd3ccf963eec2 with 3731 → 2051 event reads and no writes. Six selected sync proof/transition controls pass in 3.18s, with thirteen unrelated omissions. Remaining 40400 accesses and per-append/domain scans are not certified minimal. Required full checks/routes remain deferred.

[ADR-0236](../docs/decisions/0236-index-fresh-gate-launch-integration-and-environment-selections.md), [ADR-0237](../docs/decisions/0237-render-validated-state-facts-and-replay-sync-in-order.md) and [ADR-0240](../docs/decisions/0240-sealed-observations-bounded-cancellation-and-drain.md) record the subsequent component corrections above. Twenty new component controls pass together in 1.61s. Forty-five state/projection/read-barrier controls, five selected launch workflow cases, two selected native refutation cases and ten native-scope/reader cases pass within their stated component scopes. The original FIFO read blocks until its owned-child watchdog; the corrected reader refuses without blocking. Keep Node API/body-byte counters separate from OS syscalls and physical reads. Full gates/routes and Linux runtime acceptance remain deferred; none of these measurements certifies total controller overhead.

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

## Owned append validation

[ADR-0239](../docs/decisions/0239-witnessed-journal-ranges-and-owned-incremental-replay.md) removes only the immediately repeated validation of replay's private result. At 20/80 retained runs plus one registration, validations fall from 42/162 to 21/81; every state is still checked before adoption. Retained-state refusal prevents delivery publication. All 50 focused controls pass in 4.00s. Full per-append history replay and latest platform/route evidence remain open.

## Owned incremental delivery transactions

[ADR-0239](../docs/decisions/0239-witnessed-journal-ranges-and-owned-incremental-replay.md) removes successful growing-prefix replay inside one transaction, retaining all current-input, per-append projection and publication guards. At 100/400 appends, replay event checks become 103/403 from 5350/81400. Complete-event JSON conversions, including source checks, become 303/1203 from 5650/82600; generated text bytes become 185589/737289 from 3473119/50659669. These are computation/serialization counters, not fewer persisted bytes. Caught failures rebuild successful history before further work. Four exact original/current publication comparisons and 5000 seeded histories agree, including 46088 accepted and 13443 refused incremental candidates. All 84 combined component controls pass in 12.18s. Independent transaction-boundary replay, repeated projection checks, remaining family scans and whole-route overhead remain open.

## Shared validation allocations

[ADR-0235](../docs/decisions/0235-bound-schema-and-text-validation-allocations.md) removes diagnostics for valid enums, repeated exact-pattern construction and character-array materialization. At 100/400 inputs, unnecessary enum maps become zero, one exact pattern compiles once, and the two declared text controls reduce 204800/819200 and 218700/874800 expanded characters to zero. Required regex, UTF-8, shape and content checks remain. Bound private expression retention by current strings; schema changes and invalid expressions stay fresh. All 145 config/source/plan controls and 42 validation/attribution/composition controls pass (the latter require actual process-table access; retain its sandboxed failure). A 418344-observation original/current comparison agrees across all UTF-16 code units and 5000 seeded cases. Full route/platform evidence remains separately scoped.

## Fresh budget replay subsets

[ADR-0238](../docs/decisions/0238-select-budget-and-queue-facts-in-one-pass.md) reduces one new sample's tracked usage-field reads from 1302/5202 to 900/3600 at 100/400 samples per stream. Four delta/six cumulative filtered arrays become zero; full facet hashes agree. All 44 focused budget controls pass, and 10000 original/current complete-state/error observations agree, including failures and subsequent unchanged state. This is one fresh traversal per sample; cross-event reservation/id scans and total-route costs remain open.

## Single-writer replay ownership

[ADR-0239](../docs/decisions/0239-witnessed-journal-ranges-and-owned-incremental-replay.md) transfers one private context only after complete current-byte/layout verification. At 32/128 independent transitions, replay event checks fall from 624/8640 to 32/128. All 114 journal/store controls plus five synthetic composition/process controls pass. Exact 32/128 multi-run comparisons retain complete hashes and all measured filesystem/durable-write counts while event JSON conversions fall from 592/8512 to 96/384 (495542/7156323 generated bytes to 80571/323154). Cold reads still parse everything. Reader facts and completed callback views remain independent of the taken writer context; failures discard or restore owned work without poisoning committed state. Retained context/history costs memory. Further constructor duplication, family indexes and total-route evidence remain open.

## Owned event construction

[ADR-0239](../docs/decisions/0239-witnessed-journal-ranges-and-owned-incremental-replay.md) computes each still-private new binding hash once; 100/400 constructors use 100/400 hashes rather than 200/800. External validation always recomputes integrity and preserves exact refusal order. All 76 focused controls and 20000 original/current construction/validation observations agree. No event bytes or input checks change. Independent journal candidate validation remains separate.

## No-mutation admission refusals

[ADR-0239](../docs/decisions/0239-witnessed-journal-ranges-and-owned-incremental-replay.md) rejects schema/digest/order/id failures before the recovery block because no private replay fact has changed. At 100/400 prior transitions, those refusals validate one event instead of 104/404. Full restoration remains after mutation. All 57 focused controls pass and the repeated 5000-history differential preserves every result, refusal and following state.

## Text validity without encoding buffers

[ADR-0235](../docs/decisions/0235-bound-schema-and-text-validation-allocations.md) removes explicit UTF-8 encoding/decoding used only for string validity. At 100/400 declared inputs, Buffer.from requests become zero from 402/1602, formerly requesting 345942/1383642 encoded bytes. Required byte quotas, content scans, control rules and actual raw-file/binary decoding remain. All 153 focused controls and 488913 original/current result/error observations agree. Node 20 availability is supported by its release documentation; actual host execution is on Node 24 and the local Node 20 binary is absent. No minimum-version or platform execution result is inferred from documentation.

## Fresh diagnostic accumulation

[ADR-0235](../docs/decisions/0235-bound-schema-and-text-validation-allocations.md) removes per-node diagnostic vectors, repeated required-field passes, per-key empty fallback objects and the intermediate uniqueness vector. At 100/400 valid objects, diagnostic vector API calls fall from 301/1201 to zero; fallback objects become one frozen sentinel from 100/400 allocations. Exact messages/order, sparse/getter snapshots, current schemas, independent results and full uniqueness serialization remain. All 217 focused controls and 20008 original/current result/error observations agree. These are component/allocation-operation counters; whole-route overhead remains open.

## Current-call budget views

[ADR-0238](../docs/decisions/0238-select-budget-and-queue-facts-in-one-pass.md) removes deep history copies from synchronous scalar policy readers and reuses admission's clock calculation. At 100/400 samples, a clock/admission pair changes from three facet copies and 300/1200 historical token reads to zero copies/reads; accepted admission reads ten limit fields once instead of twice. Public snapshots remain independent; all live reads, usage overflow refusals and authority guards remain. All 84 component controls pass on macOS, and 40000 original/current outputs/errors agree. Complete-route overhead and remaining queue/caller work stay open.

## Current queue reservation indexes

[ADR-0238](../docs/decisions/0238-select-budget-and-queue-facts-in-one-pass.md) replaces per-active-attempt assignment searches with fresh first-match indexes, retaining the short single-attempt path and all current authority/budget checks. At 100/400 active attempts, queue assignment fields become 100/400 from 5050/80200; selected-slot hashing becomes one from 100/400. Native evaluator admission groups only its required records and uses the same bounded lookup. All 48 component controls pass, and 10000 capacity plus 10000 evaluator comparisons preserve decisions/errors and complete projections. Remaining candidate scans and caller/polling work stay open.

## Foreground final pipe drain

[ADR-0240](../docs/decisions/0240-sealed-observations-bounded-cancellation-and-drain.md) consolidates released-owner liveness into one fresh policy observation, keeping active/released handoff, exact invocation, all binding/budget checks and closed dispatch. Twelve polls over two active segments read 24 rather than 96 segments; request/authority/plan reads become twelve each from 36/36/24. All 19 isolated and 17 actual process controls pass, and 120000 original/current policy decisions agree. Normal active polling already read the journal once and remains unchanged. Complete-route overhead stays open.

## Required budget history selection

[ADR-0238](../docs/decisions/0238-select-budget-and-queue-facts-in-one-pass.md) defers legacy prior-work scans until a start marker is absent, push counts until a viable push proposal and unmetered-work selection until hard requirements exist. At 100/400 prepared-effect/reservation rows, advisory non-push admission reads zero irrelevant history fields instead of 400/1600. Required hard-meter/push/legacy fallbacks remain. All 79 focused controls pass and 40000 original/current outputs/errors agree. Live report accounting and overflow refusal remain complete; this does not establish whole-route overhead.

## Integration coverage and overview consumers

[ADR-0236](../docs/decisions/0236-index-fresh-gate-launch-integration-and-environment-selections.md) selects ordered integration acceptance coverage in one case traversal. At 100/400 cases, applicability/criteria/fingerprint reads change from 20100/320400, 10200/160800 and 10000/160000 to 100/400 each. Original complete output hashes remain unchanged, all 13 focused controls pass and another 20000 original/current selections agree. Machine-only contract/procedure coverage, duplicates, order and independent returned arrays remain.

[ADR-0239](../docs/decisions/0239-witnessed-journal-ranges-and-owned-incremental-replay.md) fixes a discovered audit regression: overview's legacy-only filename preflight rejects current packed journals. Use the authoritative layout parser, preserving namespace and active-input bounds while avoiding opens/lstat of 7/31 superseded bodies at 8/32 runs. All 46 focused journal/read/watch controls pass. The complete overview folder has 176 passes and one sandbox notification failure; an independent watcher reproduces EMFILE, and all four CLI controls pass with actual filesystem notifications outside the sandbox. Retain both execution scopes. Complete-route overhead stays open.

## Current operator report observations

[ADR-0239](../docs/decisions/0239-witnessed-journal-ranges-and-owned-incremental-replay.md) reads a requested run and complete event source together, returning independent clones without copying unrelated projections. Status uses the same private budget/authority observation once: over two active segments, reads become two from six and authority inspections become one from two. Diagnostics read two segments from four, with zero authority inspections. All 60 related component controls and seven snapshot/current-byte controls pass, and sixteen complete actual-fixture original/current results/errors agree. No cached report, caller-supplied authority fact or writer path is introduced. Complete-route overhead remains open.

## Missing-path suffix construction

[ADR-0243](../docs/decisions/0243-single-writer-store-trust-model.md) replaces repeated front insertion with append and one final reversal. At 100/400 missing components, 100/400 unshift calls and 4950/79800 shifted positions become zero, while the identical 101/401 physical ancestor probes, one realpath, all containment checks and bounded retry behavior remain. All 36 path/race/observation controls pass. The reversal remains linear work; no I/O reduction or complete-route result is claimed.

## Workspace snapshot observations and remaining physical reads

[ADR-0240](../docs/decisions/0240-sealed-observations-bounded-cancellation-and-drain.md) replaces 12/48 same-workspace file reads with two inside fixed observations, preserving eight actual Git queries, bounds, environment inputs and independent results. It also corrects a reproduced freshness gap: final validation now refuses late tracked-byte, mode and link-target changes. All 81 core/Git/gate, thirteen actual review/native-gate and final ten isolated controls pass on macOS.

The unchanged retained review has the identical complete observed result and zero locks/writes/invocations. Opens/readSync/lstat become 848/1678/2419 from 939/1769/2510, with Git 37, fstat 1666 and exists 9071 unchanged. Single measured intervals are 399.87ms before and 424.73ms after; those unpaired instrumented samples are not evidence of a latency improvement and exclude setup/startup. The original baseline's same observation used 422 Git, 46909 opens and 182925 lstat; this is isolated stage evidence, never whole-route acceptance.

The original store retains 240 legacy segments unchanged. Calibrated classification finds 480 journal-file opens, 216 opens across 108 native-registration inputs and 7212 repository-marker probes. Additional common-ancestor and legacy-layout work needs separate freshness, quota and race evidence. No original report, journal or ownership is migrated, rewritten or rebound. An isolated common-ancestor absence-cache prototype falsely accepts three intermediate repository-marker cases (directory .git, file .git and bare HEAD/objects/refs) restored before final validation; the original refuses all three. Reject that prototype and retain regression controls. Sharing ancestor probes must preserve this intermediate refusal as well as resource bounds; final-state equality alone is insufficient. All 39 related path/observation controls pass on macOS and Linux, including the three new regressions. Remaining owned graph expansion, assertion pairs and repeated plan interpretation require separate measured caller analysis.

## Fresh Git environment fingerprints

[ADR-0240](../docs/decisions/0240-sealed-observations-bounded-cancellation-and-drain.md) reuses sorted serialization/hashing only after enumerating all current own keys and comparing every value. Across 100 calls with 100/400 fields, complete fingerprints become one from 100 while current value reads remain 10000/40000, including one read per value after a late mismatch. The private record has field/unit caps and larger inputs retain original behavior without retention. All 26 related controls pass and 20020 original/current fixture fingerprints/errors agree; actual environment values or hashes are never logged. The exact original sealed observation and physical/process counters remain unchanged. Isolated microbenchmarks improve; complete-route/startup acceptance remains open.

## Source criterion mapping

[ADR-0241](../docs/decisions/0241-index-current-plan-relations.md) removes per-mapping complete source splits and repeated criterion searches. At 100/400 mappings, requested split units fall from 17538900/280755600 to 175389/701889; criterion predicate visits fall from 5051/80201 to one. A lazy prefix index avoids an unnecessary tail traversal for sparse mappings. Complete output hashes and 2000 original/current output/error comparisons agree. Mac component controls pass; related Linux and remaining plan/caller inspection follow separately. Whole-route acceptance remains open.

## Dependency branch copying

[ADR-0241](../docs/decisions/0241-index-current-plan-relations.md) removes complete ancestor copies from the shared dependency checker used by slices, delivery, integration and environment recipes. Chains of 100/400 nodes perform 200/800 set additions instead of 5050/80200, with unchanged depth-first read order and cycle errors. All 135 Mac component controls pass; 20000 original/current decisions, read orders and input graphs agree, including injected read errors/mutations. Related integration/Linux controls and remaining plan relations follow separately.

## Current plan reference and coverage indexes

[ADR-0241](../docs/decisions/0241-index-current-plan-relations.md) removes repeated declaration/owner/coverage membership scans. At 100/400 criteria, measured string membership slots become zero from 55450/670900; required Set/Map membership and input validation remain. All 66 Mac component controls pass, complete hashes stay unchanged and 10000 original/current outputs/errors agree, including simultaneous faults. Keep original refusal precedence, current-call ownership and every graph/source/correction guard. Related Linux/caller and remaining producer/ancestor work follow separately.

## Complete milestone availability

[ADR-0241](../docs/decisions/0241-index-current-plan-relations.md) avoids work ancestor closures when preceding unique known coverage already contains every unit. At 25/100 units, 24/99 expansions over 300/4950 entries become zero. Both cycle checks and contract precedence remain, and incomplete coverage still needs ancestor proof. All 70 Mac component controls pass and 10000 complete original/current outputs/errors agree. Related Linux/caller and remaining producer/ancestor work follow separately.

## Contract producer prefixes

[ADR-0241](../docs/decisions/0241-index-current-plan-relations.md) removes repeated producer searches for multiple consumed contracts, while retaining short zero/one-reference handling. At 25/99 units, 300/4851 work predicate visits become zero. The index stops within a producer at the requested contract and never preloads an unused tail. Mac component controls and 10000 complete original/current output/error comparisons pass. Related Linux/caller evidence and complete gates/routes remain separate.

## Caller attribution of writes, Git and environment reads

A measurement-only preload added bounded caller labels (function names of the unminified bundle, six to eighteen frames), one-in-eight sampling for high-frequency filesystem and JSON calls, normalized store categories for durable replacements, file versus directory flush classification and changed/identical payload detection. It records no arguments, environments or bodies. On a calibration script it attributes exactly two replacements (one identical), two locks, one Git process and sixteen exists calls; on the source before these changes it reproduces the earlier measured controller's fsync, rename, Git, ps and mkdir counts exactly, with exists, realpath and JSON within 0.2% (polling-dependent).

Findings on the source before these changes: every one of the 7020 flushes came from the durable writer, two per replacement. 1298 replacements (37%) were lock owner metadata, 468 flushes were disposable delivery projections (10.7 MB of formatted JSON) and about 78 state projections replaced identical bytes. `repository()`, `namedBase()` and `codehostRepository()` caused 3546 of 6302 Git processes, nearly all through the base guard `observePlanBases` (614 calls). `EnvironmentResources.get` revalidated the whole snapshot chain on every read, with a quadratic observation-prefix comparison: most of the 11.85 million `JSON.stringify` calls. In integration, 1.3 million `existsSync` calls covered only 6320 paths, mostly complete environment-binding and operation listings repeated within one Docker query.

| Change | Decision |
| --- | --- |
| Reuse validated environment history prefixes; every snapshot is still read | [ADR-0244](../docs/decisions/0244-environment-and-docker-read-amplification.md) |
| Join repository identity and base queries: base guard 5 → 3 processes | [ADR-0243](../docs/decisions/0243-single-writer-store-trust-model.md) |
| Write lock owner metadata once without flushes | [ADR-0242](../docs/decisions/0242-flush-only-committed-facts.md) |
| Publish journal-derived views without flushes and skip identical views | [ADR-0242](../docs/decisions/0242-flush-only-committed-facts.md) |
| Read each environment binding once per Docker query; read each operation record once | [ADR-0244](../docs/decisions/0244-environment-and-docker-read-amplification.md) |
| Check created Docker resources on their creation inspection | [ADR-0244](../docs/decisions/0244-environment-and-docker-read-amplification.md) |

Attributed controller API calls, instrumented runs with identical functional outcomes (these runs include the attribution layer; their durations are not latency evidence):

| Counter | Before these changes | History, Git and write changes | Plus environment-binding and creation reads |
| --- | ---: | ---: | ---: |
| fsyncSync | 7020 | 3724 | 3628 |
| existsSync | 3198148 | 3095945 | 2233809 |
| realpathSync | 656006 | 645246 | 486039 |
| openSync | 173433 | 169060 | 132561 |
| JSON.stringify | 11854806 | 724736 | 692574 |
| JSON.parse | 260172 | 179312 | 149697 |
| Direct Git processes | 6302 | 4781 | 4781 |
| Supervised requests | 349 | 349 | 333 |

The single-writer trust model ([ADR-0243](../docs/decisions/0243-single-writer-store-trust-model.md)) then removed per-access ancestry walks and repeated base observations inside one decision, and in-process inspection ([ADR-0244](../docs/decisions/0244-environment-and-docker-read-amplification.md)) answered read-only Docker inspections without owned wrapper processes. Two defects of the first in-process version were found and corrected before measuring: its own synchronous endpoint lookup blocked cancellation, and serving daemon `info` in process would let a daemon identity check observe a socket learned earlier.

Complete route with the calibrated phase profiler on the final source (report fe044c1927d2982dfd9e3455acd267d6eabcf1004e45360249a8ade272df7e13, CLI 55398874945c40d238b3939f6f9faf2bd46e5dc1d8bbda07069a2b0fb0ede03b, controller 3134b3c0ed59d1bd095e50e34790c9906efb2a034d8e8f29902745318ef58d02; equivalent to both earlier references, zero overflow). Seconds are controller phase intervals; counters are c227058 → before these changes → current controller API calls:

| Phase | Seconds | Git | openSync | existsSync | fsyncSync |
| --- | --- | --- | --- | --- | --- |
| Bootstrap | 0.432 → 0.474 → 0.230 | 61 → 61 → 19 | 436 → 270 → 267 | 5230 → 5281 → 2512 | 20 → 20 → 14 |
| Plan | 0.409 → 0.381 → 0.169 | 40 → 40 → 18 | 516 → 301 → 294 | 4992 → 5154 → 1687 | 42 → 42 → 16 |
| Acceptance definition | 2.367 → 2.420 → 1.742 | 95 → 95 → 51 | 3459 → 1354 → 1310 | 23861 → 24113 → 8268 | 210 → 210 → 118 |
| Workspace | 1.136 → 1.049 → 0.576 | 140 → 140 → 76 | 2721 → 738 → 725 | 10976 → 11246 → 3815 | 80 → 80 → 34 |
| Build plan | 7.586 → 7.584 → 4.994 | 591 → 591 → 270 | 20440 → 4696 → 4549 | 80595 → 81336 → 29485 | 574 → 574 → 318 |
| Implementation | 2.061 → 2.002 → 1.372 | 96 → 96 → 49 | 7362 → 1083 → 1037 | 19512 → 19767 → 6482 | 196 → 196 → 100 |
| Commit | 2.207 → 2.032 → 1.186 | 291 → 291 → 183 | 11934 → 1475 → 1456 | 18013 → 18343 → 6299 | 118 → 118 → 52 |
| Verification | 32.408 → 29.694 → 12.674 | 859 → 642 → 308 | 189056 → 49148 → 22680 | 867302 → 857263 → 109695 | 1706 → 1702 → 472 |
| Review | 22.004 → 16.481 → 10.927 | 1721 → 1336 → 737 | 133852 → 8858 → 8533 | 187181 → 158456 → 55634 | 1290 → 1288 → 618 |
| Reverification | 5.433 → 1.581 → 0.817 | 690 → 213 → 104 | 58105 → 2010 → 1762 | 62637 → 35496 → 11986 | 56 → 48 → 20 |
| Integration | 49.271 → 41.083 → 17.325 | 1162 → 1162 → 970 | 405519 → 74545 → 34413 | 1340046 → 1340780 → 182974 | 2154 → 2154 → 552 |
| Acceptance | 11.804 → 9.081 → 5.633 | 521 → 521 → 327 | 51159 → 7178 → 5742 | 178756 → 179195 → 62043 | 412 → 412 → 218 |
| Publication | 10.826 → 8.494 → 4.993 | 538 → 538 → 364 | 46694 → 8084 → 6276 | 204543 → 205029 → 71664 | 122 → 122 → 44 |
| Handoff | 8.743 → 6.920 → 3.835 | 453 → 453 → 308 | 35958 → 7057 → 5273 | 195947 → 196055 → 68728 | 38 → 38 → 14 |
| Finalization | 3.432 → 2.745 → 1.473 | 126 → 126 → 94 | 9404 → 1806 → 1360 | 55542 → 55596 → 21961 | 16 → 16 → 6 |
| **Controller** | **160.120 → 132.021 → 67.945** | 7384 → 6305 → 3878 | 976615 → 168603 → 95677 | 3255133 → 3193110 → 643233 | 7034 → 7020 → 2596 |

Other controller totals, before these changes → current: realpathSync 654806 → 289378, JSON.parse 259894 → 124992, JSON.stringify 11849675 → 605084, renameSync 3510 → 1569, supervised requests 349 → 161, ps 422 → 234. The outer run, including setup and retirement, takes 174.854 → 148.035 → 77.762 seconds; the waiting public CLI 160.488 → 132.387 → 68.194. Two uninstrumented equivalent rehearsals of the same bundles take 74.55 and 74.35 seconds. These are single observations, not distributions; do not sum overlapping process intervals.

Remaining attributed costs and their reasons:

- Durable replacements: about 1300 remain, all committed facts or process ownership records (journal segments, intent and start records of supervised effects and model workers, environment bindings, native registrations, environment history). Each costs a file and a directory flush, about 3.5 ms on this host.
- Supervised requests: 161 remain — Docker effects, preflight, image inspection, 24 daemon identity checks that must follow the CLI's current target, and the synthetic model workers, whose time is external work with a real model.
- Base guard: 312 decisions × three Git processes; the remote URL stays a separate query because reproducing `remote get-url --push --all` would mean reimplementing Git's rewrite rules.
- Closure proofs: 234 `ps` tables, one per observed supervised process. A zombie-only process group is never `ESRCH` for `kill(-pgid, 0)` on macOS or Linux, so a kernel group query could replace most tables, but the current design defines the table as the observation source and an unavailable table as `unknown`.
- Review input preparation recomputes 251 private patch diffs; the workspace snapshot of each integration observation hashes every tracked file twice.
- Directory durability: replacements flush the file and its immediate directory, not directories created on the way. This predates the audit.

## Findings and remaining work

| Finding | Cause and status |
| --- | --- |
| Repeated complete proof reads | Original isolated endpoint: 4371 Git calls, 2011 journal reads and 1932733 lstat calls. Verified observation sharing retains exact bytes and revalidation; full-route amplification above remains open. |
| Quadratic state line splitting | Split once before iterating; corrected in 981a19e. |
| Observation quota regressions | Ordinary selections and original native registration members retain all projections under explicit bounds; corrected in edb12e0/a186e79. No cross-action authority cache. |
| Unbounded/overshooting lock waits | NaN, Infinity and clock rollback require an original-child watchdog; 0647c2c rejects invalid waits, uses monotonic time and one lazy bounded-sleep buffer. |
| No-op preflight/cache writes | Corrected in bea453e with first-write admission and read-only discovery; exact Linux fast/full gates pass. |
| Quadratic active/start matching | bea453e replaces full-history searches with ended-run and validated-prefix start indexes. At 400 completed runs, preflight event-field accesses fall from 2186016 to 102119; exact Linux fast/full gates pass. |
| Quadratic projection rendering | [ADR-0231](../docs/decisions/0231-shared-projection-traversal-and-selective-item-writes.md) shares environment traversal and indexes historical sync subjects. Same 100/400-item fixture: 47800/671200 → 7900/31600 event-field accesses, same 102/402 files. Other domain reducers remain open. 76224b8 passes exact Linux fast/full gates and 48 focused macOS controls. |
| Unchanged basic item rewrites | One note among 32 items: 36 → 3 atomic writes, 72 → 6 fsyncs, 33 → 0 unchanged rewrites. All path guards remain. Unrelated interrupted cache writes require explicit rebuild; workflow/artifact refresh is retained. 76224b8 passes exact Linux fast/full gates and focused macOS controls. |
| Duplicate environment report snapshot | Each current monthly segment opens twice → once, with the same replay validation and receipt. 76224b8 passes exact Linux fast/full gates and focused macOS controls. |
| Source descriptor/path completeness | Original controls accept four changes after the final descriptor stat. ADR-0234 checks final non-followed type/size/exact identity/timestamps using the existing syscall, and removes a zero-length negative-path read. Final gates pending. |
| EOF reads initially suspected redundant | Actual Linux procfs regular input declares zero bytes but contains 1123. Reject an exact-size prototype that falsely accepts empty bytes. Retain explicit EOF/extra-byte and quota proof; ordinary two-call reads are intentional, not a removed redundancy. |
| Parent and live guard polling | Twelve issued-host fixture callbacks each read every journal segment twice: live validation followed by redundant record basis lookup. ADR-0232 compares the basis inside the same fresh observation: all twelve now open each segment once; 47 focused macOS controls and exact Linux fast/full gates pass in 0a5be53. Parent waiting still makes almost one million metadata calls in the reference; its separate observation/drain paths remain open. |
| Repeated local Docker ownership matching | [ADR-0233](../docs/decisions/0233-fresh-batch-ownership-and-linear-object-matching.md) replaces repeated full label-history matches with exact response-ID lookup and one fresh owner after every backend response. Same 21-resource fixture: 43 → 5 complete history reads, 129 → 15 history-file opens, 2107 → 245 exists calls; four backend queries unchanged. All 153 focused macOS process/containment controls and exact Linux fast/full gates pass in bdce611. |
| Supervised backend/client queries | Exact request repetition measured above; inspect every caller and intervening mutation/readiness change. Required current probes are not automatically defects. Open. |
| Effect-vector traversal | Actual complete three-effect assembly and two-effect workspace each call effects.inspect three times for one report. ADR-0232 indexes one fresh vector per synchronous selection and refreshes across effects/cancellation writes, retaining first historical key matches. Both reports now read the vector once; 47 focused macOS controls and exact Linux fast/full gates pass in 0a5be53. Remaining replay and repository scans stay open. |
| Other loops and readers | Static inventory: 503 source modules, 2156 candidate I/O/proof sites and 689 loops, including six literal while-true loops. Counts are candidates, not defect totals. Executed caller coverage remains incomplete. |

Retain raw local reports, calibrated counters, source identities and original fixtures with the working-session evidence. These summaries cannot authorize execution or replace those originals. Complete all [P6-39 criteria](./phase-6-autonomous-delivery.md#p6-39--complete-harness-performance-audit-and-bounded-runtime-overhead) before closing the blocker.

[◀ Roadmap](./README.md) · [Journal](./journal.md)
