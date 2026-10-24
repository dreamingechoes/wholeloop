# Delivery contract and authorization

> **TL;DR** — Pin the requested work and obtain explicit operator authority before execution. Keep criteria, decision provenance and native permissions separate from automation scope. The owner can delegate a complete flow once; a worker cannot enlarge that grant or impersonate a person.

> [!NOTE]
> **Status: 🚧 partial.** P6-01 source intake, P6-02 plan/envelope preparation and P6-03 grant/revocation metadata plus broker admission/request validation are implemented. Actual native/backend execution and requirement revision handling remain later increments. No existing human gate is relaxed by these metadata contracts.

## Inputs and immutable plan

Accept an existing initiative/scope/slice ID, local UTF-8 file, explicit inline request, tracker URL or document URL. Remote sources use an existing client-owned MCP connection or existing code-host CLI; do not guess URL ownership or add service-specific HTTP implementations. Local files are bounded to 1 MiB, regular, explicitly selected and free of followed symlink escapes; remote normalized content has the same bound.

A complete source snapshot records kind, canonical reference, provider identity, observed revision, fetched time, normalized content digest and relevant attachment digests. Incomplete pagination, missing revision or unavailable content returns structured missing-input data; only intervention-enabled flows may ask a person. Inline/file requests use their byte digest as revision. Do not execute commands embedded in source text. Explicit extraction maps identify criteria and context; unsupported external formats remain pending inputs rather than fabricated parsed requirements.

Implemented intake uses delivery source --file request.json and delivery source-schema, plus DeliverySources.captureFromHost for reads through existing provider operations. Snapshots preserve exact UTF-8 text and the first accepted fetch time. Explicit maps use inclusive one-based line ranges; empty maps retain context without inventing criteria. CLI observations are labelled import and never authenticated by their JSON contents. See the [tutorial](../../../docs/tutorials/delivery-intake.md) and [ADR-0093](../../../docs/decisions/0093-immutable-delivery-source-intake.md). No worker, plan, grant or decision is created by intake.

Do not persist known credentials in plaintext source snapshots, excerpts or diagnostics. If intake detects credential-bearing content, refuse that input and request a redacted source when intervention is allowed, or return a terminal blocked result in none mode. A detector is not proof that arbitrary text is secret-free. Use credential references to an existing encrypted/OS/tool store; never copy values into plans or native command arguments.

Implemented `wholeloop/delivery-plan@1` includes:

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

The implemented [planning tutorial](../../../docs/tutorials/delivery-plan.md) prepares a closed envelope before its derived plan, then inspects the exact revision in another process. Plan/envelope proposals pin descriptors and local observations without claiming actual runtime capability, semantic acceptance or authorization. Plans use run IDs prefixed delivery-, increasing revision numbers and an optional previous digest (absent only at revision one). Immutable planning records remain separate from legacy item events; delivery lifecycle journaling follows in P6-04. [ADR-0094](../../../docs/decisions/0094-revision-bound-delivery-plans-and-envelopes.md) defines the implemented contract and conservative envelope fit.

An already-defined feature may enter directly at build after explicit criteria agreement. Missing product intent follows the intervention/decision policy: ask when permitted, run delegated Define/research within bounds, or return a terminal limitation. Never fabricate framing/spec approval to keep a delivery run moving.

## Grants and acceptance

The implemented wholeloop/delivery-grant@1 binds an exact plan or initial-envelope basis, explicit operator action, endpoint/intervention policy, named delegated decisions, finite budgets/effect limit, read/repository/topic scopes, expiry and revocation identity. The referenced plan/envelope retains rubric, capability and revision bounds. Initial-envelope code assignments require structural fit and separately verified independent plan acceptance; the actual decision/worker host follows in P6-08/P6-34. Default expiry is 24 hours; an explicit finite deadline may be shorter or longer. Repeating the same action ID does not renew it. Actual assignment/effect admission refuses expired/revoked grants; full runner reconciliation/counters remain later increments. See the [authorization guide](../../../docs/tutorials/delivery-authorization.md) and [ADR-0095](../../../docs/decisions/0095-operator-grants-and-scoped-worker-claims.md).

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

