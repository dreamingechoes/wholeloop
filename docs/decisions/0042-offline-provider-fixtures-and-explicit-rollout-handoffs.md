# 0042 — Offline provider fixtures and explicit rollout handoffs

- **Status:** Accepted
- **Date:** 2026-10-19

## Context

A valid manifest does not establish authentication, an installed tool or a safe remote effect. Sending and flag mutation cannot be inferred safe from friendly operation names. Rollout needs usable outputs while client/service bridges remain unverified, and tests must distinguish those outputs from remote artifacts.

## Decision

- Add explicit offline provider fixtures covering every declared operation. Execute real argument binding and normalized-result validation, with exact expected calls/results. Fixture hosts perform no remote operation. Metadata-only provider test keeps its explicit unprobed status; it never becomes a health check.
- Add rollout manifests for destination-labelled Slack/Teams/email drafts, LaunchDarkly/Unleash/GrowthBook/PostHog/config-file flags, five dashboard targets, Grafana/Datadog observability and Figma context. Retain existing source mappings. Validate recognized toggle/apply routes on flag reads as well as proposals.
- Store native comms drafts, unapplied flag proposals and metric-linked dashboard handoffs in the external store, deterministically and without overwriting a conflicting artifact. Comms report draft=true/sent=false; proposals report applied=false. Dashboard handoffs remain pending with createdRemotely=false.
- Config-file flags read explicit named environment records with enabled, percentage and audience from a contained local JSON file. Do not guess those semantics from arbitrary booleans or rewrite configuration. Return only control fields and a content-derived revision.
- Virtual remote flag reads require an explicit authenticated host bridge. Missing bridges fail, preserving unknown in the ramp workflow. Complex targeting must not be flattened into an invented global percentage. Actual server roster, arguments, project/site/datasource and complete observations belong to the host.
- Do not fabricate dashboard-write tool names or claim native threaded/service creation from a local spec. P4-05 remains partial until authenticated service readers and actual remote dashboard creation/normalization are implemented and exercised in client bridges. Existing local handoffs remain useful meanwhile.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Call fixture success a connected-provider health check | No authentication or actual server tool ran |
| Map comms drafts onto sending APIs | Introduces an external effect excluded by the capability |
| Implement proposal by toggling then reverting | Changes exposure even if the final state looks unchanged |
| Guess dashboard tool names or percentage semantics | Can silently create wrong charts or authorize a false ramp |
| Report local dashboard files as remote creation | Misrepresents what the owner still needs to do |

## Consequences

Offline binding contracts, native drafts/proposals/config reads and known-route rejections are locally implemented. Remote service bridges, dashboard execution, actual permissions and normalized cohort/query semantics remain open P4-05 work. No Docker image, MCP server, credential, real source or remote destination was executed during implementation. This partial provider task does not block sync or grounding work that can use explicit typed hosts and local fixtures.

## Current acceptance and transport scope

[ADR-0084](./0084-experimental-integrations-and-scoped-live-verification.md) defers actual service certification and keeps integrations experimental, fixture-tested and service-unverified. [ADR-0085](./0085-client-owned-mcp-first-provider-transport.md) closes P4-05 through tested MCP priority, explicit HTTP selection and honest degradation; it does not require a direct HTTP host for every vendor. The earlier live-service closure requirement above is historical. Native handoffs and unknowns remain in force whenever the client lacks a reviewed actual tool contract.

[◀ Decisions index](./README.md)
