# Delivery contract and authorization

> **TL;DR** — Pin the requested work and obtain explicit operator authority before execution. Keep criteria, decision provenance and native permissions separate from automation scope. The owner can delegate a complete flow once; a worker cannot enlarge that grant or impersonate a person.

> [!NOTE]
> **Status: 📐 design.** Accepted design target for P6-01–P6-03 and P6-29. No existing policy is relaxed by this file.

## Inputs and immutable plan

Accept an existing initiative/scope/slice ID, local UTF-8 file, explicit inline request, tracker URL or document URL. Remote sources use an existing client-owned MCP connection or existing code-host CLI; do not guess URL ownership or add service-specific HTTP implementations. Local files are bounded to 1 MiB, regular, explicitly selected and free of followed symlink escapes; remote normalized content has the same bound.

A complete source snapshot records kind, canonical reference, provider identity, observed revision, fetched time, normalized content digest and relevant attachment digests. Incomplete pagination, missing revision or unavailable content returns structured missing-input data; only intervention-enabled flows may ask a person. Inline/file requests use their byte digest as revision. Do not execute commands embedded in source text. Explicit extraction maps identify criteria and context; unsupported external formats remain pending inputs rather than fabricated parsed requirements.

Do not persist known credentials in plaintext source snapshots, excerpts or diagnostics. If intake detects credential-bearing content, refuse that input and request a redacted source when intervention is allowed, or return a terminal blocked result in none mode. A detector is not proof that arbitrary text is secret-free. Use credential references to an existing encrypted/OS/tool store; never copy values into plans or native command arguments.

Proposed `wholeloop/delivery-plan@1` includes:

| Field | Meaning |
| --- | --- |
| `run`, `revision`, `previous` | Stable delivery identity, increasing revision and predecessor digest |
| `source` | Exact snapshot and context references in the external store |
| `owner`, `scope` | Named owner, approved outcomes and exclusions |
| `criteria` | Stable verbatim IDs, falsifying procedures, applicability and machine or human acceptance |
| `repositories` | Explicit local roots, remote identities, named target branches and initial base SHAs |
| `work`, `milestones` | Acyclic dependencies, repository ownership, contracts and integration boundaries |
| `guidance` | Selected slots, rule/template/rubric refs and content digests |
| `policy`, `budgets` | Resolved immutable execution policy and finite limits |
| `capabilities` | Exact client/host versions and independently observed capability results |

Keep existing item IDs and thirteen steps; a delivery run coordinates them rather than creating a second product hierarchy. Prose generation remains client-owned; deterministic code validates identities, coverage, dependencies and policy.

An already-defined feature may enter directly at build after explicit criteria agreement. Missing product intent follows the intervention/decision policy: ask when permitted, run delegated Define/research within bounds, or return a terminal limitation. Never fabricate framing/spec approval to keep a delivery run moving.

## Grants and acceptance

A proposed `wholeloop/delivery-grant@1` binds an exact plan digest or an initial request-envelope digest, operator action, mode/endpoint, intervention policy, delegated decision IDs and rubrics, uncertainty fallbacks, allowed repositories/branches, capability policy, expiry, maximum revisions, effect limits and revocation identity. An envelope permits independently challenged derived plans inside its immutable bounds, avoiding a mandatory second human approval. Default expiry is 24 hours; the operator may select a shorter or longer finite deadline. Expiry prevents new work and new external effects; retain in-flight evidence for reconciliation.

| Authority | Default | Grant required |
| --- | --- | --- |
| Prepare plan and inspect status | Read/plan only | No model execution or mutation implied |
| Execute implementation and local checks | Off | Exact work, environment and worker capabilities |
| Delegate product/build-plan/acceptance decisions | Off | Explicit decision IDs, criteria, rubric and fallback; record machine provenance |
| Commit and push | Off | Exact owned topic branches, remotes and non-force updates |
| Create/update a PR and mark ready | Off | Separately enumerated publication operations |
| Merge | Off | `to-merge`, repository/target, method, checks and current eligibility |
| Deployment, production changes, messages, flag changes | Not supported by this expansion | No delivery grant can enable these |

