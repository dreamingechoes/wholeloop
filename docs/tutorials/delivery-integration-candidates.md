# Prepare exact integrated milestone candidates

> **TL;DR** — Record the complete committed result and inputs of an approved milestone, then check whether that exact vector is still current. Preparation observes Git and protected inputs; actual controller assembly and whole-product execution follow separately.

> [!NOTE]
> **Status: ✅ implemented.** Closed candidate preparation, immutable external records, current inspection and conservative comparison are implemented. These operations grant no execution/publication authority and establish no passing acceptance. See [ADR-0109](../decisions/0109-exact-read-only-integrated-milestone-candidates.md).

## Prerequisites and stopping point

Run from the source repository with Node ≥ 22 and Git supporting canonical --path-format=absolute metadata; the bundled CLI retains its Node 20 runtime minimum. Prepare an accepted [delivery plan](./delivery-plan.md), pinned [acceptance definitions](./delivery-acceptance.md), [environment recipes](./delivery-environments.md), and separate clean registered topic and assembly worktrees. Select a code milestone whose required work has committed revisions. Research-only work does not have a code assembly candidate.

```bash
set -euo pipefail
npm run build
node dist/wl.mjs delivery integration-schema --json
```

This inert command returns the complete request, candidate and stored-record schemas. It neither opens a store nor changes Git. Preparation stops at a read-only observed proposal; the candidate explicitly records execution and publication as not-performed, acceptance as not-established and authority as not-granted.

## Assemble the request

Create a wholeloop/integration-candidate-request@1 JSON file in an operator-controlled directory outside the worker workspaces. Use the schema output for the complete closed shape; the following table explains the required identities rather than supplying invented executable IDs.

| Field | Required value |
| --- | --- |
| run, revision, plan | Exact accepted delivery plan identities |
| milestone, strategy | Approved milestone ID and ordered-merge |
| parts | Every required work/predecessor ID with repository, absolute registered worktree path, refs/heads topic ref and actual committed head |
| assemblies | One separate registered worktree per selected repository, with topic ref, approved base and actual assembly head containing every required part |
| contracts | Exact produced contract ID/revision/SHA triplets from the required work closure |
| inputs | Complete acceptance, recipe, data and per-repository verify/review requirement identities with a closed acyclic after graph |
| repairOwners | Exactly one work or integration owner for every selected criterion |

For acceptance and recipe inputs, ref and sha256 both equal the prepared typed-record digest; preparation loads and validates the actual record. For data and gate-policy inputs, ref names a protected file under the external store and sha256 hashes its actual bytes. Every declared recipe data ID needs a matching data input ID. Every selected repository needs a recipe and one verify and one review requirement. Only gate-policy inputs carry repository and gate fields. Requirement bytes are not passing gate evidence.

Do not point at the personal checkout or real target branch. Worktrees must be clean, unlocked, canonical and registered to the planned repository. Parts must include their committed same-repository predecessors; merely writing a compatible file without committing the predecessor is refused. Assembly worktrees must be separate from part worktrees. Existing supplied assembly commits remain proposals; preparation does not create them or certify their provenance.

## Prepare, inspect and compare

Set the shell variables to your actual operator input directory, JSON file and external store. These are core terminal calls, not native skill invocations:

```bash
set -euo pipefail
node dist/wl.mjs delivery integration-candidate --file "$integration_request_file" --root "$operator_input_dir" --store "$delivery_store" --json
node dist/wl.mjs delivery integration-inspect --digest "$integration_candidate_digest" --store "$delivery_store" --json
node dist/wl.mjs delivery integration-compare --before "$previous_integration_digest" --after "$integration_candidate_digest" --store "$delivery_store" --json
```

Retain the digest returned by preparation before running inspection. Identical complete requests normalize to the same immutable record. Records live under delivery/integration-candidates in the external store and remain readable across fresh processes. Inspection rechecks current Git, target bases and protected input bytes. A stale inspection or blocked preparation exits 3; preserve its typed reason. In particular, target-base-advanced requires a newly authorized plan basis rather than an implicit rebase.

A committed repair creates a new vector after its assembly and recipes have been updated. Old records remain historical and become stale. Comparison only compares historical complete input identities: even sameInputs true returns executionReuse not-authorized. Current inspection and later execution evidence are still required. No personal or worker checkout is reset, no target is updated, and multiple repositories imply neither whole-feature success nor automatic rollback.

## Run the model-free Git evaluation

From the source repository, execute:

```bash
set -euo pipefail
npm run eval:integration
```

This creates disposable local Git repositories and an external store, exercises a two-repository candidate, input normalization, dirty predecessors, unknown contracts, protected-input edits, a committed repair and a moving base. It retains the actual fixture, bundled evaluator and JSON report in the printed external locations. It does not need Docker, model credentials or service accounts. It executes no combined application, remote Git write, PR or merge. Continue with the [integration design](../../roadmap/specifications/autonomous-delivery/05-integration-and-change-impact.md) for the remaining assembly and change-impact work.

<!-- docnav -->
[◀ Private acceptance and regression sensitivity](delivery-private-acceptance.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Owned assembly and combined verification ▶](delivery-assembly.md)
