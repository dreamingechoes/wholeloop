# 0038 — Pinned launch kits and separate publication capabilities

- **Status:** Accepted
- **Date:** 2026-10-19

## Context

A launch can quietly drift away from its spec when dashboards recreate queries or use the newest spec instead of the scope's approved revision. Message drafts also need repository voice without inheriting the ability to send. Missing providers must leave usable material, and interrupted creation must not duplicate writes.

## Decision

- Resolve measurements through the scope's exact cut-scopes artifact and its sourceSpec, selecting only owned metrics. Pin source revision/digest. Standalone entry asks for an explicit measurement plan using the same metric vocabulary and rollout contract, or a justified exception; create no fake Define history.
- Load actual comms.voice and launch.templates, pin their bindings/digests and supply effective profile instructions. The launcher receives a read-only draft interface. It returns stage/audience comms drafts, dashboard descriptors, rollout narrative and enablement, never queries or provider execution requests.
- Core validation covers every stage/metric and rejects invented metric/query fields. Construct dashboard specs from exact pinned metric objects. Their metricRef is a JSON pointer into a real external measurement projection; retain original spec/scope revision provenance too. Store the complete kit and canonical receipt outside every repository and rebuild it from the journal.
- Separate conductor publication from drafting. Allow only comms.draft, dashboards.create and docs.create. Reject recognized sending tool/action routes and static send=true/draft=false mappings before invocation. Missing providers retain manual-ready artifacts; local docs already are the stored artifacts.
- Persist one intent per run/artifact before a typed host call. Completed results are cached; ambiguous or pending outcomes require inspection rather than a retry. Successful comms results require explicit draft=true/sent=false evidence. Do not persist raw provider errors. Keep ambiguous send state unknown.
- Preparing a kit does not observe merge readiness or current flag state. Retain those unknowns; exposure decisions and actual flag changes remain separate. No model, live provider, message or flag operation ran in local implementation.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Reconstruct dashboard queries from prose | Breaks the link to the metric contract measured later |
| Use the latest spec by default | Changes approved scope semantics without an explicit revision |
| Give the launcher generic provider/shell tools | Exposes sending capabilities during a drafting-only step |
| Treat provider declaration or a success URL as an unsent draft | Cannot establish actual remote state |
| Retry a lost creation response | Can duplicate remote documents, charts or drafts |
| Treat a missing provider as a failed launch kit | Ready-to-use local output remains useful and reviewable |

## Consequences

Typed interfaces, canonical metadata and known-route checks are enforceable local boundaries, not proof of opaque server semantics or live client permissions. The per-CLI adapter no-send criterion remains pending until P1 adapters/conformance can run; it must not be checked based on synthetic hosts. Source/label semantics, real authentication, publication interruption and merge/flag readiness also need manual verification. Those checks do not block dependent local rollout workflows.

[◀ Decisions index](./README.md)
