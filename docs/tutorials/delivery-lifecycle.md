# Stop and retire an owned application environment

> **TL;DR** — Stop fences further startup, observes owned containers stopped and retains data. Explicit retirement removes only exact owned resources after shutdown. A stable request can recover an interruption without repeating an already applied removal.

> [!NOTE]
> **Status: ✅ implemented.** Closed requests, private cancellation, observed stop, partial recovery and explicit Docker retirement are implemented. Actual reference observations cover this macOS arm64 controller/Linux aarch64 daemon. Independent Linux-host and native-client acceptance remain open.

## Prerequisites

Use an environment created through the [Docker guide](./delivery-docker.md), its external store, and the same trusted local Docker daemon. Set WHOLELOOP_CLI to the absolute built dist/wl.mjs path. The operator controls these commands; they are absent from worker broker permissions. A stopped run needs no renewed execution grant to shut down its exact owned resources.

The lifecycle needs POSIX ps with numeric pid/pgid output. A missing or denied process-table observation produces unknown and retains resources rather than guessing that a caller has stopped. No additional npm dependency is needed.

## Inspect the closed contracts without Docker

From the repository root, with WHOLELOOP_CLI already set:

```bash
set -euo pipefail
node "$WHOLELOOP_CLI" delivery environment-lifecycle-schema --json
```

The result is wholeloop/environment-lifecycle-schema@1, four closed contracts and executed: false. This command performs no backend operation. The schema-only instruction is suitable for an offline shell; the following procedure requires an actual owned environment.

## Review and stop

Set STORE to its absolute external store path and ENVIRONMENT_ID to the recorded environment ID. Use a fresh external directory for non-secret requests and receipts:

```bash
set -euo pipefail
WORK="$(mktemp -d "${TMPDIR:-/tmp}/wholeloop-lifecycle.XXXXXX")"
export WORK ENVIRONMENT_ID
node "$WHOLELOOP_CLI" delivery environment-status \
  --environment "$ENVIRONMENT_ID" --store "$STORE" --json > "$WORK/status.json"
node --input-type=module <<'JS'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const work = process.env.WORK
const current = JSON.parse(readFileSync(join(work, 'status.json'), 'utf8'))
if (current.environment.record.id !== process.env.ENVIRONMENT_ID) throw Error('Wrong environment')
const request = {
  schema: 'wholeloop/environment-lifecycle-request@1',
  id: 'reviewed-stop',
  environment: process.env.ENVIRONMENT_ID,
  expected: current.environment.digest,
  action: 'stop',
  reason: 'Stop this reviewed environment and retain its data and evidence.',
}
writeFileSync(join(work, 'stop.json'), JSON.stringify(request, null, 2) + '\n')
JS
node "$WHOLELOOP_CLI" delivery environment-stop --root "$WORK" \
  --file stop.json --store "$STORE" --json > "$WORK/stop-receipt.json"
```

Expect retained when owned volumes remain, or stopped when none remain. ReviewAfter is a reminder, never an automatic deletion time. External recipe/runtime/operation histories survive both stop and retirement. Stopping does not run ledger undo, delete a branch/worktree, publish code or establish QA acceptance.

Exit 3 or state unknown means observations are incomplete. Inspect retained receipts and resources; do not remove guessed names. A denied or changed daemon/identity never becomes evidence of absence. The permanent fence prevents later provisioning from dispatching new work. Application restart after explicit stop requires a separately reviewed new environment; reconciliation never replays startup.

## Recover an interruption

Rerun the exact stop request after a controller interruption. A successor must observe the previous controller absent, cancel registered native clients through their private channels, and observe their complete groups absent. It never signals a PID from history. A reused/live process identity remains unknown. Retain the original request file: an identical completed request returns its historical receipt without new mutations.

The environment-reconcile command accepts the same closed shape with action: reconcile, a new stable ID and the current runtime digest. It permanently stops/inspects the owned environment and retains data. To finish an interrupted retirement, rerun the original environment-retire request instead. A fresh request reviews the current digest; a changed binding under the same request ID refuses.

Incomplete pre-tracking environments cannot acquire invented stopped-client proof. Known owned services may be stopped, but destructive retirement remains unavailable while the old invoker is uncertain. Do not manufacture metadata to bypass that boundary.

## Explicit retirement

Review environment-status again and create a new request using its current environment.digest, a new ID and action: retire. Invoke environment-retire with that file, external root and store. This is the explicit choice to remove the owned disposable data, including retained failure volumes.

Retirement verifies the original daemon and each resource's exact ID, name, labels, token and creation fingerprint. It removes stopped containers, networks and volumes in that order, without force removal. Successful filtered listing must then observe exact absence. A lost response is inspected before continuation; an already absent resource is not removed again. A same-name foreign resource remains untouched. Unknown state retains reservations and partial-cleanup evidence.

## Run the actual interruption evaluation

From a source checkout with the cached pinned image and disposable Docker permissions:

```bash
set -euo pipefail
npm run eval:environments -- --retire-success
```

The evaluation includes actual shutdown with retained volumes, an unrelated same-name volume collision, a deliberately killed retirement controller and a fresh compiled CLI completing retirement. It kills only its own disposable test controller. Unexpected failures retain resources for inspection. Its report records host/daemon architecture separately and executes no model/account/publication trial. See [ADR-0104](../decisions/0104-owned-environment-lifecycle-and-private-cancellation.md) for why PID signaling, guessed names and retention timers are rejected.

<!-- docnav -->
[◀ Docker application environments](delivery-docker.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Behavioral acceptance and evidence ▶](delivery-acceptance.md)
