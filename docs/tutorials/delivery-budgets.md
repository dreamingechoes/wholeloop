# Delivery budgets — inspect limits and retain bounded evidence

> **TL;DR** — Every run has **finite budgets**: wall time, attempt time, concurrency, restarts, CI pushes, repairs, rounds without progress and bytes of evidence. They start with the run's first real work, survive restarts and plan revisions, and never refill. You can add token or cost ceilings; usage nobody measured stays *unknown*, never zero.

> [!IMPORTANT]
> **Experimental.** Admission, usage accounting, no-progress detection and bounded artifact capture are tested. Token and currency limits rely on what each client reports. Autonomous delivery may change in a minor release.

**What you will have at the end:** an advisory token ceiling on the queued run, one piece of evidence captured twice but charged once, and a budget report showing the clock started.

## Before you start

Complete the [checkpoint guide](./delivery-checkpoints.md) in the same Bash terminal, so `workspace_dir` is still set. Its run has an active grant, and no worker was admitted and no effect issued. Everything below changes only the disposable store.

## Configure advisory usage

The plan already holds the finite limits. On top of them you can add **constraints**: optional, immutable, bound to the exact grant and plan, and set before the budget starts.

| Mode | Behaviour |
| --- | --- |
| `advisory` | Reported against observed usage; missing usage stays unknown |
| `hard` | Enforced, so the host must support enforceable maximums before it admits any work; otherwise admission is refused |

The script adds an advisory ceiling of 10 000 tokens:

```bash
set -euo pipefail
: "${workspace_dir:?Run the checkpoint tutorial first}"
wl delivery status \
  --run delivery-0123456789abcdef --store "$workspace_dir/state" \
  --json > "$workspace_dir/budget-state.json"
node --input-type=module - "$workspace_dir" <<'JS'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const directory = process.argv[2]
const { state } = JSON.parse(readFileSync(join(directory, 'budget-state.json'), 'utf8'))
writeFileSync(join(directory, 'constraints.json'), JSON.stringify({
  schema: 'wholeloop/delivery-budget-constraints@1', operator: 'Example Owner',
  run: state.run, basis: state.basis.digest, grantDigest: state.grant.digest,
  requirements: { tokens: { limit: 10000, mode: 'advisory' } }
}, null, 2))
JS
wl delivery budget-configure \
  --file "$workspace_dir/constraints.json" --root "$workspace_dir" \
  --store "$workspace_dir/state" --json > "$workspace_dir/budget-configured.json"
```

Configuring starts nothing. The status it returns, shortened:

```console
$ wl delivery budget-configure --file "$workspace_dir/constraints.json" --root "$workspace_dir" --store "$workspace_dir/state" --json
{
  "schema": "wholeloop/delivery-budget-status@1",
  "run": "delivery-0123456789abcdef",
  "state": "queued",
  "started": false,
  "limits": {
    "wallTimeMs": 14400000, "attemptMs": 1800000,
    "builders": 2, "buildersPerRepository": 1, "evaluators": 4,
    "restarts": 2, "ciPushes": 2, "integrationRepairs": 3,
    "noProgress": 3, "artifactBytes": 209715200
  },
  "deadline": null,
  "requirements": { "tokens": { "limit": 10000, "mode": "advisory" } },
  "usage": { "tokens": { "value": null, "completeness": "unknown" }, … },
  …
}
```

No tokens were observed, so the value is `null` and its completeness `unknown`. Configuring or inspecting a budget launches no model and grants nothing. `wl delivery budget-schema --json` prints the input contract.

## Capture and inspect evidence

The **first real admission or artifact capture starts the budget**. Capturing an artifact needs the grant's `report.write` effect. The script captures the same file twice, then reads the budget and checks it:

```bash
printf 'Observed local fixture evidence.\n' > "$workspace_dir/evidence.bin"
wl delivery artifact \
  --run delivery-0123456789abcdef --file "$workspace_dir/evidence.bin" \
  --root "$workspace_dir" --store "$workspace_dir/state" \
  --json > "$workspace_dir/artifact-first.json"
wl delivery artifact \
  --run delivery-0123456789abcdef --file "$workspace_dir/evidence.bin" \
  --root "$workspace_dir" --store "$workspace_dir/state" \
  --json > "$workspace_dir/artifact-again.json"
wl delivery budget \
  --run delivery-0123456789abcdef --store "$workspace_dir/state" \
  --json > "$workspace_dir/budget-report.json"
node --input-type=module - "$workspace_dir" <<'JS'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
const directory = process.argv[2]
const read = name => JSON.parse(readFileSync(join(directory, name), 'utf8'))
assert.equal(read('budget-configured.json').started, false)
assert.deepEqual(read('artifact-first.json'), read('artifact-again.json'))
const report = read('budget-report.json')
assert.equal(report.started, true)
assert.equal(report.counters.artifactBytes, Buffer.byteLength('Observed local fixture evidence.\n'))
assert.equal(report.usage.tokens.value, null)
assert.equal(report.usage.tokens.completeness, 'unknown')
assert.equal(report.artifacts.length, 1)
assert.equal(report.omissions.length, 0)
assert.equal(report.authority, 'not-granted')
JS
```

Both captures return the same artifact, so identical bytes are charged once:

```console
$ wl delivery artifact --run delivery-0123456789abcdef --file "$workspace_dir/evidence.bin" --root "$workspace_dir" --store "$workspace_dir/state" --json
{"schema":"wholeloop/delivery-artifact-capture@1","run":"delivery-0123456789abcdef","stored":true,"artifact":{"digest":"f846d280…","bytes":33,"ref":"delivery/artifacts/delivery-0123456789abcdef/f846d280…"},"reason":null,"authority":"not-granted"}
```

The budget has now started: `started: true`, a `startedAt` time, a `deadline` four hours later (the plan's `wallTimeMs`), and `artifactBytes: 33` in its counters. Tokens are still unknown.

**How evidence is charged.**

- Bytes are reserved **before** the file is written, and an interruption keeps the reservation.
- Each file is limited to 8 MiB, independently of the plan's total quota. Missing, oversized or aliased inputs are refused.
- Over quota, or with a recognized credential in the content, capture returns exit code 3 with metadata and copies nothing. The scanner only recognizes specific credential forms, so other sensitive content still needs care.
- Capturing evidence proves nothing about quality, progress or acceptance.

## Interpret exhausted runs

**Time.** Remaining time is computed from the pinned start, the recorded observations and the current time. A smaller limit in a later plan or grant applies; a larger one never extends the run. A detected clock fault refuses to continue. Portable clocks cannot detect every unobserved reboot or clock correction.

**Usage.** Reports keep each reading's identity, whether it is final, and whether it came from a fixture or a host.

- Missing or partial usage is never treated as zero.
- Work done before any usage reservation stays explicitly *unmetered*, which keeps later totals partial and prevents adding a hard cap after the fact.
- Hard metering charges the guaranteed maximum for the run's lifetime; using less does not refund the reservation.

**No progress.** Repeating the same failure uses up the no-progress allowance. Only a new, validated result resets it; a heartbeat, a status message or the same artifact again does not.

Running out of budget does not release a live worker, erase gate rounds or reopen an endpoint. The [controls specification](../../roadmap/specifications/autonomous-delivery/07-controls-and-observability.md) has the full contract.

<!-- docnav -->
[◀ Owned assembly and combined verification](delivery-assembly.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Delivery checkpoints ▶](delivery-checkpoints.md)
