# Journal

> One entry per working session, newest first. What changed, what was decided, what is next. Short — the commits and ADRs hold the detail.

---

## 2026-10-19 · P1-10 — self-contained Claude generation; hooks and live discovery remain open

- Add the adapter interface and build --target claude --out with explicit dry run. Embed bounded regular canonical Markdown/JSON/YAML resources at development build time, reject symlinked/escaping inputs and omit unbundled TypeScript workflow sources. Render seventeen skills/eight agents, shared resources, a documented plugin manifest, executable copied core and versioned source/core/file hashes/modes. The installed output does not depend on this source checkout.
- Rewrite plugin skill commands to the bundled core through the documented plugin-root substitution. Require the conductor to pass the resolved root to agents; absent root returns a question rather than guessing PATH. Map declared tool capabilities and model tiers, with observer write tools removed and native plan restrictions. Native permission/managed-policy behavior remains unverified. Leave hook capability explicitly unimplemented until the common guard is connected instead of registering a missing command.
- Refuse unowned/edited/missing/mode-changed/unsafe output. Unchanged owned trees report already-correct; upgrades stage a new artifact tree and retain the exact previous tree at a returned backup path. Distribution artifacts are intentional build output, not repository runtime state. ADR-0047 records ownership, source containment, core version binding and conformance boundaries.
- Verify seventeen cases covering golden native output, complete embedded resources, deterministic ordering/source changes, capability/tier mappings, invalid paths/front matter/budgets, symlink/size refusal, unchanged/upgrade behavior, eight unsafe output modes, forged ownership paths and compiled generation/copied-core version/framing execution outside the checkout. Final review adds a bounded regular ownership-manifest preflight and a symlink fixture. All 663 tests in 46 files passed; full local check passed build, smoke, lint, typecheck, generated references/catalogs, docs, harness, Markdown and all 35 Mermaid diagrams.
- Run actual Claude 2.1.299 plugin validate --strict against an isolated generated artifact: Validation passed. Upgrade that same owned output with a retained backup and validate again: Validation passed. No plugin installation, actual skill listing/model execution, personal config edit or credential copy ran. Record static evidence separately in the conformance note.
- Keep P1-10 partial: hook registration is remaining code, and real install/discovery/permissions plus Linux/other Node versions remain owner checks. Continue other local adapter and common-guard implementation; those checks do not block it.

---

## 2026-10-19 · P5-03 — bounded headless process transport; live adapters remain open

- Add fanout run for explicit existing review/verify rounds with one shell-free stdin-fed process and external-store directory per assignment. Pin complete plan/review/suite identity and validate exact run/round/unit or finding/verifier plus existing public schemas. Reuse inspectGateRound/submit/refutation/verdict without changing coverage, thresholds, budgets or repair ownership. Verification requires its actual once-per-round suite first.
- Bound concurrency to 1–16, timeout to 100–600000 ms, input to 2 MiB and combined output to 1 MiB. Terminate then kill owned POSIX groups on timeout/cancellation. Crashed/invalid inspections remain unavailable; failed refuters add no vote. Detect observed workspace mutations, preserve edits and stop other workers. Retain status/exit metadata only, not prompt bodies or raw output. Round locks prevent concurrent conductors and require owner inspection after physical crashes; decided rounds cache without respawning.
- Add Claude/Codex recipes from installed help and primary docs with read-only/non-interactive restrictions and no reused conversation. Start Codex outside project configuration with ephemeral read-only execution; restrict Claude to read tools and disable ordinary customization/MCP. Parse only successful final structured responses. Actual managed policies/hooks, client logs, authentication and transient/ignored/external effects remain unverified. ADR-0046 records this boundary; no real model call ran.
- Verify eighteen new process cases: isolated PIDs/directories, actual concurrency, native/headless/sequential verdict/quorum parity, crash/timeout/output overflow/wrong assignment/wrong unit/malformed replies, failed refutation, active/queued cancellation, mutation preservation, stale locks, missing plans/suites, budgets, both compiled synthetic client transports and failed final-output decoding. All 646 tests in 45 files passed; full local check passed build, smoke, lint, typecheck, generated references/catalogs, docs, harness, Markdown and all 35 Mermaid diagrams. Correct raw command placeholders found by the early Markdown check before the final full run.
- Keep P5-03 partial: real per-client conformance remains an unchecked acceptance criterion, and OpenCode/Copilot recipes remain code work. Record both honestly without blocking other local tasks. Continue the P1 adapter/generator foundation using explicit unverified capability declarations; owner checks stay collected for the end.

---

## 2026-10-19 · P2-08 — canonical URL adoption and recoverable shared Define publication

- Add next URL/adopt with canonical credential-free HTTPS identity, tracking/fragment normalization, stored-link matching and explicit cross-initiative ambiguity. Import only complete matching revision-bound docs/items, batch missing owner/title before mutation, retain source digest/context and distinguish host reads from labelled imports. Concurrent/repeated adoption creates one initiative and no fabricated approval or completed step.
- Add explicit per-initiative local/shared mode with pinned destinations, atomic outbox creation for existing/future completed Define artifacts and unambiguously adopted research briefs. Keep standalone briefs local until adoption. The synchronous core queues only; SDK mode/complete wrappers flush through a supplied ProviderHost. CLI mode/requests/request/reconcile/report expose that same conductor boundary without claiming an authenticated MCP writer.
- Journal one artifact/target intent before external I/O. Preserve unrelated docs/tracker content with fresh revision reads and conditional updates, then require a separate complete same-reference read containing the exact marker-bound chunk before recording publication and links. Cache receipts, preserve lost-write ambiguity, refuse blind retries, pause new requests in local mode and retain pinned destinations on resumption. Rebuild sharing/outbox projections and bounded resume pointers outside repositories. ADR-0045 records these identity and recovery choices.
- Verify twenty-one new cases including canonical variants, cached/concurrent adoption, missing identity, six incomplete/mismatched reads, existing links/ambiguity, default local mode, switch-and-publish, future completion, adopted research, docs/tracker preservation, lost responses, exact-content verification, local pause, pinned targets, forged receipts, rebuild and compiled CLI handoffs. Update the old unsupported-URL fixture to require the new adoption questions. All 628 tests in 44 files passed; lint/typecheck/build/smoke/generated references/catalogs/docs/harness passed. Correct two Markdown path spans found by the final docs lint and rerun documentation/Markdown/Mermaid checks.
- Authenticated destination normalization/revision semantics, actual client outbox consumption, physical interruptions, imported-observation truth and Linux/other Node versions remain owner verification. No real provider write, project push or publication ran. Proceed to P5-03 headless engine; its real-client conformance stays a separate pending criterion.

---

## 2026-10-19 · P4-07 — sandboxed numeric grounding and absent-metric traps

