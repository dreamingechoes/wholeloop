# Queue prepared work without starting workers

> **TL;DR** — Enqueue exact work slots, inspect retained dependency/admission reasons and repeat requests without duplication. Queue metadata is available before the actual backend/worker runner; no worker starts through these commands.

> [!IMPORTANT]
> **Experimental.** Queue ordering, reservations, atomic claims and fencing are tested with real processes. Autonomous delivery may change in a minor release.

## Before you start

Complete the [planning](./delivery-plan.md), [authorization](./delivery-authorization.md) and optional [recovery](./delivery-recovery.md) tutorials in the same Bash terminal. Keep workspace_dir set. Authorization ends with its fictional grant revoked. This example explicitly records a new operator action; repeating a revoked action would not renew it. The example uses only the disposable repository and external store.

## Record the new explicit action and queue its work

```bash
set -euo pipefail
: "${workspace_dir:?Run the planning and authorization tutorials first}"
node --input-type=module - "$workspace_dir" <<'JS'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const directory = process.argv[2]
const request = JSON.parse(readFileSync(join(directory, 'authorization.json'), 'utf8'))
request.id = 'authorization-aaaaaaaaaaaaaaaa'
writeFileSync(join(directory, 'queue-authorization.json'), JSON.stringify(request, null, 2))
JS
wl delivery authorize \
  --file "$workspace_dir/queue-authorization.json" --root "$workspace_dir" \
  --store "$workspace_dir/state" --json > "$workspace_dir/queue-grant.json"
wl delivery track \
  --run delivery-0123456789abcdef --revision 1 \
  --grant authorization-aaaaaaaaaaaaaaaa \
  --store "$workspace_dir/state" --json > "$workspace_dir/queue-tracked.json"
wl delivery enqueue \
  --run delivery-0123456789abcdef --unit search --priority 10 \
  --store "$workspace_dir/state" --json > "$workspace_dir/builder-queued.json"
wl delivery enqueue \
  --run delivery-0123456789abcdef --unit search --role verifier --cell title-search \
  --store "$workspace_dir/state" --json > "$workspace_dir/verifier-queued.json"
wl delivery enqueue \
  --run delivery-0123456789abcdef --unit search --role verifier --cell title-search \
  --store "$workspace_dir/state" --json > "$workspace_dir/verifier-repeated.json"
wl delivery queue \
  --run delivery-0123456789abcdef \
  --store "$workspace_dir/state" --json > "$workspace_dir/queue-status.json"
node --input-type=module - "$workspace_dir" <<'JS'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
const directory = process.argv[2]
const json = name => JSON.parse(readFileSync(join(directory, name), 'utf8'))
const status = json('queue-status.json')
if (status.state !== 'queued' || status.entries.length !== 2) throw new Error('Two queued slots expected')
if (status.entries.some(entry => entry.status !== 'pending')) throw new Error('No worker may start')
if (status.entries.some(entry => entry.reason !== 'awaiting-host-admission'))
  throw new Error('Both independent slots must await actual host admission')
if (JSON.stringify(json('verifier-queued.json')) !== JSON.stringify(json('verifier-repeated.json')))
  throw new Error('Repeated enqueue must retain the exact queue')
if (status.workers !== 'not-started-by-this-command' || status.effects !== 'not-performed')
  throw new Error('Metadata must not claim worker execution or effects')
console.log('PASS: two durable queue slots, separate verifier cell and idempotent enqueue')
JS
```

The planning tutorial has one implementation unit and no prerequisite contract. The builder and its separate verifier cell both remain pending; queue metadata cannot establish that either ran or that verification passed. For a plan with dependencies, a higher priority cannot bypass its prerequisites. Default role is builder for contract/implementation units and researcher for research units. Supported explicit roles are builder, researcher, verifier, reviewer and refuter; evaluator --cell values distinguish independent assignments. A builder cannot declare a cell. Priority accepts integers from -100 to 100; changing it under an existing slot refuses instead of silently changing an earlier operator request.

## What the scheduler enforces

A trusted host can claim through the core controller API; admission defaults to unavailable until that host supplies its scoped capability/environment/budget and plan/dependency observations. Claiming itself starts no process. It atomically records one attempt, generation, controller and reservation. Independent processes cannot obtain two current attempts for the same slot. Fixture admissions remain visibly fixture and cannot certify native containment.

Default store limits are two execution workers, one per repository and four evaluators; each plan can impose tighter per-run limits. Canonical Git identity joins differently labelled shared repositories, and a named canonical remote joins distinct clones. Claimed or stopping workers continue reserving capacity. A stale heartbeat, timeout, missing repository or fresh controller cannot free their slots. Work remains pending with a reason when dependencies, capacity, current authority or actual host prerequisites fail.

A trusted controller must retain exact observed runtime identity and terminal evidence before fencing/retrying. Each retry uses a new attempt and generation. The broker rechecks the current started assignment per request, so an old worker cannot complete work or mutate through a stale peer. Actual test/gate acceptance and endpoint completion remain separate from scheduler dependency order.

## Stopping point

You have queued local metadata without launching a native model, backend, test application or remote operation. [Checkpoint and conservative ownership/effect recovery](./delivery-checkpoints.md) are now available. [Budgets](./delivery-budgets.md), [environments](./delivery-environments.md) and the [runner](./delivery-runner.md) continue from here. [ADR-0097](../decisions/0097-durable-queue-reservations-and-current-attempt-fences.md) records the local coordination boundary. Retain the external tutorial directory for inspection; no manual or account acceptance is marked passed.

<!-- docnav -->
[◀ Delivery runner controls](delivery-runner.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Delivery workers ▶](delivery-workers.md)
