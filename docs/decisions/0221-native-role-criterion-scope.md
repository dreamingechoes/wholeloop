# 0221 — Advertise only the assigned role's criterion results

- **Status:** Accepted
- **Date:** 2026-11-05

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