- Add eval grounding and npm run eval:grounding with twenty original cases against the actual collectRampEvidence/collectImpact functions and an isolated data-only host. Pin seed grounding-v1-2026-10-19 and exact-byte digest 7342426d30c616b89f69e3a5a9533002bed2dd0992f20030625718bf7ae78899. No model, network, database or production query executes.
- Judge structured assertions against metric/unit/query hash/source/body hash and authored datapoints. Reject right-looking numbers from wrong provenance, omitted genuine observations, incomplete/duplicate cases, changed corpus digests and unknown-with-value. Actual zero and a signed points delta remain observations; absent/partial/wrong-unit/string/empty/non-finite/unsupported-source traps remain unknown. Failed scores exit 4.
- Export opaque, deterministically shuffled blind inputs without labels/reasons or unsupported-query counterfactual values. External predictions identify evaluator/provenance, which is metadata rather than proof of a real independent run. Report each seeded step and explicitly list framing/research/launch/decision narrative as unevaluated. ADR-0044 records this scope and semantic boundary.
- Record the synthetic core-grounding-collectors@1 baseline honestly: six numeric assertions, all grounded; fourteen trap metrics, all unknown; each of ramp/impact has three grounded assertions, seven unknown traps and zero failures. This is structural regression evidence on a small authored seed, not model quality, production truth or a causal estimate.
- Verify twelve cases for baseline reproduction, zero/signed values, five provenance corruptions, all fourteen reassuring-zero hallucinations, omitted real zero, digest/evaluator/coverage errors, malformed corpora, blind exports and byte-identical compiled CLI runs with failed-score exit. Correct a fixture's expected exit code and missing export import without weakening the judge. npm eval:grounding ran; full local check passed 607 tests in 43 files plus build, smoke, lint, typecheck, generated references/catalogs, docs, harness, Markdown and Mermaid.
- Real blind workers, independently reviewed labels, narrative/qualitative statistics, production query/cohort semantics, workload calibration and Linux remain owner verification. Those checks do not block local URL adoption/shared-publication implementation using the completed P2-06 host contract.

---

## 2026-10-19 · P4-06 — exact merge synchronization and recoverable tracker status

- Add sync with per-item repository/provider context, real gh/glab read hosts and explicit labelled normalized imports. Match complete published PR URL/repository/head/base/commit and non-draft merged state; unknown, mismatched and closed-unmerged sources never close work. Replay validates merge/closure/delivery receipts and prevents fabricated proof lists.
- Close parts before slices and require every current repository part even when the slice also owns a PR. Manual closure establishes no delivery. Mark scopes delivery-ready only after every certified slice and route to prepare-launch without fabricated step completions; final scope/initiative closure remains decide-next. Reopening invalidates old publication eligibility and stale projections until a new tested plan.
- Support explicit SDK tracker provider/ref/state targets with certified basis, complete revision-bound current reads, journaled unique intent, conditional transition and observed final state. Reconcile lost writes through reads; preserve ambiguity and later human edits without repeating or reapplying a write. Missing hosts/targets stay handoffs. The CLI supplies code-host reads/imports, not an authenticated tracker executor.
- Reuse existing conservative worktree cleanup outside the journal lock for certified merged work. Retain active/dirty/locked/non-owned/not-locally-merged allocations and every branch; stop no processes and fetch nothing. Add sync projections/resume refs and generic asynchronous routing for the one-word command. ADR-0043 records delivery versus outcome and recovery boundaries.
- Verify nineteen new cases for exact identity/state failures, unknown reads, multi-part closure including a parent PR, manual/reopened status, forged proof rollback, tracker read/write/verify and lost-response reconciliation, external-edit preservation, explicit handoffs, actual stopped merged Git-worktree pruning with branch retention, compiled imports, byte-identical rebuild and a no-change second run. Targeted sync/flow/utility tests passed; final local check: 595 tests in 42 files plus build, smoke, lint, typecheck, generated references/catalogs, docs, harness, Markdown and Mermaid passed.
- No authenticated code-host/tracker operation or actual project cleanup ran. Real server/revision semantics, imported-observation truth, scheduling, physical interruptions, squash/rebase integration cleanup and Linux remain owner checks and do not block grounding implementation.

---

## 2026-10-19 · P4-05 — offline rollout contracts; remote bridges remain open

- Add explicit provider test --fixtures execution with exact tool/argument/result transcripts, complete declared-operation coverage, duplicate/invalid fixture rejection and redacted failures. Metadata-only inspection stays unprobed. Fixtures make no authenticated call and do not establish actual server/tool/permission compatibility.
- Add fourteen rollout targets: native Slack/Teams/email drafts, LaunchDarkly/Unleash/GrowthBook/PostHog/config flags, five dashboard handoffs, Datadog/Grafana read mappings and Figma context. Preserve prior source mappings and bundle guidance/catalogs. Check upstream primary references and pin the Grafana recipe to 2.0.2 with read-only Prometheus/Loki categories; no container was pulled or run.
- Implement rolloutHost native artifacts in the external store: idempotent unsent drafts, explicitly unapplied flag proposals, pending exact-metric dashboard handoffs and contained explicit config-flag reads without repository writes. Return only control fields and a content revision. Missing virtual flag bridges fail instead of inventing disabled state; recognized toggle/apply mappings are rejected on reads as well as proposals.
- Verify twenty-one new cases including every target's declared bindings, complete coverage, malformed/changed results, real local draft/proposal/handoff/config artifacts, repeat idempotence, send refusal, config containment/missing fields, absent bridges, known toggle routes and compiled CLI fixtures. The first full run exposed three real regressions: mixed native handoffs incorrectly made remote sources available to research. Require an MCP/CLI declaration for mixed providers and retain a dedicated detection regression instead of changing source/concurrency expectations. Final local check: 576 tests in 41 files plus build, smoke, lint, typecheck, generated references/catalogs, docs, harness, Markdown and Mermaid passed.
- Keep P4-05 partial: remote flag readers and actual remote dashboard creation/normalization are unimplemented host-bridge work, not completed features or a claimed manual pass. Local chart specs explicitly report createdRemotely=false. Real client/API captures and permissions are needed to validate those bridges; preserve this gap in the roadmap/manual checklist and ADR-0042. Continue independent sync/grounding implementation with explicit typed hosts and local fixtures.

---

## 2026-10-19 · P4-04 — challenged human outcomes and guarded closure

- Add learn begin/challenge/decide/complete/report/schema and a challenger host that stops before the human outcome. Pin the exact completed impact report or clearly labelled self-report, original promise, unknowns/pending checkpoints, actual learn.decision guidance and effective profile. Require the current opposing argument, named person's written reason and acknowledgment of every gap; re-planning after changed evidence resets critique.
- Retain all four coverage areas across profile styles with one/two/three additional question budgets. Keep recorded decisions immutable and repeatable without duplicate work. Unflag requires a known flag identity. Keep/kill/unflag create local unapplied cleanup proposals only; no actual flag, code, tracker publication or Build runs.
- Iterate atomically records its call and creates/reopens an evidence-linked framing draft with all framing sections, owner-labelled validation/cost/stop questions and an active incomplete frame-problem run. Reopen only explicit closed pre-spec ideas without children in the same canonical repository; preserve developed initiatives and the current parent. Fix a real /tmp versus canonical-path comparison exposed by the reopen fixture.
- Guard canonical completion and atomically close the scope plus an eligible initiative. Replay prevents generic parent closure until every scope has a completed learning decision; manually closed or reopened siblings do not count. Reopen a parent before adding another scope. Rebuild decision/proposal projections and resume refs outside repositories. ADR-0041 records the identity, recovery and semantic limits.
- Verify seventeen new fixtures for standalone questions, missing/stale challenge and reasons, exact unknown acknowledgment, every outcome, cached decisions, new/reopened framing drafts, unsafe idea reuse, multi-scope closure/bypasses/reopening, actual checkpoint revisions, profile/guidance, journal-prefix recovery, canonical receipts, rebuild and compiled CLI. Return the post-completion report rather than a stale pre-closure view; keep a recovery test that does not duplicate an iteration or decision. Preserve the original owner in both metadata and framing questions when reopening an idea. Final local check: 555 tests in 40 files plus build, smoke, lint, typecheck, generated references/catalogs, docs, harness, Markdown and Mermaid passed.
- No real model, authenticated destination or production change ran. Real counterargument quality, person/self-report truth, source causality, client permissions, physical interruption and follow-up execution remain owner verification, without blocking later local tasks.

