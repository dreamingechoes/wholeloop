# Prepare a delivery plan — review scope before execution

> **TL;DR** — Prepare an initial request envelope and a revision-bound plan with explicit criteria, repositories, policy and finite budgets. Inspect dependency waves and the proposed route in another process. Planning starts no worker and grants no execution authority.

> [!NOTE]
> **Status: ✅ implemented.** Closed plan/envelope validation, immutable external revisions, local Git basis observations and deterministic routing are implemented. [Operator grant metadata](./delivery-authorization.md) is available; the [decision](./delivery-decisions.md) and [runner](./delivery-runner.md) guides describe their implemented execution boundaries. Native/model acceptance remains separate.

## Before you start

Build the checkout following [getting started](../getting-started.md#build-the-source-checkout), keeping WHOLELOOP_CLI set to the absolute dist/wl.mjs path. You need Git and the built CLI; no model or remote account is needed. Run these Bash commands from any directory. All Git changes below belong to a new disposable example repository. Proposal files, receipts and runtime state stay outside that repository.

## Capture the source and prepare proposals

```bash
set -euo pipefail
workspace_dir="$(mktemp -d "${TMPDIR:-/tmp}/wholeloop-plan.XXXXXX")"
mkdir -p "$workspace_dir/repo"
git -C "$workspace_dir/repo" init -q -b main
git -C "$workspace_dir/repo" config user.name 'Fixture Owner'
git -C "$workspace_dir/repo" config user.email fixture@example.test
git -C "$workspace_dir/repo" config commit.gpgsign false
git -C "$workspace_dir/repo" config core.hooksPath /dev/null
printf 'Original application.\n' > "$workspace_dir/repo/app.txt"
git -C "$workspace_dir/repo" add app.txt
git -C "$workspace_dir/repo" commit -q \
  -m 'feat: seed the disposable planning example' \
  -m 'Provide an isolated initial base for the delivery tutorial.'
cat > "$workspace_dir/source-input.json" <<'EOF'
{
  "schema": "wholeloop/delivery-source-request@1",
  "kind": "inline",
  "ref": "title-search",
  "body": "Find tasks by title.",
  "mapping": [
    { "id": "search", "role": "criterion", "startLine": 1, "endLine": 1 }
  ]
}
EOF
node "$WHOLELOOP_CLI" delivery source \
  --file "$workspace_dir/source-input.json" --root "$workspace_dir" \
  --store "$workspace_dir/state" --json > "$workspace_dir/source.json"
node --input-type=module - "$workspace_dir" <<'EOF'
import { spawnSync } from 'node:child_process'
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const directory = realpathSync(process.argv[2])
const root = join(directory, 'repo')
const observed = spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], {
  encoding: 'utf8'
})
if (observed.status !== 0) throw new Error('Cannot observe the example base')
const source = JSON.parse(readFileSync(join(directory, 'source.json'), 'utf8'))
const basis = {
  source: source.source.id,
  owner: 'Fixture Owner',
  scope: {
    outcomes: [{ id: 'locate', text: 'Locate tasks using their titles.' }],
    exclusions: ['Descriptions are excluded.']
  },
  repositories: [{
    id: 'app', root, target: 'refs/heads/main', base: observed.stdout.trim()
  }],
  guidance: [],
  policy: {
    endpoint: 'local-handoff', intervention: 'supervised',
    uncertainty: 'blocked', delegations: []
  },
  budgets: {
    wallTimeMs: 14400000, attemptMs: 1800000,
    builders: 2, buildersPerRepository: 1, evaluators: 4,
    restarts: 2, ciPushes: 2, integrationRepairs: 3,
    noProgress: 3, artifactBytes: 209715200
  },
  capabilities: []
}
const envelope = {
  schema: 'wholeloop/delivery-envelope@1', ...basis,
  limits: { work: 100, criteria: 1000, revisions: 10 }
}
const plan = {
  schema: 'wholeloop/delivery-plan@1', ...basis,
  run: 'delivery-0123456789abcdef', revision: 1,
  definition: { ready: true, missing: [] },
  criteria: [{
    id: 'search', text: 'Find tasks by title.', outcomes: ['locate'],
    test: 'Seed two tasks, search one title, and compare returned task IDs.',
    acceptance: 'machine'
  }],
  work: [{
    id: 'search', repository: 'app', role: 'implementation',
    criteria: ['search'], after: [], consumes: [], produces: []
  }],
  milestones: [{
    id: 'feature', work: ['search'], criteria: ['search'], after: [],
    procedure: 'Run the application and search seeded tasks by title.'
  }]
}
for (const [name, value] of [['envelope', envelope], ['plan', plan]]) {
  writeFileSync(join(directory, `${name}.json`), JSON.stringify(value, null, 2))
}
EOF
node "$WHOLELOOP_CLI" delivery envelope \
  --file "$workspace_dir/envelope.json" --root "$workspace_dir" \
  --store "$workspace_dir/state" --json > "$workspace_dir/envelope-receipt.json"
node --input-type=module - "$workspace_dir" <<'EOF'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const directory = process.argv[2]
const file = join(directory, 'plan.json')
const plan = JSON.parse(readFileSync(file, 'utf8'))
plan.envelope = JSON.parse(
  readFileSync(join(directory, 'envelope-receipt.json'), 'utf8')
).digest
writeFileSync(file, JSON.stringify(plan, null, 2))
EOF
node "$WHOLELOOP_CLI" delivery plan \
  --file "$workspace_dir/plan.json" --root "$workspace_dir" \
  --store "$workspace_dir/state" --json
node "$WHOLELOOP_CLI" delivery inspect-plan \
  --run delivery-0123456789abcdef --revision 1 \
  --store "$workspace_dir/state" --json
printf 'Retained tutorial files: %s\n' "$workspace_dir"
```

Both final commands return the exact same prepared plan/digest, route.next: build, one dependency wave containing search, authority: not-granted and workers: not-started. This is a source-defined build proposal, not a claim that Define was approved or implementation ran. The repository remains on its original commit. The envelope was prepared before the plan; neither preparation is operator authorization or semantic acceptance.

## Read the contracts and change a proposal

```bash
node "$WHOLELOOP_CLI" delivery plan-schema --json
```

A plan has at most 100 work units, 16 repositories and 1000 criteria. Every required outcome needs criterion coverage, each criterion has exactly one work owner and all work/criteria belong to milestones. Contract consumers explicitly depend on their producer, directly or transitively. Milestones also declare the dependencies needed by their work. Guidance/rubric digests and supplied capability descriptors are pinned planning inputs; execution-time hosts must verify their actual content and effective capabilities. Fill `guidance` with `node "$WHOLELOOP_CLI" delivery guidance --file <proposal.json> --json`: it proposes the pins a supervised step would resolve, read at each repository's pinned base, and returns questions for ambiguous slots ([repository guidance in autonomous runs](../configuration/repo-skills.md#in-autonomous-runs)).

Existing item IDs are optional work.subject references. The planner confirms they exist, are open and match a recorded repository where present. It does not create slices or human approval records. Local target refs and configured remote identities are observed without fetching. Research plans may omit repositories and use research-only work; research authority does not imply code writes.

Changing an existing run/revision in place is refused. For a new revision, increment revision, set previous to the exact old plan digest, retain its history, and satisfy current local bases. If bound to an envelope, keep its exact intent/repositories/policy/guidance/capabilities and stay within its finite limits. The current fit is deliberately conservative. Inspecting history remains possible after a branch or remote changes; new execution still needs fresh validation and a grant.

For incomplete intent, definition.ready is false and definition.missing lists actual unknowns. Supervised/on-exception policies may return needs-input. A none policy with missing undelegated Define/research decisions returns blocked; explicitly named delegated decisions can propose the appropriate Define/research route. A retained human-only criterion blocks none. A route is not an execution capability or a successful decision. Unknown facts remain unknown.

## Stopping point

You have a reviewable immutable envelope and plan, with an explicit route and dependency waves. The private records live under the external state/delivery directory; retain the temporary directory to inspect or replay them in another terminal. This increment cannot authorize or run workers. Follow [Phase 6](../../roadmap/phase-6-autonomous-delivery.md) for grants, actual execution and expanded acceptance, or use the existing [small-change route](./small-change.md).

## Preview and adopt a revision

When the source changes, write the proposed next plan revision and preview it with `wl delivery revise --run <id> --file <plan.json>`. Nothing is written. The impact lists changed, added and removed criteria, removed outcomes, whether authority must be renewed, whether an envelope still covers it, which stages keep their evidence and why, and the workers and effects to fence or reconcile. Adopt it with `--accept --operator "Your Name" --reason "Why"`, adding `--approve-removals` when criteria or outcomes are dropped. Acceptance records only the immutable revision and its reason; the run keeps its approved basis until authority covering the new revision is tracked. A none-policy revision outside its envelope is refused. See [ADR-0192](../decisions/0192-revision-impact-and-explicit-adoption.md).

## Continue after a failed integration or acceptance

When a run ends `failed` or `blocked` at an integration or acceptance stage, `wl delivery report` lists `wl delivery continue` among its next actions. Preview a correction with `wl delivery continue --run <id> --request <runner-request> --stage <stage> --unit <work-id>`. The admission names the exact failure evidence, the repairs used against the run's limit, and every reason it would be refused: pending effects, unresolved stages, a controller still active or an exhausted budget. The impact shows which stages keep their evidence. Nothing is written.

Adding `--accept --operator <name> --reason <text>` records the next revision with one more `corrections` entry. It does not reopen the run. Issue a new grant for that exact plan with `wl delivery authorize`, track the revision with it, then prepare and run a new runner request. The journal refuses the failed run's grant and any envelope grant here. The registered seeded producer runs every unit's grant- and revision-bound chain again. Each new workspace starts at the predecessor's committed head; the corrected unit's builder receives the retained failure and commits its correction before independent QA. Existing decisions and commit receipts never become current under the new grant. Only independent units are supported for seeding ([ADR-0208](../decisions/0208-seeded-correction-producer.md)).

Retire the predecessor's exact owned environments explicitly when they still reserve backend capacity; continuation never retires them implicitly. A public integration case supplies only its pinned actions, assertion IDs/descriptions and failure conditions. A private case supplies its ID and status, with no objective, expected value, input or result artifact. Acceptance-origin feedback also carries explicitly historical delegated outcomes, challenger verdicts and explanations, or the rejected human subject and its note. Actor identities and input artifacts are omitted. These are untrusted repair inputs; they never become current approval or renew authority. A seeded correction can feed bounded verification/review repairs through its exact recorded builder and commit ([ADR-0211](../decisions/0211-seeded-correction-roots-for-qa-repairs.md)). Every changed head needs fresh independent QA; a commit never supplies it. Restarts are counted across revisions, so the default allowance may already be exhausted after the old build, rebuild and correction. Continuation never resets that allowance. CI-origin execution remains implementation work. Its fixed historical reader verifies exact original check/publication evidence and refuses non-code or ambiguous failures; that history certifies no current permission, PR feedback set or repair execution ([ADR-0212](../decisions/0212-retained-ci-correction-evidence.md)). The model-free public continuation does not certify a native client or hosted service.

## Preview a CI correction with an explicit plan version

For a retained literal required code-test failure, use `wl delivery continue-ci --run <id> --request <original-runner-request> --unit <work-id>`. The command verifies original publication/CI receipts, closed predecessor ownership and the remaining original repair/push allowances. It previews without writes. Add `--accept --operator <name> --reason <text>` to record the next version-two plan; this records neither a grant nor execution. Every code unit must be independent, because the producer rebuilds all units from the published product root.

Planning commands keep version one as their default. Select `--schema-version 2` explicitly for `wl delivery plan-schema`, `wl delivery plan` and `wl delivery inspect-plan` when working with the new plan. Mixed planning-record/value versions and implicit version-two persistence or inspection refuse. Inherited correction history remains immutable; each new version-two entry identifies its producer revision, and only the current entry runs. A new exact-plan grant is required; the previous grant and wider envelope option remain insufficient ([ADR-0214](../decisions/0214-versioned-ci-correction-production.md)).

The public CLI can preview, record and inspect this proposal. Its output explicitly requires an installed SDK controller; it does not suggest public prepare/run actions. CI repair execution currently uses `composeInstalledImplementation` with fixed CI/merge hosts and the separately installed runtime allowance. The public composer still refuses `to-merge`, and the version-one native runtime document has no merge-installation flag. An installed allowance also grants no merge effect: an ungranted merge remains blocked.

The SDK producer admits builders only after complete stable reads of the original topics, ready owned PRs and current bodyless feedback. Current unadopted feedback, unreadable pages, changed heads, insufficient scope or a spent push budget block it. New workspaces start at the exact published product head, with original unit/base ancestry checked. The corrected head gets fresh verification, review, integration, acceptance and CI. Publication keeps the original topic and PR URL and uses a non-force push; the original PR body stays historical. A copied marker or another PR cannot replace that resource.

`npm run eval:ci-continuation -- --retire-success` exercises the installed SDK composition with synthetic native/API/CI/protection facts, actual local bare Git and actual Docker QA. It grants no merge, writes nowhere hosted and retires exact owned environments. The development trials retained a producer-inspection failure and a reporter cache failure. The shared corrected verifier passes fresh API/bare-object readback of the latter's completed core execution without replay; the original failed command/report remain failed. Native/reference and hosted acceptance remain separate.

<!-- docnav -->
[◀ Delivery request intake](delivery-intake.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Delivery authorization ▶](delivery-authorization.md)
