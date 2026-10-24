# Prepare a delivery plan — review scope before execution

> **TL;DR** — Prepare an initial request envelope and a revision-bound plan with explicit criteria, repositories, policy and finite budgets. Inspect dependency waves and the proposed route in another process. Planning starts no worker and grants no execution authority.

> [!NOTE]
> **Status: ✅ implemented.** Closed plan/envelope validation, immutable external revisions, local Git basis observations and deterministic routing are implemented. Authorization, delegated decisions and the unattended runner remain subsequent increments.

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

A plan has at most 100 work units, 16 repositories and 1000 criteria. Every required outcome needs criterion coverage, each criterion has exactly one work owner and all work/criteria belong to milestones. Contract consumers explicitly depend on their producer, directly or transitively. Milestones also declare the dependencies needed by their work. Guidance/rubric digests and supplied capability descriptors are pinned planning inputs; execution-time hosts must verify their actual content and effective capabilities.

Existing item IDs are optional work.subject references. The planner confirms they exist, are open and match a recorded repository where present. It does not create slices or human approval records. Local target refs and configured remote identities are observed without fetching. Research plans may omit repositories and use research-only work; research authority does not imply code writes.

Changing an existing run/revision in place is refused. For a new revision, increment revision, set previous to the exact old plan digest, retain its history, and satisfy current local bases. If bound to an envelope, keep its exact intent/repositories/policy/guidance/capabilities and stay within its finite limits. The current fit is deliberately conservative. Inspecting history remains possible after a branch or remote changes; new execution still needs fresh validation and a grant.

For incomplete intent, definition.ready is false and definition.missing lists actual unknowns. Supervised/on-exception policies may return needs-input. A none policy with missing undelegated Define/research decisions returns blocked; explicitly named delegated decisions can propose the appropriate Define/research route. A retained human-only criterion blocks none. A route is not an execution capability or a successful decision. Unknown facts remain unknown.

## Stopping point

You have a reviewable immutable envelope and plan, with an explicit route and dependency waves. The private records live under the external state/delivery directory; retain the temporary directory to inspect or replay them in another terminal. This increment cannot authorize or run workers. Follow [Phase 6](../../roadmap/phase-6-autonomous-delivery.md) for grants, actual execution and expanded acceptance, or use the existing [small-change route](./small-change.md).

<!-- docnav -->
[◀ Delivery request intake](delivery-intake.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Troubleshooting ▶](../troubleshooting.md)
