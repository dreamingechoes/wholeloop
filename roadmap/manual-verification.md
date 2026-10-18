# Manual verification — current implementation

> Automated results and pending work are separate. A checked roadmap task means
> its local acceptance checks passed, not that every target CLI or platform has
> been exercised. Updated 2026-10-18.

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
