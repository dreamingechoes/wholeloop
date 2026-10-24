# Delivery budgets — inspect limits and retain bounded evidence

> **TL;DR** — Bind optional usage constraints before execution, inspect unknown consumption honestly and capture binary evidence under a persistent byte quota. Restarting a process or revising a plan does not reset allowances.

> [!NOTE]
> **Status: 🚧 partial.** Persistent admission, usage accounting, no-progress detection and bounded artifact capture are implemented and process/fixture-tested. Actual native hard token/currency metering and complete unattended execution remain later Phase 6 work.

## Before you start

Complete the [checkpoint tutorial](./delivery-checkpoints.md) in the same Bash terminal. Keep WHOLELOOP_CLI and workspace_dir set. That fictional run has an active grant and no admitted worker or issued effect. The commands below affect only its disposable external store.

## Configure advisory usage

Constraints are optional, immutable and bound to the exact observed grant/plan before the run budget starts. The plan already contains finite wall, attempt, concurrency, restart, CI, repair, no-progress and artifact limits. Advisory token/currency ceilings retain missing usage honestly; a hard ceiling requires host-supported enforceable maxima before admission.

```bash
set -euo pipefail
: "${workspace_dir:?Run the checkpoint tutorial first}"
node "$WHOLELOOP_CLI" delivery status \
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
node "$WHOLELOOP_CLI" delivery budget-configure \
  --file "$workspace_dir/constraints.json" --root "$workspace_dir" \
  --store "$workspace_dir/state" --json > "$workspace_dir/budget-configured.json"
```

No token observation has occurred: value is null and completeness is unknown. Configuring or inspecting does not start the budget, launch a model or grant authority. `delivery budget-schema --json` exposes the input contract.

## Capture and inspect evidence

The first actual admission or artifact capture starts the run budget. Artifact capture requires the existing report.write permission. Bytes are reserved before file replacement, unique identical bytes are charged once, and interruption retains the reservation. Capturing evidence does not establish semantic QA, progress or acceptance.

```bash
printf 'Observed local fixture evidence.\n' > "$workspace_dir/evidence.bin"
node "$WHOLELOOP_CLI" delivery artifact \
  --run delivery-0123456789abcdef --file "$workspace_dir/evidence.bin" \
  --root "$workspace_dir" --store "$workspace_dir/state" \
  --json > "$workspace_dir/artifact-first.json"
node "$WHOLELOOP_CLI" delivery artifact \
  --run delivery-0123456789abcdef --file "$workspace_dir/evidence.bin" \
  --root "$workspace_dir" --store "$workspace_dir/state" \
  --json > "$workspace_dir/artifact-again.json"
node "$WHOLELOOP_CLI" delivery budget \
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

Quota or recognized credential omissions return exit 3 with metadata and no copied bytes; missing, oversized or aliased inputs refuse. The 8 MiB per-file bound is independent of the plan's total artifact quota. Existing observed files must remain byte-identical. Arbitrary sensitive content still needs appropriate source handling; the scanner only recognizes specific credential forms.

## Interpret exhausted runs

Read-only reports compute remaining time from the pinned original start, retained monotonic observations and current wall time. Smaller plan/grant limits apply; subsequent larger limits do not extend the run. Detected clock faults refuse continuation. Portable clocks do not prove every unobserved machine reboot or physical clock correction.

Usage reports keep delta/cumulative identities, finality and fixture/host provenance. Missing or partial usage is never treated as complete zero. Historical work without a usage reservation remains explicitly unmetered, keeps later totals partial and prevents configuring a retroactive hard cap. Hard metering charges guaranteed maxima for the run lifetime; lower partial usage does not refund reservations. Unsupported hard token/currency limits refuse host admission.

Repeated failure signatures retain their candidate/findings and exhaust the no-progress allowance. Only a new typed validated result resets the streak; a heartbeat, narration or repeated identical artifact cannot. Exhaustion does not release live worker ownership, erase gate rounds or reopen an endpoint. See [ADR-0099](../decisions/0099-persistent-finite-delivery-budgets.md) and the [expanded controls contract](../../roadmap/specifications/autonomous-delivery/07-controls-and-observability.md).

<!-- docnav -->
[◀ Delivery checkpoints](delivery-checkpoints.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Troubleshooting ▶](../troubleshooting.md)