---

## 2026-10-19 · P4-03 — source-linked impact checkpoints and explicit digests

- Add measure begin/requests/observe/format/complete/report/schedule/digest/schema and the read-only analyst workflow. Pin scope/launch measurement revisions, exact queries/windows/units, actual launch anchors and report guidance. Ask standalone facts before creating history, reject early checkpoints and launch-anchor drift, support configured/custom offsets and expose due work in status/next without starting it implicitly.
- Preserve complete normalized finite scalars and genuine zero; missing providers, unsupported operations, unit mismatches and unavailable outputs stay unknown. Compute target verdicts/deltas in core; partial progress requires improvement from a known unmet baseline. Derived overflow stays unknown. Keep bounded sanitized qualitative quotes with source/query/window/hash separately from metric assertions. Reuse exact fingerprinted read import/planning across ramp and impact without remote execution.
- Load actual learn.report instructions and let the host choose a complete ID-only heading/order layout. Core constructs all numeric rows and provenance, invalidates stale layouts and guards canonical completion. Rebuild immutable run/latest checkpoint/delivery projections and bounded resume refs outside repositories. Repeated reports retain history; the explicit measurement exception invents no metric.
- Prepare stable multi-scope draft/comment blocks from completed reports. Explicit conductor dispatch creates unsent comms drafts or appends marker-bound document notes through a fresh same-operation read/revision, preserving unrelated content. Journal intent, cache receipts and retain ambiguity without retry. Document-body notes are not native threaded comments; tracker/native-thread extensions remain host-specific. ADR-0040 records these boundaries.
- Verify eighteen local cases for questions, due dates, exact queries, partial/missed/met arithmetic, absent data versus zero, unsupported reads, overflow, immutable inputs, malformed replay, layout/guidance drift, byte-identical rebuild, configured scheduling, grouped analysts, stop, measurement exceptions, explicit transcript imports, stable digests, same-read document preservation, ambiguous writes and compiled CLI. Initial fixtures exposed an empty mandatory parent section before subheadings; add meaningful parent content and correct the invented-receipt fixture to reach the canonical guard. Final local check: 539 tests in 39 files plus build, smoke, lint, typecheck, generated references/catalogs, docs, harness, Markdown and Mermaid passed.
- No actual model, authenticated source, remote draft or document update ran. Real query/cohort semantics, causal interpretation, client isolation, normalization, sensitive quotes, authenticated writes/interruption and Linux remain owner checks; these do not block the next implementation item.

---

## 2026-10-19 · P4-02 — evidence-bound human exposure stages

- Add ramp begin/requests/observe/decide/proposal/confirm/report/schema, a canonical skill and conductor SDK. Pin confirmed plans, actual ramp.criteria content and prepared launch measurement digests. Default stages are proposals; standalone entry creates no fake Define or merge history. ADR-0039 records the evidence and human-control boundaries.
- Preserve exact query/provider/operation/window/timezone/unit and raw-content hashes, accept only normalized finite scalars, and keep unavailable/incompatible evidence unknown. Required unknown/failing checks block go; optional open checks require explicit acknowledgment. Every decision records person/time/reason and exact evidence event; later observations invalidate it.
- Advance one stage only after a separate matching flag read or explicit manual attestation. Hold does not advance; confirmed rollback restarts at stage zero. Reject pre-exposure windows, detect changed/unavailable confirmed controls and require a fresh full window after restoration. Read snapshots do not prove continuous cohort stability.
- Keep proposals unapplied. Explicit flags.propose-change SDK dispatch journals once per decision, requires applied=false, caches receipts and preserves ambiguity without retry. Reject recognized toggle/apply routes; actual opaque server semantics remain owner checks. CLI request planning invokes no remote; exact fingerprinted response imports deduplicate identical reads while retaining each criterion. Rebuild stage/proposal projections and bounded resume references outside repositories.
- Verify sixteen new synthetic-host and compiled-CLI cases, including unknown versus actual zero, unit mismatch, explicit approvals, optional risks, stale/forged evidence, window boundaries, drift/restoration, rollback/manual controls, rebuild, receipt guards, read deduplication, unapplied proposal cache/ambiguity and known mutation mappings. Local check: 521 tests in 38 files, build, smoke, lint, typecheck, generated docs/catalogs and harness passed. Correct an unquoted placeholder caught by Markdown lint; final Markdown/Mermaid and docs/harness checks passed after the correction. No authenticated source, actual flag change or remote proposal ran. Linux, real client permissions/normalization and continuous control history remain on the manual checklist and do not block later implementation.

---

## 2026-10-19 · P4-01 — local launch kits complete; adapter isolation pending

- Add launch begin/complete/report/schema, a read-only launcher role/skill and typed drafting workflow. Ask missing standalone facts/measurements before mutation; create no fake Define/merge history. Load/pin actual comms.voice and launch.templates and supply effective profile instructions. Source scope measurements through the exact cut-scopes/spec revision, selecting owned metrics rather than the latest unrelated spec.
- Validate complete stage/metric coverage and reject invented metrics/query fields or fabricated receipts. Generate rollout/comms/support/one-pager/runbook artifacts and exact-metric dashboard specs with resolvable JSON pointers into the external measurement projection. Rebuild source/kit/delivery projections and retain local handoffs when providers are absent. ADR-0038 records revision, capability and observation boundaries.
- Keep provider invocation outside the launcher interface. The conductor SDK dispatches only comms.draft, dashboards.create and docs.create after a completed kit, journaling intent first, caching receipts and preserving ambiguous outcomes. Successful comms need explicit unsent-draft evidence. Reject recognized sending tool/routes and static send=true/draft=false mappings. Do not claim merge/flag readiness, and keep ambiguous send state unknown. No actual model, provider, message or flag operation ran.
- Verify twelve new local cases for loaded guidance, complete kits, exact dashboard provenance, rebuild/cache, measurement unknowns/exceptions, source revision/override rejection, stop behavior, draft/create dispatch, ambiguous outcomes, known sending routes and compiled CLI. The first full run had three five-second integration timeouts; the four affected cases passed serially. Give only the two-round Build table and three-round fail-safe table explicit ten-second integration budgets, retaining the general five-second limit and all assertions. Final local check: 505 tests in 37 files plus build, smoke, lint, typecheck, generated docs/catalogs, harness, Markdown and Mermaid passed. Final docs/harness checks passed after the new role/skill/ADR.
- Park P4-01 only for its real per-CLI adapter no-send acceptance criterion; it stays unchecked until P1 adapters/conformance can execute. Canonical metadata and synthetic hosts do not establish live isolation or server semantics. Authenticated drafting/publication, interruption reconciliation and real readiness remain owner checks. Continue dependent local rollout work without waiting for that manual criterion.

