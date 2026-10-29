# Assemble and verify the complete milestone

> **TL;DR** — Build a separate owned integration worktree from every required committed part, then test the actual combined application and contracts. Keep failed assemblies and reports; a repair creates a new vector under the original finite budget.

> [!NOTE]
> **Status: ✅ implemented.** P6-19 owned assembly, conflict/repair ownership, current-input verification and bounded private reports pass local automated verification and actual Docker/Git observations. Complete-runner and publication orchestration remain subsequent tasks. See [ADR-0110](../decisions/0110-owned-assembly-and-complete-milestone-verification.md).

## Prerequisites and outcome

Start from an accepted [delivery plan](./delivery-plan.md), an active [original authorization](./delivery-authorization.md), committed clean required part worktrees and [pinned acceptance](./delivery-acceptance.md). The grant needs workspace.create and git.commit for assembly, and test.run for actual verification, with the selected repositories and topic prefixes. The run must be queued/running and have no unresolved foreign effects. This guide does not issue a grant or publish anything.

Run the source commands from the repository with Node ≥ 22, Git supporting canonical --path-format=absolute metadata and the [reference Docker prerequisites](./delivery-docker.md). The bundled CLI retains its Node 20 runtime minimum. Inspect the closed request, stored record, status, verification request and report contracts first:

```bash
set -euo pipefail
npm run build
node dist/wl.mjs delivery integration-assembly-schema --json
```

The schema command executes nothing and opens no store. The complete route below stops at local milestone behavioral/contract evidence. Independent review, publication checks and conditional merge keep their separate requirements.

## Pin contract and combined procedure coverage

Before builder admission, add objective cases to the immutable acceptance definition. Every selected criterion needs applicable coverage. For each produced contract, an applicable machine case must have fixture.sha256 equal to the approved contract SHA. A machine case must also include the exact milestone.procedure text in its actions. One genuine combined case can cover its criterion, contract and procedure; unrelated green component cases cannot replace missing mappings.

Use actual assertions against your public entrypoint and seeded state. Human-only criteria retain their current explicit operator-note requirement. Unsupported or unavailable hosts remain unavailable; fixture evidence remains fixture-only. Gate-policy input files identify requirements, not passing verify/review receipts.

## Create the owned assembly

Create a wholeloop/integration-assembly-request@1 JSON file in your external operator directory. Supply the actual run, revision, plan, milestone, a stable key and the complete parts array used by the [candidate guide](./delivery-integration-candidates.md). Each part names work, repository, canonical registered path, topic ref and committed head. Omit repairOf for the first assembly.

Set the variables to your actual operator directory, request file and external store, then run these terminal core commands:

```bash
set -euo pipefail
node dist/wl.mjs delivery integration-assemble --file "$assembly_request_file" --root "$operator_input_dir" --store "$delivery_store" --json
node dist/wl.mjs delivery integration-assembly-status --digest "$assembly_digest" --store "$delivery_store" --json
```

Retain digest from the returned status before inspection. The controller creates separate worktrees under the external store and topic branches under the original grant prefix. It creates worktrees first and merges in global dependency order, including cross-repository predecessors. The personal checkout, real target refs and worker files are preserved. Hooks, signing and prompts are disabled; configured controller-side Git helpers are refused. Application/test commands execute through the existing Docker hosts.

Every Git mutation has its own finite effect and native process observation. An assembled status establishes the complete Git vector, with acceptance still not-established. Conflict, failed, partial, unknown and stale outcomes exit 3. Partial repositories never become whole-feature success and trigger no rollback. A nonzero command can leave files or refs behind; inspect the retained worktree and effect rather than assuming nothing changed.

## Recover or repair

A lost issued command is observed rather than reissued. Reconcile an already-issued operation, including after revocation or supersession, with:

```bash
set -euo pipefail
node dist/wl.mjs delivery integration-assembly-reconcile --digest "$assembly_digest" --store "$delivery_store" --json
```

This dispatches no Git write and restores no authority. Missing completion proof stays unknown; no stored PID is signalled. Inspection and history remain available. Resuming actual work still requires current original scope and a queued/running run.

For a conflict or combined behavior failure, repair the owning source part in a new committed revision through its authorized builder/controller. Keep the failed integration files. Submit a fresh assembly request with a new key, updated complete part heads and repairOf naming the preceding assembly digest. The original integration-repair counter and effect/time limits apply. The new accepted assembly fences its predecessor; no worker is automatically reset/rebased, no conflict edit is discarded and no failed Git write is blindly replayed.

## Bind and run the combined environment

Use the assembled repositories' returned path/ref/head vector to prepare a current [environment recipe](./delivery-environments.md). One combined recipe/environment must cover every selected repository. Pin its actual files, seed/data identities and explicit service dependencies, then [prepare a candidate](./delivery-integration-candidates.md) using those exact owned assemblies and the original acceptance definition. Start the [owned Docker environment](./delivery-docker.md) from that candidate vector.

