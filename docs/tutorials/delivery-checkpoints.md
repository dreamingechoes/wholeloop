# Checkpoint inputs and recover the same queued run

> **TL;DR** — Pin exact input bytes, detect a changed input from a fresh process and resume the same run after restoring it. Inspect retained effects and writer locks separately. These commands start no worker or external operation.

> [!IMPORTANT]
> **Experimental.** Checkpoint manifests, effect and worker recovery and stopped-writer lock retention are tested with real processes. Autonomous delivery may change in a minor release.

## Before you start

Complete the [queue tutorial](./delivery-queue.md) in the same Bash terminal. Keep workspace_dir set. The example has a queued fictional run, a fresh active grant and no started attempt. All changes below affect only its external disposable store; no application source or personal configuration changes.

## Capture a checkpoint

Create one disposable input artifact alongside the already retained source. A checkpoint hashes referenced bytes, including binary files, without copying their content into its manifest. Allowed paths are bounded source/plan/envelope/artifact references; private authority paths and aliases refuse.

```bash
set -euo pipefail
: "${workspace_dir:?Run the queue tutorial first}"
node --input-type=module - "$workspace_dir" <<'JS'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const directory = process.argv[2]
const source = JSON.parse(readFileSync(join(directory, 'source.json'), 'utf8')).source
mkdirSync(join(directory, 'state/delivery/artifacts'), { recursive: true })
writeFileSync(join(directory, 'state/delivery/artifacts/probe.txt'), 'Original checkpoint input.\n')
const request = {
  schema: 'wholeloop/delivery-checkpoint-request@1', key: 'queued-inputs', stage: 'source-adopted',
  inputs: [`delivery/sources/${source.id}.json`, 'delivery/artifacts/probe.txt']
}
writeFileSync(join(directory, 'checkpoint.json'), JSON.stringify(request, null, 2))
JS
wl delivery checkpoint \
  --run delivery-0123456789abcdef --file "$workspace_dir/checkpoint.json" \
  --root "$workspace_dir" --store "$workspace_dir/state" --json > "$workspace_dir/checkpoint-receipt.json"
wl delivery checkpoints \
  --run delivery-0123456789abcdef \
  --store "$workspace_dir/state" --json > "$workspace_dir/checkpoints-current.json"
```

Expect one current checkpoint with exact path/hash/size bindings and no execution authority implied. Repeating the same capture retains its identity. Changing the inputs under the same key refuses; a genuinely new checkpoint uses a new key. Stage labels describe controller metadata, not semantic approval, a passing test or human acceptance.

## Detect changed bytes and resume after restoring them

```bash
printf 'Changed checkpoint input.\n' > "$workspace_dir/state/delivery/artifacts/probe.txt"
wl delivery checkpoints \
  --run delivery-0123456789abcdef \
  --store "$workspace_dir/state" --json > "$workspace_dir/checkpoints-stale.json"
if wl delivery recover \
  --run delivery-0123456789abcdef --resume \
  --store "$workspace_dir/state" --json > "$workspace_dir/recovery-refused.json"; then
  echo 'Expected stale inputs to refuse resume' >&2
  exit 1
else
  result_code=$?
  test "$result_code" -eq 3
fi
printf 'Original checkpoint input.\n' > "$workspace_dir/state/delivery/artifacts/probe.txt"
wl delivery recover \
  --run delivery-0123456789abcdef --resume \
  --store "$workspace_dir/state" --json > "$workspace_dir/recovery-ready.json"
wl delivery effects \
  --run delivery-0123456789abcdef \
  --store "$workspace_dir/state" --json > "$workspace_dir/retained-effects.json"
wl delivery lock-status \
  --store "$workspace_dir/state" --json > "$workspace_dir/writer-lock.json"
node --input-type=module - "$workspace_dir" <<'JS'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
const directory = process.argv[2]
const json = name => JSON.parse(readFileSync(join(directory, name), 'utf8'))
if (json('checkpoints-stale.json').checkpoints[0].status !== 'stale') throw new Error('Changed input expected')
const refused = json('recovery-refused.json')
if (refused.ready || refused.state.state !== 'paused' || !refused.problems.includes('stale-checkpoint-inputs'))
  throw new Error('Stale inputs must retain a paused run')
const ready = json('recovery-ready.json')
if (!ready.ready || ready.state.run !== 'delivery-0123456789abcdef' || ready.state.state !== 'queued')
  throw new Error('Recovery must retain and resume the same run')
if (ready.workers !== 'not-started' || ready.effects !== 'not-invoked') throw new Error('No dispatch allowed')
if (json('retained-effects.json').records.length !== 0) throw new Error('No effect may be fabricated')
if (json('writer-lock.json').inspection.status !== 'clear') throw new Error('No writer should remain')
console.log('PASS: exact checkpoint inputs, stale refusal and same-run metadata recovery')
JS
```

Recover validates current checkpoint inputs, immutable plan/local bases, private authority and retained ownership. A fresh process does not reset gates or grant limits. It does not start a replacement worker or invoke/retry an effect. --resume changes metadata to queued only after those prerequisites are known. A none policy with unresolved ownership returns blocked instead of asking for human input; its active reservation remains retained.

## Interrupted writers and ambiguous effects

Ordinary commands never steal a lock. If lock-status reports stopped, inspect its exact owner/digest and run delivery repair-lock with --owner-digest and the same --store. Repair accepts only an observed absent PID for that unchanged record, rechecks directory identity and moves the original lock into delivery/recovered-locks with a receipt. It signals no process and restores no authority. A live/reused PID, missing/future owner data, inaccessible process or interrupted repair-control lock requires inspection. Never remove another writer's lock because it is old.

Effect inspection shows retained local records, not a new remote read. The trusted host API persists a finite invocation before one conditional operation and observes the exact result separately. Pending/unknown actions cannot be executed again; conflicting writes and successful closure remain blocked. An absent resource read cannot establish not-applied until the original invocation is confirmed stopped. Only an unissued prepared intent can be abandoned. Actual provider/backend hosts and PR/merge-specific eligibility remain later increments.

Use delivery recovery-schema --json for checkpoint request/manifest and effect-intent contracts; delivery state-schema also includes every registered event/facet family. [ADR-0098](../decisions/0098-checkpoint-recovery-and-observed-effect-reconciliation.md) explains finite read retries, process ownership, explicit lock repair and the remaining native acceptance boundary. Retain the external tutorial directory; this exercise marks no human/native/account acceptance passed.

<!-- docnav -->
[◀ Delivery budgets](delivery-budgets.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Delivery recovery ▶](delivery-recovery.md)