---

## 2026-10-19 · P3-10 — per-lens evaluation before and after refutation

- Add twenty-four original labelled snippets: two defects and two look-alike negatives per built-in lens under explicit contracts/repository standards. Pin metadata, labels and exact source bytes to seed gate-v1-2026-10-19, digest 67c02ee9f3d68fd43997cf15d6c4e16750298b14ddaeb4979405b92d6ca2d52b. Export blind inputs with opaque IDs, questions and source only, ordered by ID rather than labelled filenames.
- Add eval gates and npm run eval:gates. Require complete explicit observations, evaluator/provenance, exact digest and supported quorum; reuse the runtime result/vote validators and gateReport arithmetic. Missing cases, duplicate/unassigned slots, wrong lenses and changed seeds fail. Unavailable responses stay unknown, do not become confusion negatives and carry coverage; zero denominators remain null. ADR-0037 records the case-level/semantic limits.
- Record synthetic-gate-arithmetic@1 honestly: before TP 6 / FP 6 / TN 6 / FN 6, after TP 6 / FP 2 / TN 10 / FN 6. Recall stays 0.5; false-alarm rate changes from 0.5 to 1/6. Correctness/security retain the cautious false alarm because one verifier disagrees. These are controlled arithmetic fixtures, not model-quality or population estimates; no model or snippet executed.
- Verify eight new cases for baseline reproduction, independent before/after counts, unknown coverage, harmful unanimous refutations, larger quorums/silence, malformed predictions, blind exports, byte/label/path binding and byte-identical compiled CLI reports. Local check: 493 tests in 36 files plus build, smoke, lint, typecheck, generated docs/catalogs, harness, Markdown and Mermaid passed; final docs/harness checks passed after the new guide/ADR/protocol. Real blind workers, independent sessions, semantic label/finding matching and workload calibration remain owner verification and do not block subsequent local workflows.

---

## 2026-10-19 · P3-09 — declarative environment effects and undo receipts

- Add env declare/report with versioned immutable item/key declarations, explicit resource/effect/person and literal undo argv/cwd. Normalize cwd at runtime, preserve empty arguments/spaces, bound inputs and reject common credential-bearing flags/shapes/URLs without echoing values. Repeated semantically identical declarations are idempotent; conflicting keys roll back.
- Aggregate this subtree plus shared ancestors without unrelated sibling effects. Render recipes in reverse declaration order, rebuild JSON/Markdown projections and keep bounded resume references. Build and PR receipts include all then-current declarations and undo commands; current reports retain later testing effects without rewriting historical step artifacts. ADR-0036 records these boundaries.
- Keep declaration and execution separate: the ledger runs nothing, claims no cleanup success and does not infer an effect-free environment from an empty report. Actual resource ownership, dependency order, non-secret inputs and undo behavior remain owner verification.
- Verify nine new cases plus extended Build/PR receipt fixtures: literal non-execution, reordered-input idempotence, duplicate/changed recipe rollback, hierarchy selection, rebuild, credential flag rejection, closed/unknown items and compiled CLI cwd resolution. Correct two fixture mistakes (nonexistent close method and symlink spelling comparison). Local check: 485 tests in 35 files plus build, smoke, lint, typecheck, generated docs/catalogs, harness, Markdown and Mermaid passed. No undo command or external service ran.

---

## 2026-10-19 · P3-07 — tested draft plans and code-host publication

- Add pr prepare/tested/open/reconcile and the canonical open-pr skill. Prepare is local and loads/pins the actual repository convention, clean named branch/commit, target, remote and body. Recognize GitHub and GitLab templates; require completed sections and the shared commit/PR authorship policy. Ask missing standalone facts before mutation and do not invent machine gates.
- Require explicit human test notes and exact-plan approval before any publication host call. Changed code or a revised draft invalidates approval; a bare test-it decision cannot substitute for actual recorded test evidence. Planned build items retain their current verify/review requirements. Finish authorized commits before final gates because HEAD/index are part of the gate snapshot.
- Journal one request before external work, cache completed PRs and preserve ambiguous attempts for a complete same-reference read. Validate matching open draft, repository, source SHA/branch and target before recording publication/completion. Keep local links and parent-slice links; carry stored tracker and known sibling references. Remote tracker writes and later sibling back-links remain explicit host handoffs.
- Add gh/glab API mappings and bounded argv/stdin process hosts. Push the pinned object without force, then create draft-only JSON requests through existing credential stores. Normalize read/status, reject unrelated references and incomplete responses, redact raw errors and reconcile review-comment markers before posting again. ADR-0035 records crash, credential, race and host limitations; no authenticated remote operation ran.
- Verify sixteen new fixtures: real temporary Git repositories, a real push to a local bare repository, actual process stdin/error handling, synthetic GitHub/GitLab response contracts, exact approval invalidation, lost/concurrent writes, reconciliation, malformed drafts, templates, compiled CLI and comment reuse. Local check: 476 tests in 34 files plus build, smoke, lint, typecheck, generated docs/catalogs, harness, Markdown and Mermaid passed. Final docs/harness checks passed after the new skill/ADR. Live authentication, real-client isolation, remote races and Linux remain owner verification.

---

## 2026-10-19 · P3-06 — private incremental review and repository rubrics

- Add review begin/input/comment-plan/complete, the reviewer role and canonical skill. Standalone review asks for owner/base and a host-resolved PR head before mutation, creates an isolated review item/worktree and does not invent criteria or earlier steps. Current-PASS completion requires its canonical input-backed receipt.
- Capture changed-file trees through external Git objects and unique scratch indexes. Compare round one to the pinned base and later rounds to prior uncommitted snapshots, including newly changed paths, deletions, reverts, executable modes and symlink targets. Pin patch/rubric digests and reconstruct inputs on resume; reject missing objects, duplicate/late inputs and weakened rubric bytes/bindings. ADR-0034 records retention, secret-exclusion and host boundaries.
- Load actual repository/user rubric content for reviewers and refuters in both Build and standalone hosts. Carry previous kept findings for rechecking. Draft codehost.comment-pr locally and require an explicit typed host request to publish; tests use a custom synthetic provider and post nothing. Built-in GitHub/GitLab execution follows in P3-07.
- Find and fix a real index mutation: Git diff refreshed stat entries when a file was restored to its original bytes even with optional locks disabled. Disable diff.autoRefreshIndex and retain an exact-index regression alongside containment checks. Correct fixture configuration/version and ensure preparation commits actually succeed.
- Verify eleven new real-Git/compiled-CLI fixtures with synthetic semantic workers, plus existing Build cases. Local check: 460 tests in 33 files, build, smoke, lint, typecheck, generated catalogs/docs, harness, Markdown and Mermaid passed. Final targeted review checks cover explicit deterministic diff flags. Live clients/models, authenticated PR resolution/comments, semantic rechecking, sensitive-source review and Linux remain owner checks and do not block subsequent implementation.

---

## 2026-10-18 · P3-05 — executable verification and shared suite receipts