Create a wholeloop/integration-verification-request@1 file with four fields: schema, candidate, assembly and environment, using their actual digests/ID. Execute or reobserve it:

```bash
set -euo pipefail
node dist/wl.mjs delivery integration-verify --file "$integration_verification_file" --root "$operator_input_dir" --store "$delivery_store" --json
node dist/wl.mjs delivery integration-report --file "$integration_verification_file" --root "$operator_input_dir" --store "$delivery_store" --json
```

The first command executes required machine cases through the existing fixed hosts and retains a complete bounded report artifact. Repeating completed keys does not repeat effects. The second reobserves current evidence without executing cases. A changed part, recipe, base, assembly or environment invalidates the corresponding current result. Failed criteria return their pinned work/integration repair owner and case IDs. Relevant failed cases and their artifacts remain historical; a new assembly cannot borrow their green results.

Passing returns delegated-machine or operator-and-machine milestone evidence. Fixture-only, failed, stale, pending-human and unavailable outcomes exit 3. Whole-feature completion, independent review and publication remain unestablished by this receipt. A multi-repository plan provides no atomic code-host transaction or automatic rollback.

## Observe the model-free combined regression

With the reference images already cached, execute:

```bash
set -euo pipefail
npm run eval:assembly -- --retire-success
```

This opt-in evaluation creates two disposable local Git repositories and actual owned Docker services. Backend and frontend units pass separately while the combined API fails. A committed backend repair creates a new complete assembly and passes the unchanged contract/API cases. The test preserves personal targets, worker files, old failures and budgeted failed/passed artifacts, then observes exact owned resource retirement. Reports and fixtures remain in the printed external locations. No model account, external service, remote Git write, pull request or project merge is exercised. See the [integration specification](../../roadmap/specifications/autonomous-delivery/05-integration-and-change-impact.md) for later change-impact and publication boundaries.

## Current unit QA before assembly

The internal milestone-readiness reader derives the complete ordered unit vector from the selected milestone, its prerequisite milestones and transitive work dependencies. Each unit needs fixed original verification and independent review readers at its exact current owned commit, including any recorded correction chain. Missing reader coverage, pending QA or changed evidence returns no parts; the caller cannot request a convenient subset.

All earlier candidates and root records are checked again after the asynchronous reads. A ready result supplies only assembly inputs and explicitly leaves integration QA and feature acceptance unestablished. Inspection runs no worker, suite, Git mutation or assembly and changes no journal or budget. Actual assembly and combined application checks remain necessary. See [ADR-0157](../decisions/0157-complete-current-unit-vectors-before-assembly.md).

## Foreground runner ownership

The internal assembly adapter can accept the same fixed controller control used by owned Git stages. Every original wrapper receives the narrower deadline, combined cancellation signals and current-ownership watcher; its actual operation is registered before input. Cancelled, expired or fenced controllers cannot prepare a resource or admit another effect. A fresh controller can request cancellation of the exact original pending operation by its retained nonce, including after revocation; no stored PID is signalled.

Original reconciliation and paused inspection remain available without dispatch authority and do not replay checkout or merge. The unconfigured domain API and existing schemas remain unchanged. This control is a prerequisite for runner composition; it does not establish an executed complete route or whole-product acceptance. See [ADR-0156](../decisions/0156-original-runner-controls-for-assembly.md).

## Join current unit QA to the actual assembly

The internal assembly-readiness reader requires the complete current observed unit-QA vector and the matching owned assembly under the same run, plan, source, grant and milestone. All original Git effects must be applied and positively closed. It reopens unit QA and rechecks the assembly and basis after asynchronous inspection; changed or partial evidence returns no candidates.

Run npm run eval:runner-assembly-readiness -- --retire-success for the opt-in actual Docker/synthetic-worker control. It executes one declared application suite and independent verification/review, assembles the exact unit vector through bounded owned Git operations, refuses changed assembled bytes and recovers identical evidence after restoration and paused fresh-object inspection. No account, authenticated model or publication is used. The exact original environment retires. Readiness still leaves the root integration stage running and whole-product QA and acceptance pending. See [ADR-0158](../decisions/0158-current-unit-qa-and-owned-assembly.md).

## Original assertion evidence during recovery

The internal fixed-host case observer reopens an exact acceptance-plan/case/key receipt against its original journaled Docker test effect. It checks actual artifact bytes, capture identities, assertion outcomes, provenance and original environment/candidate bindings. Stored passing flags or copied host labels cannot replace that proof. The assembly-readiness evaluation also exercises a changed-case refusal and identical restoration without replay.

This is historical assertion evidence. Its result explicitly leaves native ownership and current acceptance unestablished; the controller must still audit the original process scope, deadlines and exact current assembled candidate before approving whole-product QA. See [ADR-0159](../decisions/0159-original-docker-assertion-observations.md).

<!-- docnav -->
[◀ Integrated milestone candidates](delivery-integration-candidates.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Original delivery evaluation fixtures ▶](delivery-evaluation-fixtures.md)
