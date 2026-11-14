# 0221 — Advertise only the assigned role's criterion results

- **Status:** Accepted
- **Date:** 2026-11-05

**Amended 2026-11-14.** A verify gate's read-only worker received the round plan and its assignment, but neither the candidate's bytes nor the suite result. A live Codex 0.166.0 verifier on `gpt-6.1-sol`, with no read tool, reported that nothing was observable, and verification blocked after the suite had passed. The verify-gate input now carries two items:

- the controller's own suite result for the round, which must pass before any verifier launches;
- the changed paths' bytes at the gate snapshot, at most 64 KiB each and 256 KiB in total.

No worker claim is presented as the suite, and no worker gains a tool. Review gates are unchanged, since they already carry the diff.

The next live attempt showed the evidence was used. Its verifier confirmed the status bytes and the suite, but it still reported `unavailable` for two reasons. Nothing said the changed paths were complete, and the exact `GET /` response is observed only at the later acceptance stage. By the maintainer's decision, the evidence now also carries:

- the changed paths marked complete against the gate's base, as the gate derives them;
- the pinned acceptance cases with the criteria and capability each covers, and a rule that runtime behavior covered by a listed case is observed by the controller before any publication, so its absence from this gate is no reason to report `unavailable`.

The acceptance stage still observes that behavior before a pull request is opened. Rejected: running the pinned HTTP cases inside the verify round, which would duplicate the acceptance stage and reorder the route.

A later attempt passed verification, and its Codex reviewer then reported `unavailable`: it confirmed the diff but could not read the candidate files for a full inspection. Review-gate workers now receive the same complete change set and changed file bytes, without the suite result or acceptance coverage, which belong to verification. This replaces the earlier statement that review gates were unchanged.

## Context

The result decoder already rejects criterion results from every role except verifier and rejects unassigned verifier criterion IDs. Native response schemas nevertheless advertise unrestricted criterion arrays to all roles. This is an independently reproduced generation-contract inconsistency. The preceding actual builder's rejected response was not retained, so this finding does not establish that historical failure's cause.

## Decision

Derive criterion generation rules from the original validated assignment in both file-result and inline-proposal schemas. Non-verifiers and verifiers with no assigned criteria advertise an explicitly empty array through maxItems zero. Other verifiers advertise only their assigned criterion IDs. Preserve that explicit zero bound in the native generation subset; do not import every public array bound or change the shared configuration validator.

Keep generic public schemas and strict output decoding unchanged. Empty criteria, blocked statuses and unknowns remain possible. The model's scoped criterion results remain worker claims, never independent acceptance or authority. Both native client recipes receive the same role restriction without changing their tool, workspace, credential, deadline or budget policies.

## Alternatives rejected

- Accepting builder criterion results would widen an existing role boundary.
- Editing only the prompt would leave the structured generation contract inviting invalid output.
- Expanding the general schema validator for a native generation constraint adds unrelated configuration behavior and compatibility risk.
- Inferring the historical builder's category would invent evidence absent from its retained receipt.

## Verification

Thirty differential recipe controls fail before the correction. They cover seven roles, both reference-client schemas, both output transports and an empty verifier assignment. Existing protocol and actual synthetic native-process controls retain their independent strict refusal and execution boundaries. Fresh native campaign evidence remains required.

[◀ Decisions index](./README.md)
