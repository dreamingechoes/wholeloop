# Delivery workers — understand assignments and execution evidence

> **TL;DR** — A worker receives one exact fresh assignment, explicit pinned context and role tools. Its response stays a claim; the controller records actual execution separately, and acceptance remains a later independent decision.

> [!IMPORTANT]
> **Experimental.** Assignment and result codecs, lease-bound context and observation checks are tested. This guide starts no worker. Autonomous delivery may change in a minor release.

## Inspect the contracts

Use the `wl` CLI ([getting started](../getting-started.md#install-the-cli)). This command reads bundled schemas; it needs no store, account, model or execution permission.

```bash
set -euo pipefail
wl --version
wl delivery worker-schema --json | node --input-type=module -e '
import assert from "node:assert/strict"
let input = ""
for await (const chunk of process.stdin) input += chunk
const contracts = JSON.parse(input)
assert.equal(contracts.schema, "wholeloop/delivery-worker-schema@1")
assert.equal(contracts.assignmentSchema.additionalProperties, false)
assert.equal(contracts.resultSchema.additionalProperties, false)
assert.equal(contracts.resultSchema.properties.origin.const, "worker-claim")
assert.equal(contracts.executionSchema.properties.origin.const, "controller-observation")
assert.equal(contracts.executionSchema.properties.acceptance.const, "not-established")
assert.equal(contracts.assignmentSchema.properties.tools.properties.askUser.const, false)
assert.equal(contracts.assignmentSchema.properties.tools.properties.interactive.const, false)
assert.equal(contracts.assignmentSchema.properties.identity.properties.role.enum.length, 7)
console.log("PASS: exact worker claims, separate execution observations and no interactive worker tools")
'
```

## What enters a fresh assignment

| Input | Binding |
| --- | --- |
| Identity | Exact run, immutable plan/revision, role, unit, opaque attempt and fencing generation |
| Authority metadata | Current private grant digest and independent endpoint/intervention axes; metadata creates no grant |
| Work | Source-derived brief, exact selected criteria, contracts and retained finding IDs |
| Candidate | Observed repository commit and workspace byte snapshot |
| Environment | Explicit backend environment, recipe and boundary references; references alone prove no containment |
| Resume pack | Explicit relative artifact paths, byte counts, hashes and audiences; at most 1 MiB total |
| Limits | Current finite run/attempt reservation and original deadline |

The controller assembles ordinary work only from a current claimed queue attempt. A builder receives a separate allocated topic worktree rather than the person's checkout. Consumed contract and guidance bytes must match the immutable plan. Initial-envelope work also needs independent derived-plan acceptance. Changed inputs, stale generations, missing guidance or expired authority refuse preparation. Preparation is read-only metadata work and starts no execution.

## Tools and privacy

Builders alone can write implementation, through an actually supported allocated-workspace boundary. Reviewers, verifiers, refuters and researchers receive read-only implementation tools; research reads still need their separate provider scopes. Planner/challenger contexts have no implementation workspace or generic broker methods. Each worker's output directory is separate from its context and other workers' files.

Private acceptance is confined to its own verifier attempt. Shared context and builder/reviewer assignments cannot contain descriptors labeled hidden acceptance. The controller must classify and select the right inputs; schemas cannot detect hidden semantics in an arbitrarily mislabeled document. A hashed resume artifact never restores credentials, old conversation permissions or a previous fence.

Workers never ask the owner directly, including in supervised mode. They return blocked, unavailable or owned unknowns to the controller, which applies the chosen intervention/decision policy. None mode therefore needs no worker question tool; the complete decision router still has its own implementation task. These protocol rules require actual native/backend enforcement before the capability is advertised.

## Interpret a response honestly

Complete responses include the exact assignment and full identity, status, summary, declared artifacts, criterion claims, findings and unknowns. Missing identity is never reconstructed. Truncated/non-UTF-8/oversized output, extra process/authority/human-testing fields, out-of-scope criteria and invented evidence references refuse. A complete worker result is still worker-claim; it cannot satisfy testing, gates, publication or merge.

Only the trusted host records actual runtime identity, exit/cancellation, output hashes and fixture/host provenance in a separate execution receipt. Before successful execution is recorded, it validates every claimed artifact's actual owned output bytes and current lease/deadline. A zero process exit or successful model call does not establish semantic acceptance. Failed/cancelled observations retain their limits without inventing missing exits or parsed results.

There is no CLI command to import a successful process receipt or mark a worker completed from arbitrary JSON. Native dispatch and backend isolation are subsequent tasks. See [ADR-0100](../decisions/0100-role-bound-worker-contexts-and-execution-observations.md), the [runner specification](../../roadmap/specifications/autonomous-delivery/02-durable-runner.md) and the [acceptance boundaries](../v1-acceptance.md).

<!-- docnav -->
[◀ Delivery queue](delivery-queue.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Native delivery hosts ▶](delivery-native.md)
