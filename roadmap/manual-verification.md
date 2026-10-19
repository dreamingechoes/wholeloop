# Manual verification — current implementation

> Automated results and pending work are separate. A checked roadmap task means
> its local acceptance checks passed, not that every target CLI or platform has
> been exercised. Updated 2026-10-19.

## Gate evaluation and real model calibration (P3-10)

- [ ] Review each labelled contract, defect and look-alike with actual repository standards. These are original authored snippets, not executed production regressions; case-level finding presence does not prove finding-level semantic precision.
- [ ] Export blind --inputs, hide labels/reasons/descriptive files and collect real independent reviewers/refuters with stable opaque IDs. Preserve complete gate observations and actual host execution evidence separately; a recorded provenance string alone proves nothing.
- [ ] Score the exact corpus digest with before/after matrices, coverage and unknowns. Compare against a recorded model/host baseline, never against the synthetic arithmetic fixture as evidence of model quality.
- [ ] Add real escaped defects/look-alikes and calibrated custom-lens cases with explicit labels. Set justified regression thresholds for the intended workload; the small seed is not a population estimate.

These checks do not block further local workflows.

## Environment ledger and actual undo (P3-09)

- [ ] Declare actual process/container/data/service effects before hand-back. Verify each appears with complete non-secret undo argv/cwd in the Build/PR receipt and current env report, including shared ancestor and child-part effects.
- [ ] Exercise undo recipes on disposable resources using the supported platforms. The ledger tests deliberately do not execute undo, so no cleanup success is implied by a stored recipe.
- [ ] Inspect dependencies and current ownership before following reverse declaration order. Verify repeated cleanup is safe in the actual tool and preserve resources still in use.
- [ ] Keep credentials in encrypted, OS or tool stores. Common shape/flag exclusions are not a complete secret detector; inspect recipe files and resource identifiers before declaration.
- [ ] Confirm effects added during human testing appear in the current report while historical step receipts retain the ledger at their completion time.

These checks do not block subsequent local implementation.

## open-pr and code-host execution (P3-07)

- [ ] Authenticate gh/glab using their own credential stores and exercise explicit prepare → human test → open in a disposable remote project. Confirm exact source SHA, named base, draft status, no implicit fork and no ready/reviewer/merge action.
- [ ] Test a self-managed host/group path and remote permission failure. Fork heads, nonstandard SSH ports and multiple push destinations require an explicit host extension; they are not guessed.
- [ ] Interrupt after the push and after remote creation, inspect what exists, and reconcile the observed matching draft URL. A request with no remote PR remains an explicit owner recovery case; do not clear intent or retry blindly.
- [ ] Confirm real template/style use and complete manual-test notes in each client. New code or a changed plan must invalidate approval; a bare test-it answer must not publish.
- [ ] Verify actual tracker mirroring and sibling PR back-links through the chosen host, and inspect all external environment writes/undo steps through the integrated environment ledger. Current publication records local links and carries stored tracker/known sibling references in the body.
- [ ] Exercise explicit PR comments and their stable round marker on a disposable remote. Sequential retries reconcile; simultaneous hosts still need coordination.
- [ ] Repeat process-group cleanup and Git/CLI fixtures on Linux/Node 20/22. Local execution used macOS/Node 24; the only real push was to a temporary local bare repository.

These checks do not block remaining local implementation.

## review-code and incremental inputs (P3-06)

- [ ] Exercise the canonical skill in each real client. Confirm loaded repo rubric content and the incremental patch reach every reviewer/refuter; recheck prior kept findings even when unchanged in the new patch.
- [ ] Resolve an authenticated PR head through the host and inspect its isolated named-branch workspace. The CLI does not fetch or authenticate PRs.
- [ ] Repeat exact-index, mode, symlink and interruption/recovery fixtures on Linux and supported Node/Git versions. Local execution used macOS/Node 24/Git 2.49.
- [ ] Inspect sensitive project paths before snapshotting. Filename/content exclusions are conservative, not encryption or a complete secret detector. Preserve private objects alongside the journal when moving state.
- [ ] After configuring a codehost.comment-pr provider, explicitly request a test comment, confirm no approval/request-changes is emitted and reconcile an ambiguous network outcome before retrying. Synthetic host tests did not publish anything.

These checks do not block other local implementation.

## verify-works and process execution (P3-05)

- [ ] Execute real project suites through each host, including instruction-file verify.suite bindings and monorepo command selection. Confirm actual criteria/changed-test observations rather than relying on structural lint or stub workers.
- [ ] Test process-group timeout/output-limit cleanup on Linux and supported Node versions. The local runner fixtures executed only on macOS/Node 24.
- [ ] Resolve an authenticated PR head/criteria through the host, supply its local named branch, and inspect the isolated worktree. Missing criteria must stay a question; the current CLI does not fetch PRs.
- [ ] Inspect suite effects outside tracked/non-ignored worktree files and supply undo steps. After a physical interruption, inspect the retained intent before starting another round; no automatic retry is allowed.
- [ ] Verify shared raw output remains transient in client context, durable receipts contain only hashes/exit metadata, and actual failed processes cannot be argued into a passing verdict.