- Add verify begin/suite/complete and the verifier role/skill. Standalone verification asks for missing criteria, ownership, comparison base and host-resolved PR head before mutation, then provisions an isolated branch worktree without invented prior steps. Invocation overrides cannot replace recorded criteria.
- Select declared aggregate checks or test/typecheck/lint commands; instruction-file bindings require host-selected declared refs. Persist suite intent before argv execution, serialize concurrent callers through the journal and return cached receipts rather than rerunning. Interrupted intents remain explicit ambiguity. Bound commands/output and kill POSIX process groups on timeout; raw output is transient and durable receipts hold exit codes/signals and byte hashes. ADR-0033 records these choices.
- Add core constant-assertion findings for changed tests plus a separate semantic test group. Skip strings/comments and preserve the limit: structural lint does not prove mutation sensitivity. Actual failed process observations remain mandatory even when all associated findings are refuted. Canonical completion requires its successful suite and current verify PASS.
- Share read-only worker scheduling across builder and verification hosts. The binary awaits an async process dispatcher while the synchronous programmatic router remains compatible. Fix the isolated CLI fixture to resolve npm beside the running Node before replacing HOME, avoiding owner-specific asdf shims without changing production PATH behavior.
- Verify 23 new cases with actual fixture processes/Git and synthetic semantic workers: once-only/cache/concurrent callers, interrupted intent, failed exit, timeout, mutation, criterion override rejection, PR questions, constant assertions/look-alikes, shared host execution and compiled async CLI. Local check: 449 tests plus build, smoke, lint, typecheck, docs, catalogs, harness, Markdown and Mermaid passed. Authenticated PR checkout, real-client isolation, broader mutation testing, external suite effects and Linux remain owner checks; the local execution was macOS/Node 24.

---

## 2026-10-18 · P3-04 — repository-first builder host and green receipts

- Add build route/agree/preflight/prepare/plan/complete/schema, the builder role and canonical skill, and a shared typed-host workflow. Route scopes to ready leaf work; require explicit testable criteria agreement for ad-hoc slices. Host issue reads pin complete same-reference revisions; CLI agreement records supplied evidence without claiming to fetch/authenticate it.
- Resolve and load repository/user build guidance before implementation. Journal the builder plan against the prepared code snapshot; unresolved assumptions require an exact-plan human decision. Keep plan references in bounded resume packs and replayable projections. ADR-0032 records these boundaries.
- Run verify then review, route kept findings to repairs, rerun verify after code-changing review repairs, preserve partial units on resume and stop at exhausted budgets. Guided/staged/parallel scheduling keeps identical coverage; staged leases one complete gate round at a time. Observe the personal checkout around host actions and preserve violations rather than resetting files.
- Construct completion receipts only from both current gate passes after the latest plan. Keep human testing pending and perform no push/PR. Green builds unblock dependencies without closing their items; active rebuilds block them again. Refuse stacking that would omit uncommitted predecessor files.
- Verify seventeen builder integration/conformance fixtures with real temporary Git repositories and synthetic workers, including loaded skills, actual worktree edits, repair loops, assumption revision, stop/resume, pacing, issue reads and compiled CLI actions. Update the former build stub snapshot and routing expectations. Local check: 426 tests plus build, smoke, lint, typecheck, docs, generated catalogs, harness, Markdown and Mermaid passed. The five-round and multi-item dependency cases have explicit integration timeouts; other unit limits remain unchanged. Live client isolation, authenticated tracker normalization, actual project suite execution and human testing remain owner checks or subsequent tasks.

---

## 2026-10-18 · P3-03 — pinned gate rounds and deterministic verdicts

- Add gate plan/submit/verdict/schema, six built-in review lenses, manifest applicability, explicit disabled reasons, per-criterion verify coverage and versioned result/refutation contracts. Pin repository/base, prompts, policy digest, criteria and quorum; reject weakened built-in fail-safe defaults and policy changes mid-run.
- Count rounds from the journal, enforce project/run budgets in 1–10, default verify four/review three, and require an explicit larger budget with a reason for extension. Missing/unavailable units block PASS; exhausted runs cannot reset implicitly. Ordinary findings need majority active refutations; correctness/security need every verifier to refute. ADR-0031 records the stricter fail-safe boundary and host limitations.
- Snapshot branch, HEAD, index entries, file bytes/modes and symlink targets. Reject submissions after changes and seal failures without restoring files. Preserve historical verdicts and report STALE after a subsequent change. Rebuild round projections and route compact verdict pointers through the builder mailbox.
- Exercise stubbed workflows for pass/fail, every supported quorum, silence, uncertainty, exhausted/extended budgets, duplicate/stale submissions, forged PASS rollback, manifest policy, detached branches and seven classes of workspace mutation. The compiled CLI covers planning through results, refutation, exhaustion and extension. Local check: 409 tests plus build, smoke, lint, typecheck, docs, catalogs, harness, Markdown and Mermaid passed. Suite execution, incremental review, genuine host independence, ignored/external state and Linux remain subsequent work or owner verification; no model or authenticated provider ran.

---

## 2026-10-18 · P3-02 — recoverable isolated worktrees

- Add worktree create/open/stop/list/prune with deterministic topic names, explicit named bases, stacked integration targets, external paths and disjoint ten-port leases. Preserve stopped/failed reservations until conservative pruning; expose allocations in status, resume and replayable projections.
- Journal the intent before Git, serialize lifecycle mutations separately from the store lock, recover matching interrupted provisioning and preserve every branch. Prune only stopped, clean, owned, unlocked work merged into its recorded integration base or explicitly abandoned with a reason. The checkout opt-out is clean/exclusive and restores the original checkout on eligible cleanup. ADR-0030 records the safety/recovery boundaries.
- Run real Git fixtures covering parallel processes, spaces in paths, exact original branch/index/files, interrupted ready receipts, symlink escapes, hooks, stacked bases, port exhaustion and cleanup refusal. All 368 tests passed. Bound test-file concurrency to two workers because the process fixtures already test concurrency and unrestricted workers exhausted existing five-second test timeouts; the timeouts remain unchanged.
- Build, smoke, lint, typecheck, generated catalogs, docs, harness, Markdown and Mermaid checks passed. Only macOS/Node 24/Git 2.49 ran locally. Worktree open suggests commands without running tests or recording human approval; stop manages the lease, not arbitrary processes. Real project environments, ignored files, submodules/LFS, physical interruption recovery and Linux remain on the owner checklist and do not block further implementation.

---

## 2026-10-18 · P3-01 — vertical slice plans and contract-first parts

- Add slice-work with versioned metadata, standalone minimal initiative/scope entry, repository-first drafting guidance, slice planning/check/schema commands and a fixed slicing challenger mode. Require a single declared outcome, end-to-end demonstration, testable criteria and linked test cases.
- Pin scope/spec revisions and preserve every inherited criterion unchanged. Publish stable-key slices and at most one part per repository atomically with local tracker refs. For multiple repositories, the contract-owning repository's part includes its implementation and precedes all peers; default slice order is sequential unless explicitly overridden. ADR-0029 records the tradeoffs.
- Reject cycles across new/stored dependencies, cross-scope references, repository aliases, changing stable part identity and implicit reopening. Next selects ready slices/parts or asks between independent choices; bounded resume context now carries ancestor approvals too. Remote tracker items/relationships remain pending host writes.
- Verify malformed/valid fixtures, one-to-four repository cuts, journal rollback, repeated identity, exact criterion coverage, approval/source revisions, repository guidance, inherited resume decisions and compiled CLI planning-to-contract routing. Local check: 355 tests plus build, smoke, lint, typecheck, docs, catalog drift, harness and Mermaid passed. Semantic verticality, real Git eligibility/worktrees, building and live remote mirroring remain subsequent work or owner checks.