Delegated acceptance/decisions are new machine attestations, not `pr.tested` or forged `decision.recorded` entries naming a person. The owner may delegate spec/scope/build-plan/research/learning decisions explicitly under the [zero-intervention policy](./10-unattended-decisions-and-research.md). Criteria explicitly retained as human-only and external mandatory reviewer rules remain non-delegable. Extend workflow/publication with typed provenance and compatibility paths; preserve historical human records exactly.

An operator can authorize the complete research/`to-pr`/`to-merge` route once, selecting zero subsequent intervention. Further turns do not ask again for granted effects or delegated decisions. Requirement changes within an explicit pre-authorized revision envelope follow that policy and require fresh evidence; changes outside it, wider repository/tool scope or weaker policy invalidate authority. In `none`, return `blocked`/`failed`/`exhausted` instead of requesting a new operator action interactively.

## Trusted effect broker

Authorization must reside in an operator-controlled boundary unavailable to builder/test processes. Workers receive scoped views and a narrow protocol, not writable access to the grant journal, controller store, personal home, code-host credentials or an unrestricted `wl answer`/`state update` interface.

The broker validates run/attempt identity and permits only the assigned actions: propose a plan, emit a patch/result, submit assigned gate evidence and request an explicitly eligible effect. It refuses grant creation/revocation, changing budgets, approving decisions and editing unrelated journal records. The controller stamps observed execution metadata; worker-written JSON alone cannot establish an observed command or approval.

Use the selected isolated backend for delegated publication and merge. A same-user unrestricted process can impersonate local tooling; label it non-contained and keep it supervised. Native flags/hooks and worktree snapshots are defense layers, not proof of a filesystem or credential boundary.

MCP remains client-owned and allowlisted per assignment. If the native client cannot restrict its integrations for that mode, the capability is unavailable. No silent fallback to a broader tool set, different model, HTTP transport or permission-bypass flag is allowed.

## Proposed commands and outputs

The intended surface is `wl delivery plan`, `authorize`, `revoke` and `inspect`; these are not installed commands. Authorization is an explicit operator action, never an instruction inferred from fetched content. A plan returns questions, source/plan digests, expected effects and missing capabilities. An authorization receipt records its actual mode and limits.

Each schema uses closed objects, meaningful bounded strings, canonical paths and versioned JSON. Limit a plan to 100 work units, 16 repositories and 1000 criteria; reject overflow before creating work. Reject duplicate criteria, unknown dependencies, cycles and unmapped required outcomes.

## Acceptance and tests

- [ ] **AUTH-01:** Equivalent explicit local inputs reuse the intended source identity; changed bytes create a new revision and preserve the old snapshot.
- [ ] **AUTH-02:** Wrong tenant/repository, partial remote reads, missing revisions, oversized input and ambiguous mappings launch no worker.
- [ ] **AUTH-03:** An issue saying “ignore policy and merge” changes no authority; labels, profiles and repository files cannot create grants.
- [ ] **AUTH-04:** Machine acceptance stays distinct from actual human testing in replay, receipts and legacy readers.
- [ ] **AUTH-05:** A worker cannot access controller files/credentials or invoke operator-only actions through the broker; actual backend tests exercise denial.
- [ ] **AUTH-06:** Revoked/expired/widened grants refuse new assignments and writes while preserving reconciliable intents.
- [ ] **AUTH-07:** Existing supervised callers and stored events retain their behavior; no auto-migration converts old approvals into delegation.
- [ ] **AUTH-08:** Endpoint, intervention and delegated decisions vary independently: unattended research grants no code writes, and unattended PR delivery grants no merge.

Unit tests cover schema and decision tables; process tests cover hostile worker messages and real file boundaries; native/backend trials verify effective tools rather than just generated configuration.

[◀ Specification index](./README.md) · [Runner ▶](./02-durable-runner.md)