These checks do not block the remaining local implementation.

## Builder host and build-slice (P3-04)

- [ ] Run the canonical skill in each actual client. Confirm the preflight appears before provisioning, resolved repository build instructions are loaded, and all writes stay in the allocated workspace. Typed-host fixtures are local conformance scenarios, not live client captures.
- [ ] Confirm native/sequential workers are independent and genuinely read-only in gates. Exercise guided/staged/parallel pacing, an interrupted partial gate and cancellation of already-running workers.
- [ ] Exercise an authenticated issue read through the chosen tracker, validate complete body/reference/revision normalization, and agree criteria explicitly. The CLI itself does not fetch issues.
- [ ] Test real project behavior and external environment effects; current worker fixtures are synthetic; suite execution and incremental review have local fixtures but require actual host observations. Green machine gates must still hand back for human testing without a push or PR.

These checks remain for the owner and do not block other local implementation.

## Gate engine (P3-03)

- [ ] Run the same pinned plan in actual native and sequential clients; compare complete results and use genuinely independent refutation sessions. Unit fixtures supply synthetic workers and do not prove client isolation or model quality.
- [ ] Confirm read-only tool enforcement in each client and a reported failure when a reviewer changes code. Boundary snapshots cannot observe a write restored before the next check.
- [ ] Exercise project/run budgets and a person-requested mid-run extension on real work. Confirm EXHAUSTED hands back findings and no host silently resets a failed run.
- [ ] Inspect ignored files, external symlink targets, submodules, external services and test side effects explicitly. The current gate snapshot covers tracked/untracked non-ignored files, index, HEAD and branch, and blocks on submodules.
- [ ] Repeat Git/permissions/symlink fixtures on Linux and supported Node versions. Local macOS execution is not cross-platform evidence.

These owner checks do not block implementation of the remaining local workflows.

## Owner actions still pending

| Task | Action | Current evidence |
| --- | --- | --- |
| P0-01 | Authenticate to npm and reserve the package when ready to make the name public | No package was published in this session |
| P0-03 | Follow the isolated-session [conformance checklist](../test/conformance/notes/README.md) for all four tier-A CLIs | Version/help only; permissions, discovery, hooks, questions, MCP and plugin loading remain unverified |
| P0-06 | Optionally enable the local hook with `npm run hooks:install`; preserve any existing hook chain | A real hook was exercised in a temporary git repository; this checkout's Git configuration was not changed |
| CI | Run the updated workflow on Linux/macOS, including Node 20 runtime and a PR containing a rejected message | Local checks ran on macOS arm64 / Node 24.1.0; no remote CI run or push was performed |
| P1-03 | Optionally exercise forced interruption during a store write, preserve the journal, inspect the lock owner and rebuild after recovery | Concurrent processes, failed batches, malformed journals, symlinks and byte-identical rebuild are tested; physical power loss is not |

## Provider validation still pending

MCP snippets for Claude, Codex, OpenCode and Copilot are golden-tested for HTTP
and stdio. Merge a snippet into an isolated client configuration and verify an
actual tool call and authentication before calling that integration supported.
The eight destination providers have synthetic host-boundary transcripts, not
live captured responses. Verify actual tool names/arguments, complete reads,
rich-text preservation, revision conflicts and confirmed external links for each
configured destination. Check Notion async results and aliases, GitLab version,
Atlassian fields/permissions, and optional gws creation plus content insertion.
No integration was installed. Registry detection only establishes declarations or executable presence. No live
provider operation, model session or OAuth flow was executed here.

## Source validation still pending

For each configured source, verify the actual project/tenant, regional endpoint,
live tool schema, permissions, pagination/truncation, query reference and exact
window/timezone. All eleven source transcripts are synthetic. Replace Metabase's
example endpoint and configure Zendesk's real tenant/host authentication. Verify
PostHog tools mode and BigQuery read-only IAM/cost controls. For PostgreSQL use a
restricted libpq service and verify server read-only rejection, function privileges
and timeout behavior; process tests used a fixture executable, not a database.
Failed or incomplete access must produce an explicit unknown rather than a baseline.

## Worktree validation still pending

On a representative project, verify dependency/setup commands, actual port
binding, submodules/LFS, platform-specific Git behavior and the explicit checkout
opt-out. Local tests used Git 2.49.0 on macOS with real temporary repositories,
concurrent CLI creation, dirty source checkouts, stacked branches, locks and
conservative prune. Linux and physical process interruption remain unrun. After
an interruption, inspect stale lock ownership before clearing it and retrying the
recorded intent. Stop currently records a lease; no worker/dev-server process
controller is implemented. Open does not count as the person's test-it approval.

## Slicing validation still pending

Exercise slice-work with real repository conventions and a challenger in slicing
mode. Verify that the declared single outcome and demonstration describe a real
vertical user journey, and that all slices together deliver the scope. Local
fixtures validate shape, inherited criteria, stable IDs, dependencies and at most
one part per repository. Contract-first routing is automated; actual contract
implementation and builder execution are later tasks. Worktree lifecycle has
separate real Git tests and the owner checks above.
Remote tracker items/relationships remain pending host writes until linked.

