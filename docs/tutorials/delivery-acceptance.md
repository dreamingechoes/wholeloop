# Pin behavioral acceptance and retain its evidence

> **TL;DR** — Pin the agreed cases before execution, preserve human/machine ownership and inspect coverage against the exact candidate. Artifact capture and sealed reports remain private, bounded and separate from publication permission.

> [!IMPORTANT]
> **Experimental.** Closed definitions, evidence validation, typed reports, human notes and budgeted artifacts are tested. Autonomous delivery may change in a minor release.

## Before you start

Install the CLI as in [getting started](../getting-started.md#install-the-cli). Complete the [delivery-planning tutorial](./delivery-plan.md) in the same Bash shell, retaining workspace_dir. This tour adds acceptance definitions to that disposable example. It needs Git and Node, with no Docker, model, grant or vendor account. The task application and proposed API below are fictional definition data, not discovered application behavior or an executed test.

## Inspect the contracts and pin a case

```bash
set -euo pipefail
wl delivery acceptance-schema --json
wl delivery inspect-plan \
  --run delivery-0123456789abcdef --revision 1 \
  --store "$workspace_dir/state" --json > "$workspace_dir/delivery-receipt.json"
node --input-type=module - "$workspace_dir" <<'JS'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const directory = process.argv[2]
const prepared = JSON.parse(readFileSync(join(directory, 'delivery-receipt.json'), 'utf8'))
if (prepared.plan.criteria.length !== 1 || prepared.plan.criteria[0].id !== 'search') {
  throw Error('This example requires the exact tutorial criterion; define real cases for another plan')
}
const fixture = JSON.stringify([{ id: 'task-1', title: 'First task' }, { id: 'task-2', title: 'Second task' }])
const plan = {
  schema: 'wholeloop/acceptance-plan@1',
  run: prepared.plan.run,
  revision: prepared.plan.revision,
  plan: prepared.digest,
  source: prepared.plan.source,
  cases: [{
    id: 'find-title', criteria: ['search'], owner: 'machine',
    applicability: 'applicable',
    rationale: 'The agreed criterion requires finding tasks by title.',
    initial: 'Two fixture tasks exist with distinct titles.',
    actions: ['Search the public example endpoint for Second task.'],
    assertions: [{
      id: 'matching-ids', description: 'Return only the matching task ID.',
      subject: 'json', operator: 'equals', path: '/ids', expected: '["task-2"]'
    }],
    failureConditions: ['Missing or extra task IDs fail the criterion.'],
    runner: {
      kind: 'api', capability: 'http.request',
      input: JSON.stringify({ method: 'GET', path: '/tasks?title=Second%20task' })
    },
    fixture: {
      ref: 'fixture:two-tasks',
      sha256: createHash('sha256').update(fixture).digest('hex')
    },
    timeoutMs: 10000
  }],
  retention: { reviewAfterMs: 86400000, expiryAction: 'retain' }
}
writeFileSync(join(directory, 'acceptance.json'), JSON.stringify(plan, null, 2) + '\n')
JS
wl delivery acceptance-plan \
  --file acceptance.json --root "$workspace_dir" \
  --store "$workspace_dir/state" --json > "$workspace_dir/acceptance-receipt.json"
acceptance_digest="$(node --input-type=module - "$workspace_dir/acceptance-receipt.json" <<'JS'
import { readFileSync } from 'node:fs'
console.log(JSON.parse(readFileSync(process.argv[2], 'utf8')).digest)
JS
)"
wl delivery acceptance-inspect \
  --digest "$acceptance_digest" --store "$workspace_dir/state" --json
printf 'Retained acceptance definitions: %s\n' "$workspace_dir"
```

Expect acceptance-plan-prepared@1 and acceptance-plan-inspection@1, the same digest and definitions, executed: false and acceptance: not-established. Preparing a case never calls its endpoint or runs its command. Required criteria need applicable cases with their inherited ownership. An inapplicable browser case cannot replace an applicable CLI/API criterion; changing the pinned definitions in place refuses. The first definition also refuses after the harness has admitted a builder on that delivery basis. A new accepted delivery revision is separate.

## Current reports and execution evidence

After an actual owned application exists, acceptance-report takes --digest, --environment and --store. It observes current application identity and candidate bytes, then evaluates retained controller-host receipts. Missing or changed evidence cannot yield acceptance. Exit 3 means incomplete/stale/unavailable coverage or an unavailable current application. There is deliberately no acceptance-result import command: a JSON object saying that a PID exited successfully is not a host observation.

Fixed controller hosts use executeCase to capture actual observations under current private authority and finite deadlines. No arbitrary executable plugin is discovered from a definition. API/CLI and browser adapters supply their execution implementations in the subsequent roadmap tasks. A worker's proposed pass, a zero process exit or an old successful artifact cannot establish complete coverage. Fixtures stay fixture-only. Existing repository suites and semantic/adversarial gates retain their own budgets and once-per-round behavior.

An interrupted case retains its intent and invocation observation. Persistence spends the original deadline; if it expires before dispatch, the host is not started. A dispatched invoker stays unknown until actual shutdown is established. Repeating that key cannot dispatch it again, and a second request cannot bypass unresolved work. Recovery must establish actual shutdown rather than infer it from age. Later failed attempts take precedence even if timestamps are equal.

## Owned application operations inside a runner stage

The internal RunnerEnvironmentScope joins the existing behavioral hosts to an original verification/integration/acceptance invocation. It pins the private environment/grant and candidate vector, claims each effect once, and preserves the original wrapper's actual process identity. Inert Docker queries receive separate durable owners; a finished test client cannot hide another still-running query.

Pause/recovery observes original metadata without rerunning a test or resetting its allowance. Stop addresses only the original private nonce channels, even after revocation; unrelated environment operations remain untouched. Missing descriptors, damaged claims and unobserved clients stay unknown. Synthetic process controls test these boundaries without certifying a real daemon, application or account. Full domain-stage/public-route composition remains in progress. See [ADR-0124](../decisions/0124-owned-application-operation-stage-boundaries.md).

## Private artifacts and sealed reports

Artifact capture requires an active private grant with report.write and remaining artifact budget. Use acceptance-artifact with --run, --file, --root and --store; --media-type is optional and defaults to application/octet-stream. It reads bounded regular bytes without following a symlink escape, rejects recognizable credential text before storage, and verifies content-addressed chunks on reads. The per-object maximum is twenty MiB; the run retains its configured total budget, two hundred MiB by default. Empty bytes remain distinct from a missing artifact.

Capture authorizes no sharing. Keep screenshots, traces, video and outputs private, and review/redact them before any separately authorized publication. Known credential text is refused across the complete object before splitting; this is not universal image/video redaction. Retention means keep, and review dates never delete evidence automatically. Partial omissions remain visible in the run budget instead of becoming successful captures.

Use acceptance-seal with the same report options to retain its current typed report as a budgeted immutable JSON artifact. This requires current execution/report authority, establishes no publication permission and does not run another suite. A fixture-only or incomplete report retains that status when sealed.

## Human-only observations

A human-only criterion remains pending-human until an explicit current operator note. Use acceptance-human-note with --digest, --case, --environment, --store and a --file/--root containing wholeloop/acceptance-human-request@1, by, note and passed/failed status. Record the actual person's observation of that exact candidate. An automated worker cannot convert its output into this note; the broker exposes no such method. Historical supervised PR-testing records remain unchanged and are not imported as observations for a different case or candidate.

See [ADR-0105](../decisions/0105-pinned-acceptance-and-observed-evidence.md), the [behavioral QA specification](../../roadmap/specifications/autonomous-delivery/04-behavioral-qa.md) and [V1 acceptance](../v1-acceptance.md) for the remaining actual execution/native boundaries.

<!-- docnav -->
[◀ Environment stop and retirement](delivery-lifecycle.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Execute API and CLI acceptance ▶](delivery-behaviors.md)
