# Inspect delivery history and rebuild its cache

> **TL;DR** — Track a prepared plan, inspect it from independent processes, read its retained events and rebuild a missing projection. None of these operations starts a worker, grants authority or performs an external effect.

> [!IMPORTANT]
> **Experimental.** Metadata and cache recovery are tested; [checkpoint recovery](./delivery-checkpoints.md) covers ownership and stopped writers. Autonomous delivery may change in a minor release.

## Before you start

Complete the [planning](./delivery-plan.md) and [authorization](./delivery-authorization.md) tutorials in the same Bash terminal. Keep workspace_dir set. Authorization's last step revokes the fictional grant; this example deliberately retains that truthful observation. All example inputs and runtime files stay in the disposable external directory.

## Track and inspect the retained basis

```bash
set -euo pipefail
: "${workspace_dir:?Run the planning and authorization tutorials first}"
wl delivery track \
  --run delivery-0123456789abcdef --revision 1 \
  --grant authorization-0123456789abcdef \
  --store "$workspace_dir/state" --json > "$workspace_dir/tracked.json"
wl delivery status \
  --run delivery-0123456789abcdef \
  --store "$workspace_dir/state" --json > "$workspace_dir/status.json"
wl delivery events \
  --run delivery-0123456789abcdef --limit 1 \
  --store "$workspace_dir/state" --json > "$workspace_dir/events.json"
```

Expect state planned, grant.status revoked, projectionCache current, authority not-implied and effects not-performed. An immutable plan and an authorization observation do not mean work ran. Repeating identical track adds no event. Initial-envelope tracking uses --envelope with its digest instead of --revision; a fitting first plan can later register its own revision without duplicating the run.

Event sequence numbers are global within the delivery journal; --after is an exclusive sequence cursor. nextCursor is the last returned sequence when another page exists, otherwise null. --limit accepts 1–1000 (default 100). These queries never mark mailbox messages read. Use delivery state-schema --json for both envelopes and the exact registered payload/facet schemas; validating only an envelope omits required family validation.

## Recover a missing projection

The next snippet moves aside only this disposable run's projection, preserving the original cache for comparison. It does not touch journal segments or private authorization artifacts.

```bash
node --input-type=module - "$workspace_dir" <<'JS'
import { readFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
const directory = process.argv[2]
const tracked = JSON.parse(readFileSync(join(directory, 'tracked.json'), 'utf8'))
const status = JSON.parse(readFileSync(join(directory, 'status.json'), 'utf8'))
if (tracked.state.digest !== status.state.digest || status.state.grant.status !== 'revoked')
  throw new Error('The independent inspection must retain the exact revoked basis')
const cache = join(directory, 'state/delivery/state/delivery-0123456789abcdef.json')
renameSync(cache, cache + '.retained')
JS
wl delivery status \
  --run delivery-0123456789abcdef \
  --store "$workspace_dir/state" --json > "$workspace_dir/missing-cache.json"
wl delivery rebuild \
  --store "$workspace_dir/state" --json > "$workspace_dir/rebuilt.json"
wl delivery rebuild \
  --store "$workspace_dir/state" --json > "$workspace_dir/repeated-rebuild.json"
node --input-type=module - "$workspace_dir" <<'JS'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
const directory = process.argv[2]
const json = name => JSON.parse(readFileSync(join(directory, name), 'utf8'))
if (json('missing-cache.json').projectionCache !== 'missing') throw new Error('Missing cache expected')
if (json('rebuilt.json').written !== 1 || json('repeated-rebuild.json').written !== 0)
  throw new Error('Rebuild must repair once without repeating writes')
if (json('rebuilt.json').authority !== 'not-restored') throw new Error('No authority recovery allowed')
const cache = join(directory, 'state/delivery/state/delivery-0123456789abcdef.json')
if (!readFileSync(cache).equals(readFileSync(cache + '.retained')))
  throw new Error('Rebuilt projection must match the retained bytes')
console.log('PASS: independent replay, exact cache repair and no authority reconstruction')
JS
```

Status still succeeds without a cache because it replays the journal. The first rebuild reports one written projection and the next zero. It never reconstructs a missing grant, renews expiry, starts a worker or retries a remote operation. Historical active observations must not be used as a live permission check.

## Interruption and version limits

A delivery transaction commits one immutable, atomically replaced numbered journal segment before writing its projections. Interrupted projection writes can be rebuilt from that segment. An incomplete/corrupt segment, unknown event/facet version or mismatched identity refuses replay/writes; preserve those original files for inspection. Rebuild refuses recognizable future cache versions rather than overwriting a newer writer's state. Namespace aliases into other private files also refuse.

A killed writer may retain a store lock. This increment does not guess whether its worker/resources are still alive or steal that lock; use the [checkpoint/ownership recovery guide](./delivery-checkpoints.md) for the implemented controller contracts and explicit non-destructive stopped-writer repair. Actual native/backend ownership remains separate acceptance. [ADR-0096](../decisions/0096-replayable-delivery-journal-without-authority-recovery.md) explains the commit boundary, version registry and compatibility decisions.

Retain the external tutorial directory for inspection. Existing item-state commands and human/PR history remain separate and unchanged. No manual/native/service acceptance is marked passed by this local exercise.

<!-- docnav -->
[◀ Delivery checkpoints](delivery-checkpoints.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Original delivery evaluation fixtures ▶](delivery-evaluation-fixtures.md)