## Definition eval validation still pending

Run the thirty-case seed through a real host challenger with expected labels
hidden. Preserve raw findings, actual model/client versions and run settings;
score complete predictions with `eval definitions --predictions`. The committed
90% recall/0% false-alarm baseline measures deterministic lint only and retains
two known semantic misses. It does not establish live challenger quality.

## Definition challenger validation still pending

Exercise all four modes in a host using the returned instructions and exact
artifact. Verify that every mode reports evidence and counterexamples, preserves
unknowns and leaves files unchanged. Compare challenge dials: tone and extra
counter-questions can differ, coverage and findings cannot. Numeric lint only
proves supported pairwise contradictions with explicitly matching contexts/units;
free-text semantics and multi-constraint consistency remain independent review.

## Scope validation still pending

Run cut-scopes with actual repository flag naming guidance and ask the challenger
whether each cut can ship independently. Review the completed plan before
approving. Exercise rejection, stable-key revision and choosing between multiple
scopes. Local tracker references and dependency rollback are automated tests;
remote tracker execution, actual links and semantic critique remain unverified.
Child scopes exist as drafts and cannot bypass the initiative's pending approval.

## Spec validation still pending

Run write-spec with a bound repository guide in a real host session. Verify that
the guide is followed, the challenger catches semantic defects, metrics come from
actual source evidence and the person reviews the completed revision. Local tests
use a fictional baseline/query fixture; validation does not execute those queries
or authenticate the named provider. Exercise rejection, correction and fresh
approval. External publication remains a pending handoff until linked.

## Framing validation still pending

In a real host session, verify that supportive/balanced/adversarial challenge
changes tone while preserving every framing question, and that insufficient
evidence triggers research and explicit TBD markers. Exercise an on-hold call,
its reopening condition and an explicit reopen. Remote publication remains a
pending handoff; verify the host write and record its link before reporting it
published. Cross-repository continuation uses explicit IDs.

## Research validation still pending

Run the research skill with real source tools and independent challenger sessions
once a host adapter is available. Verify source authentication, failure-to-open-
question handling, read-only workers, actual native fan-out and the same result
under sequential execution. Local tests use stubbed workers and fixture evidence;
no real research claim or live provider call was produced in this session.

## Canonical skill validation still pending

P1-12 is verified through compiled CLI workflow tests, including a sentence,
explicit owner, full framing artifact, no-go outcome, artifact receipt, read-only status and scoped setup. After P0-03
conformance and adapter generation, exercise the four canonical skills in real
client sessions: question rendering, repository guidance loading, preflight and
receipt language, and stopping at unavailable work or human decisions. No model
session was executed to establish these behaviors in a host client.

## Extension smoke checks

Use an isolated configuration home when selecting a custom profile. Run
`profile scaffold onboarding --output .wholeloop/profiles/onboarding`, inspect
the kit, then `profile test onboarding` and `profile preset onboarding --scope run`.
For templates, `template test spec` reports mandatory-section dependents. Lens
validation checks manifests and prompt resources only; actual gate execution and
other workflow-specific template selection remain pending.

## Current smoke scenario

Use a temporary `XDG_STATE_HOME` outside any repository and a temporary
`XDG_CONFIG_HOME` to avoid changing personal defaults. Build first with
`npm run build`, then use `node /absolute/path/to/wholeloop/dist/wl.mjs`:

1. Begin `step begin frame-problem --input "Find past orders" --owner "Alex" --json`.
2. Copy its initiative ID. Complete it with `step complete frame-problem
   --for <id> --artifact <file> --json`; the file must contain all returned framing headings. Use
   `test/fixtures/framing/frame.md` as a smoke fixture in a temporary location;
   actual framing must distinguish observed evidence from explicit TBD markers.
3. Inspect `state get`, `open` and `step plan` for that ID. The next step is
   `write-spec`, now available. Complete a spec using the returned schema/sections
   and verify that `next` stops at `approve-spec`; cut-scopes is now available. Approve the spec, complete a scope plan, and verify
   that both initiative and child continuation stop at approve-scopes. After
   approval, slice-work is available; complete a vertical slice plan and inspect
   contract-first routing. build-slice remains unavailable.
4. Send a local `msg send --thread <id> --to builder --kind note --body "Ready"`.
   Read it with `msg read --for builder --reader a`, then repeat: the second
   read is empty. A different reader still sees it.
5. Run `resume <id> --json` and `state rebuild --json`; the pack stays bounded
   and projections rebuild without changing the journal.
6. Inspect `profile show --json`; try a preset and a dial only in the temporary
   config home. `profile set depth=technical --scope run --json` must leave
   configuration unchanged.

These core paths also have automated tests. Generated client adapters, live canonical skill sessions,
live provider integrations and later step workflows remain unimplemented; do not
interpret this smoke scenario as their conformance validation.

[Roadmap](./README.md) · [Journal](./journal.md)
