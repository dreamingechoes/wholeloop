# 0095 — Separate operator grants from scoped worker claims

- **Status:** Accepted
- **Date:** 2026-10-24

## Context

An accepted plan describes work but grants no effect authority. Complete unattended operation needs one explicit plan or initial-envelope authorization while keeping workers unable to create permissions or impersonate human acceptance. Same-user native hooks and prompt instructions cannot establish a filesystem/credential boundary. The accepted scope explicitly requires honest unsupported-capability results until actual containment is available.

## Decision

1. Add closed operator request, grant, revocation and broker request/receipt contracts. Issue grants only through the local operator control plane, never a broker method. Operator labels describe that control action; they are not cryptographic identity verification or human testing. Retain exact basis/source, resolved policy/budgets, effects, named delegated decisions, repository/read scopes and provenance.
2. Use a stable operator action ID for idempotence. Reusing its exact request returns the original grant/deadline, including expired/revoked state. Changed input requires a new action. Default expiry is 24 hours; explicit finite expiry must follow issuance. Pre-issuance wall-clock rollback is ineligible. Global recovered clocks, capacity and effect counters remain P6-07 work.
3. Keep grant/revocation artifacts immutable and private in the external store using StoreFiles locking/atomic writes. Verify digests on reads and retain revocations. They are policy records, not bearer credentials; a public ID alone conveys no broker authority. Lifecycle journaling follows in P6-04. No credential value is resolved or copied by this increment.
4. Treat endpoint as a ceiling, not an implicit effect grant. Research permits source reads/report artifacts; local handoff excludes publication; to-pr excludes merge. Explicit effect lists remain necessary. Unknown production/deployment/message/flag-write effects are unsupported. Read scopes allow only named existing taxonomy reads, never a disguised provider write. Topic prefixes apply only to controller-owned branches, not existing unrelated work.
5. A controller opens a peer over an immutable assignment identity. Admission and every message recheck current fencing, active grant, exact plan/envelope, role/cell scope and a trusted runtime observation. Require isolated controller-store/credential views and restricted tools; none also requires disabled interactive tools. Unavailable admission returns available: false and starts no process. The current core does not provide the actual native/backend host yet.
6. Runtime observations come from controller/backend callbacks, not worker JSON or supplied planning capabilities. An initial-envelope grant can precede a detailed plan; code assignments require structural fit and separately observed independent plan acceptance. Dedicated planning/decision hosts remain P6-08/P6-34 work. A builder cannot start against unresolved definition or retained human-only none-policy acceptance.
7. Broker messages can propose artifacts, submit scoped claims/findings and request an explicitly owned local commit. Publication/merge are controller-only after later actual eligibility. Recording a request performs no read/test/commit/publication and satisfies no human gate. Claims always retain worker-claim origin; fixture runtime evidence remains fixture. Cached replies bind request and assignment and cannot be promoted by editing the cache.
8. Construct worker environments from explicit backend values; inherit no controller environment, personal home, credential variables or runtime options. Actual macOS process tests observe an additional locale bookkeeping name; allow only that named platform addition in the test helper, not arbitrary inherited fields. This environment test is not filesystem containment. P6-12/P6-27 must execute actual denial/capability tests before protected native operation is advertised.

## Consequences

The CLI can record, inspect and revoke an authorization without starting workers or contacting a service. Existing supervised workflows, human approvals and public declarations retain their meanings. Unsupported containment cannot be enabled by widening a grant. An unrestricted same-user native process remains outside the new protected broker path and may use only the existing explicitly supervised workflow.

The trusted runtime/controller remains part of the implementation trust boundary. A model-supplied boolean is insufficient evidence. A malicious in-process controller is not isolated by a TypeScript interface. Real backend provisioning, worker dispatch, delegated decisions, execution receipts, counters and publication/merge eligibility remain the separately planned increments; no fixture result waives them.

## Alternatives considered

| Option | Why rejected |
| --- | --- |
| Treat autopilot, source instructions or a worker role field as authorization | Allows untrusted work content to enlarge permissions |
| Reuse legacy human approval/test events for machine output | Conceals provenance and weakens existing supervised checks |
| Rely on hooks or the personal account's home as worker isolation | Does not prevent an unrestricted process from reading controller files/credentials |
| Pass broad controller environment or code-host tokens to workers | Makes effect authority available to untrusted build/test code |
| Renew expiry on repeat authorization | Converts a retry into a new grant without another explicit action |
| Execute a broker request immediately | Conflates an untrusted claim with actual tested/eligible controller effects |

## Links

- [Authorization guide](../tutorials/delivery-authorization.md).
- [Contract and authority](../../roadmap/specifications/autonomous-delivery/01-contract-and-authorization.md).
- [Execution environments](../../roadmap/specifications/autonomous-delivery/03-execution-environments.md).

[◀ Decisions index](./README.md)