---

## 2026-10-18 · P2-09 — reproducible definition defect evaluation

- Add thirty original labelled artifacts across problem/spec/criteria/scopes, including look-alike negatives and two semantic defects the core cannot detect. Keep the fixed seed and committed report under test/evals/definition.
- Add eval definitions and npm run eval:definitions. Report per-class TP/FP/TN/FN, recall, precision and false-alarm rates; bind labels and exact bytes into the corpus digest. External host predictions must match the digest and cover every case exactly once. ADR-0028 separates evaluation arithmetic from live execution evidence.
- Baseline core-definition-lint@1, seed definition-v1-2026-10-18, digest a545e4b2c0d37a8a8b83b41f6b044722cba95e23203fc51d8229368630e671ea: 30 cases; TP 18, FP 0, TN 340, FN 2; micro recall 0.9, false-alarm rate 0. Supported structural classes retain full recall on this small seed. Semantic-conflict and independent-delivery each miss their positive case; the report preserves both instead of presenting lint as semantic approval.
- Verify the baseline, independent confusion arithmetic, invalid/omitted external predictions, corpus mutation/escape rejection, and byte-identical compiled CLI runs. Local check: 330 tests plus build, smoke, lint, typecheck, docs, catalog drift, harness and Mermaid passed. No model ran; blind host challenger evaluation remains owner verification.

---

## 2026-10-18 · P2-07 — source catalog and explicit missing observations

- Add eleven source mappings with bounded tool-specific guidance and synthetic query fixtures: nine analytics/BI/errors/support providers plus Confluence/Notion knowledge. Enforce open-question degradation on every source mapping and retain complete observed content separately from inferred claims.
- Pin exact queries and explicit timestamp/timezone windows; failed, pending or incomplete responses remain answerable unknowns without copying raw tool errors. Use BigQuery's read-only operation and an optional PostgreSQL process host with single-query scanning, stdin, server read-only transaction, timeout and rollback. No database or live source was queried.
- Permit only the credential-free mode=tools|cli installation parameter needed by PostHog's roster. Do not infer Zendesk availability from curl. Fix mutable built-in manifests leaking between registry loads and make workflow assertions cover every detected source rather than assuming two defaults. ADR-0027 records the choices.
- Local check: 325 tests, build, smoke, lint, typecheck, docs, catalog drift, harness and Mermaid passed. All eleven provider checks run through the isolated compiled CLI. Live region/schema/auth/cost/window behavior and PostgreSQL role privileges remain owner verification.

---

## 2026-10-18 · P2-06 — destination code complete; live recordings pending

- Add eight destination manifests and tool-specific bounded guidance, verified against official documentation: GitHub/GitLab Issues, Jira, Linear, Confluence, Notion, Google Docs through optional gws, and repository docs. No integration installation or authenticated write was performed.
- Generate a self-contained provider catalog with drift checks and inherited embedded guidance. Add the typed host invocation boundary and mandatory same-operation document read-modify-write. Preserve full snapshot/revision, skip no-op updates, reject incomplete reads, and retain pending async status. ADR-0026 records the boundary.
- Exercise actual temporary repository-docs creation/update, path escapes and stale conflicts. Run all eight provider tests through the isolated compiled CLI and synthetic host transcripts. Keep the live recorded-response acceptance criterion unchecked rather than relabelling synthetic output as a capture; park only that manual verification while implementation continues elsewhere.
- Local check: 296 tests, build, smoke, lint, typecheck, docs, catalog drift, harness and Mermaid passed. Vendor normalization, OAuth, rich formats, remote revision semantics and real links remain on the owner checklist.

---

## 2026-10-18 · P2-05 — challenger modes and definition checks

- Add read-only problem/spec/criteria/scopes challenger plans with fixed coverage, source digests and transient challenge overrides. Tone and the additional counter-question limit change across dials; required checks and structural findings do not.
- Share criteria lint with spec completion. Optional numeric assertions detect impossible equality/exclusion or open/closed bound pairs only with identical subject, context and unit. Keep vague wording, meaningful tests and unique IDs checks. ADR-0025 explains why prose is not parsed as a constraint language.
- Wire canonical skills and the challenger role to the executable plans. Verify labelled good/bad fixtures, numeric edge cases, separate contexts/units, journal rollback, all mode/dial instruction snapshots and compiled CLI operation.
- Local check: 276 tests, build, smoke, lint, typecheck, docs, harness and Mermaid passed. Live semantic critique/read-only enforcement and broader logical consistency remain owner/client verification.

---

## 2026-10-18 · P2-04 — measurable scopes and inherited approval

- Add cut-scopes, a versioned plan/schema, a single-scope suggestion and batched delivery questions. Read repository flag naming before drafting; retain explicit delivery/complexity reasons.
- Pin spec identity and require metric/story coverage. Create stable-key child scopes and local tracker references in one transaction; reject unknown references, dependency cycles and implicit reopening. Omitted scopes remain intact. Remote tracker publication stays pending.
- Carry revision-bound parent approvals into child plans and recheck them on completion, preventing stale approvals or explicit child IDs from bypassing review. Continue an initiative through its sole scope or ask which to use. ADR-0024 records these boundaries.
- Verify schema defects, missing ownership rollback, local/remote tracker status, repeat identity, stored dependency cycles, source revisions, parent decisions, repository naming guidance, compiled CLI execution and deterministic rebuild. Semantic scope independence and actual remote mirroring remain owner/client verification.

---

## 2026-10-18 · P2-03 — testable specs and pinned measurement plans

- Add the write-spec skill and host drafting workflow, standalone problem/owner/impact entry, repository-first guidance and additive manifest template sections.
- Validate versioned story/criterion IDs and falsifiable tests, the initial vague-word lexicon, metric provider/query/baseline/target/window and structured rollout. Unknown baselines require an answerer and tracking story; no metrics requires an explicit measurement exception.
- Persist the exact authored metadata in the spec artifact. Local publication reuses records; remote destinations remain pending. Standalone completion advances from existing output without inventing earlier skips.
- Stop at a revision-bound human approval. Rejected specs can be revised, unfinished drafts cannot be approved, and completing another revision requires a fresh decision. ADR-0023 records the schema and approval choices.
- Verify valid/defective fixtures, repository guidance read-before-draft, custom required sections, missing input without mutation, rejection/revision, compiled CLI execution and byte-identical replay. Live semantic critique, source queries and external writes remain manual conformance.

---

## 2026-10-18 · P2-02 — complete local framing and explicit no-go