The implemented broker closes over controller-selected run/plan/attempt/generation and role/cell scope. Admission and each message recheck current context, grant and the trusted runtime boundary. Requests may propose artifacts, submit scoped worker claims/findings, request a named read or propose an explicitly owned local commit; recording them performs none of those effects. Publication/merge stay controller-only after later eligibility. The worker channel refuses grant creation/revocation, budget changes and forged human records. Actual execution stamping/dispatch follows in the worker/runner increments; worker JSON alone cannot establish an observed command or approval. Runtime callbacks are read-only lease observations, not worker-supplied proofs or nested store mutations.

Use the selected isolated backend for delegated publication and merge. A same-user unrestricted process can impersonate local tooling; label it non-contained and keep it supervised. Native flags/hooks and worktree snapshots are defense layers, not proof of a filesystem or credential boundary.

MCP remains client-owned and allowlisted per assignment. If the native client cannot restrict its integrations for that mode, the capability is unavailable. No silent fallback to a broader tool set, different model, HTTP transport or permission-bypass flag is allowed.

## Proposed commands and outputs

Installed preparation commands are wl delivery plan-schema, envelope, plan and inspect-plan. They return versioned proposals, immutable digests and a proposed route. Operator metadata commands are delivery authority-schema, authorize, grant and revoke. They record/inspect explicit permissions without starting a process or performing external effects. Full run inspection/execution remains later work. Authorization is an explicit operator control action, never an instruction inferred from fetched content; its receipt records exact mode, scope, deadline and limits.

Each schema uses closed objects, meaningful bounded strings, canonical paths and versioned JSON. Limit a plan to 100 work units, 16 repositories and 1000 criteria; reject overflow before creating work. Reject duplicate criteria, unknown dependencies, cycles and unmapped required outcomes.

## Acceptance and tests

- [x] **AUTH-01:** Equivalent explicit local inputs reuse the intended source identity; changed bytes create a new revision and preserve the old snapshot. Executed by P6-01's local/file/item and independent-process tests.
- [ ] **AUTH-02:** Wrong tenant/repository, partial remote reads, missing revisions, oversized input and ambiguous mappings launch no worker.
- [ ] **AUTH-03:** An issue saying “ignore policy and merge” changes no authority; labels, profiles and repository files cannot create grants.
- [ ] **AUTH-04:** Machine acceptance stays distinct from actual human testing in replay, receipts and legacy readers.
- [ ] **AUTH-05:** A worker cannot access controller files/credentials or invoke operator-only actions through the broker; actual backend tests exercise denial.
- [ ] **AUTH-06:** Revoked/expired/widened grants refuse new assignments and writes while preserving reconciliable intents.
- [ ] **AUTH-07:** Existing supervised callers and stored events retain their behavior; no auto-migration converts old approvals into delegation.
- [ ] **AUTH-08:** Endpoint, intervention and delegated decisions vary independently: unattended research grants no code writes, and unattended PR delivery grants no merge.

Unit tests cover schema and decision tables; process tests cover hostile worker messages and real file boundaries; native/backend trials verify effective tools rather than just generated configuration.

P6-01 additionally covers the source-intake portions of AUTH-02/AUTH-03: partial/oversized/wrong-scope observations, ambiguous mappings and inert hostile prose. Their broader planning/broker authority requirements remain unchecked until those increments exist. These are local and normalized-host fixtures, not actual remote-service or worker-containment certification.

P6-02 covers planning portions of AUTH-01–AUTH-04 and INT-02 with actual disposable repositories, dense generated DAGs, base/remote changes, immutable revisions, simultaneous compiled preparation and unchanged legacy events. A plan records machine/human acceptance intent without forging an actual acceptance receipt. Actual effect dispatch, delegated acceptance, committed-candidate assembly and native containment cases remain later increments.

P6-03 adds local operator/grant/revocation and hostile broker protocol/process fixtures for AUTH-03–AUTH-08. Unknown operator methods, role/budget/human-test claims, stale contexts, unsupported runtime observations and unauthorized reads/effects are refused. Synthetic runtime observations stay fixture; an actual child environment probe does not establish filesystem denial. Actual native/backend containment, delegated acceptance, execution counters and full-flow case closure remain P6-07/P6-12/P6-20/P6-27/P6-34 work.

[◀ Specification index](./README.md) · [Runner ▶](./02-durable-runner.md)