- Require all eight framing questions plus ownership; validate unresolved placeholders as TBD markers naming missing evidence and an answerer. Keep challenge intensity in the existing style block without changing coverage.
- Adopt completed research briefs with pinned artifact references and reuse normalized titles only inside the same recorded repository. Explicit IDs resolve ambiguous/unscoped matches; independent repositories keep separate initiatives. ADR-0022 records the identity boundary.
- Journal go/dropped/on-hold outcomes; no-go retains its reason in a readable note, on-hold requires a reopening condition, and closed work cannot restart implicitly. Local docs/tracker publication reuses store records; remote publication remains a pending, durable handoff.
- Verify full framing fixtures, invalid unknowns, repeat execution, separate repository identities, brief adoption, no-go rollback/reopening, compiled CLI execution and pending remote publication. Live challenge/research escalation and remote writes still need client/provider conformance.

---

## 2026-10-18 · P2-01 — source-bound research and evidence briefs

- Add the research skill, researcher/challenger roles, angle/result/examination schemas and a shared native/sequential scheduling workflow within budget.
- Pin source coverage and configurable strict-majority refutations per brief run. Journal source results and unique verifier slots; unavailable sources and silent/uncertain examinations remain explicit open questions.
- Complete only the deterministic aggregate, retaining evidence and dropped-claim reasons for replay. Attach briefs to existing initiatives/scopes without guessing ownership; ADR-0021 records the persistence and independence boundary.
- Verify stubbed-agent workflows, failed sources, native/sequential equivalence, quorums of 3/5/7/9, duplicate-voter rejection, pinned settings, compiled CLI execution and byte-identical rebuilt briefs. Live tool access, independent sessions and client fan-out remain on the manual checklist.

---

## 2026-10-18 · P1-12 — first canonical skills and local entry utilities

- Add next, status, setup and frame-problem skills, the conductor agent and shared question/output protocols within their enforced portable budgets.
- Add local CLI utilities: next routes sentences and stored IDs without repeating completed work, asks about ambiguous items and human decisions, and stops at unavailable steps; status reads state without consuming messages; setup validates a complete selection before one scoped settings write.
- Verify the compiled sentence-to-initiative-to-artifact-to-receipt path, repeated/resumed runs, explicit ownership, decisions, read-only status and atomic setup. Canonical resource checks enforce front matter, budgets and hard-rule mapping.
- Live skill execution and generated client installation remain manual/unimplemented until P0-03 and the adapter tasks. Document these limits instead of treating CLI workflow tests as host-client conformance.

---

## 2026-10-18 · P1-09 — layered template, profile and lens catalogs

- Load the three manifest kinds through a shared catalog with repository/user/package/built-in precedence, replacement or recursive inheritance, cycle detection and resource-origin preservation.
- Validate against public schemas; reject removal of required template sections with their dependent step, unsafe prompt paths and prompts exceeding forty lines. Scaffold prints a kit or explicitly creates a new directory without overwriting.
- Connect custom profile selection to layered configuration, transient overrides and step preflights; preserve personal precedence and coverage invariants. File versions remain mandatory while in-memory overrides stay partial.
- Verified the complete local suite, including compiled CLI scaffold/test/list round trips, npm manifest-only packages, all profile combinations, required sections and inherited prompt resources. Gate execution and full workflow template consumption remain later tasks, documented in the owner checklist.

---

## 2026-10-18 · P1-08 — provider registry and credential-free MCP rendering

- Add the safe capability taxonomy, strict provider manifests, layered inheritance and bundled local/native providers; default docs and tracker resolution works without integrations.
- Inspect supported MCP configuration declarations and executable presence without probing authentication or running manifest commands. Print golden-tested HTTP/stdio snippets for four clients, with credential references only and no automatic installation.
- Reuse the already-locked smol-toml parser as a direct development dependency for Codex TOML. Verify the complete local suite including schema/runtime taxonomy consistency, inheritance and bounded guidance, snippets and isolated compiled CLI execution.
- Record pending owner actions in roadmap/manual-verification.md. Live provider calls, authentication, client conformance and Linux/Node 20 execution remain unverified; no push or publication was performed.

---

## 2026-10-18 · P1-07 — repository discovery and explainable slots

- Discover supported CLI guidance, skills, agents, conventions, quality files, design assets and declared commands without executing repository commands.
- Resolve slots by explicit configuration, repository tags, rules, user skills and harness fallback; ties and weak matches become questions. Cache inventory outside the repository with content fingerprints and report skipped unsafe paths.
- Verify six repository snapshots, monorepo manager inheritance, ambiguity, cache invalidation, symlinks, malformed manifests and prototype-name command keys alongside the complete local suite.

---

## 2026-10-18 · P1-06 — interaction profiles

- Expose profile inspection, preset selection and explicit user/project/run dial overrides with a style block capped at ten lines.
- Keep run overrides transient. Render communication choices without changing lens coverage, questions, checks, output shapes or required decisions; list core invariants with executable enforcers.
- Verify twelve preset/verbosity snapshots and all 324 dial combinations, plus scoped settings and natural-language override contracts in the complete local suite.

---

## 2026-10-18 · P1-05 — step and question contracts

- Register all thirteen steps with explicit inputs, outputs, checks and decisions; only minimal frame-problem completion is available until full workflows land.
- Record starts, validated artifacts, skips with reasons and revision-bound human decisions in the journal. Batch missing input questions before mutation; remember answers only at explicitly chosen scopes.
- Verify every step from empty/input/initiative entry, idempotent runs, shape validation, scoped answers and decisions that survive skips; complete local checks passed. Full workflow behavior remains tracked in P2/P3.

---

## 2026-10-18 · P1-04 — durable mailbox and bounded resume context

- Add local message threads and independent reader/role cursors, with explicit peek and handoff operations; rebuilding projections preserves read positions.
- Generate deterministic resume packs with references rather than artifact bodies and an enforced 6144-byte UTF-8 ceiling, including truncation and total counts.
- Verify restart/rebuild behavior, invalid cursor rollback, Unicode limits and a fifty-descendant snapshot alongside the complete local check suite.

---

## 2026-10-18 · P1-03 — external journal and item projections

- Add typed items, notes, links and readable projections under the external XDG store, rejecting repositories, traversal and symlink escapes before writes.
- Use one lock and atomic monthly journal replacement per validated transaction. Reads replay the journal so projection recovery remains deterministic after interruption; ADR-0020 records why stale locks are not stolen.
- Verify replay, batch rollback, corruption handling, lock contention and twelve concurrent real writer processes alongside the complete local check suite. Physical process-interruption checks remain owner verification.

---

## 2026-10-18 · P1-02 — deterministic layered configuration

- Define the strict public schema and deterministic user/project/initiative/run loader, with source explanations, personal/team precedence, per-key map merging and array replacement.
- Reject unknown keys, duplicate YAML mappings and missing explicit layer files. Expand preset defaults in each layer before resolving precedence.
- Generate the configuration reference from the same schema; verify the full local check suite including precedence and malformed configuration fixtures.

---

## 2026-10-18 · P0-06 — commit hygiene enforcement

- Enforce Conventional Commit subjects, explanatory bodies and the no-tool-attribution rule through one validator shared by the CLI, optional local hook and CI range check.
- Keep hook installation explicit and preserve an existing custom hook path. CI resolves the actual pull-request base/head and never evaluates message content as shell code.
- Verified the full local check suite, real hook execution in an isolated repository, malformed messages and pull-request range selection.

---

## 2026-10-18 · P1-01 — versioned command framework

- Add one command registry, strict option parsing, versioned JSON for help/version and every implemented command, and contained error formatting with all five documented exit codes.
- Generate the implemented command reference from definitions and check it for drift, keeping the target flow surface explicitly planned.
- Verified the complete local check suite, including command/error contracts, documentation generation, build and smoke on macOS arm64.

---

## 2026-10-18 · P0-03 availability evidence; owner-only foundations parked

- Version/help probes passed for Claude 2.1.299, Codex 0.163.0, OpenCode 1.17.9 and Copilot 1.0.83 on macOS arm64.
- These probes do not establish skill discovery, permissions, hooks, questions, MCP or plugin conformance. Per-CLI notes and an isolated manual checklist preserve that distinction; P0-03 remains parked.
- P0-01 remains parked awaiting npm reservation. No publication or push was attempted.
- The existing local check suite passed before recording this evidence; Linux and live client sessions remain unverified in this session.

---

## 2026-10-14 · P0-02 done — CI green

### Done

- First CI run failed only on Node 20: `jsdom` 30 (Mermaid check) needs Node 22 APIs. CI now has a `check` job (Ubuntu + macOS, Node 22, full `npm run check`) and a `runtime` job that builds on 22 and runs the bundled CLI on Node 20. All green.
- Development requires Node ≥ 22; the published CLI supports Node ≥ 20 ([ADR-0019](../docs/decisions/0019-typescript-toolchain.md)).
- `origin` switched to SSH (the machine has no HTTPS credential helper; the SSH key authenticates as `dreamingechoes`).

### Open

- Agent sessions cannot push or edit `.github/workflows/` on this machine; the owner applies those.

---

## 2026-10-14 · P0-04 and P0-05 done — docs and harness checks

### Done

- `wl docs nav` regenerates every footer from `docs/nav.yml`; `wl docs check` verifies docnav drift, nav listing, status banners, relative links and anchors (GitHub slugs) across 71 Markdown files.
- `npm run lint:mermaid` parses all 35 diagrams with the official Mermaid parser (dev-only; too heavy for the bundled CLI).
- `wl harness check` enforces size budgets, portable skill and agent front matter, and `enforcement.yml` (missing enforcer · prose as enforcer · missing file or symbol · `forbid` contradictions · stale entries · documentation-only without reason).
- `npm run check` now runs lint · typecheck · 51 unit tests · build · smoke · docs check · harness check · markdownlint · Mermaid in about 4 seconds; CI runs the same command.

### Found by the new checks

- `docs/nav.yml` had an unquoted title with commas that YAML silently split; `parseNav` now rejects unknown keys.
- Glossary and FAQ had no status banner; added.

### Decided

- Bundled dependencies stay in `devDependencies`: `dist/wl.mjs` is self-contained, so the published package has no runtime dependencies.
- npm's optional-dependency bug left the lockfile without platform bindings for Vitest's bundler; the lockfile was regenerated from scratch. If `vitest` fails with a missing `rolldown` binding, regenerate the lockfile rather than adding the binding as a dependency.

---

## 2026-10-14 · P0-02 in progress — TypeScript toolchain

### Done

- `package.json` (npm, Node ≥ 20, exact dev dependencies published ≥ 2 weeks earlier), strict `tsconfig`, Biome (recommended preset), Vitest, esbuild bundle to `dist/wl.mjs` with the version injected from `package.json`.
- Minimal `wl`: `--version`, `--help`, unknown input → stderr + exit 1; 6 unit tests; `npm run smoke` checks the built binary.
- `npm run check` (lint · typecheck · tests · markdownlint) runs in about 2 seconds.
- CI workflow: Ubuntu (Node 20, 22) and macOS (Node 22), actions pinned by SHA, runtime-dependency audit.
- markdownlint upgraded to 0.23.3; its new table rule (MD060) required normalising every table delimiter row.
- Decisions in [ADR-0019](../docs/decisions/0019-typescript-toolchain.md): npm over pnpm, Biome over ESLint + Prettier, TypeScript 7.

### Decided

- Patched transitive versions forced through `overrides` (`smol-toml` 1.9.0, `katex` 0.18.9).
- `braces` ≤ 3.0.3 advisory (dev-only, no fix released) accepted and documented; it never sees untrusted input.
- Biome's `migrate` silently turned the recommended rules off (`preset: none`); fixed to `preset: recommended` and verified with a probe file. Worth remembering on future Biome upgrades.

### Open

- **CI green on Linux and macOS** cannot be verified until these commits are pushed (pushes from agent sessions are currently blocked on this machine — see the P0-01 entry).

---

## 2026-10-14 · P0-01 in progress — identity and repository

### Done

- `throughline` turned out to be crowded by active tools for the same CLIs; the project is now **wholeloop**, CLI alias `wl` ([ADR-0018](../docs/decisions/0018-project-name.md)). Docs, ADRs and roadmap renamed in one commit; local folder renamed.
- Private repository created at `github.com/dreamingechoes/wholeloop`; `main` pushed with full history at creation.
- Issue forms (bug, idea, provider request), PR template, `SECURITY.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1).

### Open

- **npm reservation** — `wholeloop` is free on the registry, but nobody is logged in to npm on this machine, and publishing a placeholder makes the name public. Waiting on the owner: `npm login`, then approval to publish `0.0.0`.
- **Pushing from agent sessions** — a global push guard from another plugin on the owner's machine blocks `git push`; the owner pushes, or excludes this repository from that guard.
- GitHub private vulnerability reporting is unavailable while the repository is private; `SECURITY.md` points to email until then.

### Next

- Close P0-01 once the npm name is reserved. P0-02 and P0-03 do not depend on it and can start.

---

## 2026-10-14 · Repository bootstrapped

### Done

- Repository created: license, editor settings, README with the philosophy and the flow.
- Documentation skeleton: philosophy, concepts, the flow and every step page, configuration (profile, providers, repo skills), extending, platforms, architecture, contributing guides, glossary, FAQ.
- Foundational decisions recorded as ADR-0001 to ADR-0018.
- Roadmap: six phases, 54 session-sized tasks with acceptance criteria.

### Decided

- Name `wholeloop` (CLI `wl`), chosen after `throughline` turned out to be crowded by active tools for the same CLIs ([ADR-0018](../docs/decisions/0018-project-name.md)); TypeScript core; MIT; personal open-source project.
- State outside every repository; builds in git worktrees so slices run in parallel.
- Tier A: Claude Code, Codex, OpenCode, Copilot CLI. Tier B: Gemini CLI, Antigravity, Cursor.
- Every step usable on its own; the full flow is opt-in through `next`.
- Providers and other extensions are declarative manifests over a capability taxonomy with no dangerous verbs.
- Gate round budgets default to verify 4 / review 3 and are configurable per project and per run.
- No tool attribution anywhere in the history.
- Repository hosted privately at `github.com/dreamingechoes/wholeloop` (personal account).
- Bootstrap workflow: commits go straight to `main`, no branches or PRs, until the owner announces the switch.

### Next

- [P0-01](./phase-0-foundations.md#p0-01--names-package-and-repository-hygiene) — reserve the package name and push the repository.
- [P0-03](./phase-0-foundations.md#p0-03--cli-conformance-spike) can start in parallel: it needs no code from this repo.

---

[◀ Roadmap](./README.md)
