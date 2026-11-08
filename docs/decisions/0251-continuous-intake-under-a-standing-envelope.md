# 0251 — Continuous intake under a standing envelope

- **Status:** Proposed
- **Date:** 2026-11-08

## Context

Intake captures an immutable source snapshot from a document, a tracker item or a request, and planning and authorization follow explicitly. Recurring admission already turns maintenance proposals into delivery sources within an operator envelope ([0195](./0195-maintenance-proposals-and-recurring-admission.md), [0196](./0196-maintenance-commands-and-recurring-delivery-intake.md)). Work from the team, such as a labelled issue, still needs a person to start intake. wholeloop never talks to a service itself: it uses the client's MCP connection or command-line clients the operator installed ([0085](./0085-client-owned-mcp-first-provider-transport.md)).

## Decision (proposed)

- The supervisor (proposal 0249) polls the operator's code host through `gh` or `glab` for issues with a configured label in the repositories a standing envelope names, and captures each new one as a source snapshot.
- A snapshot is admitted only when an active standing envelope grant covers its repository and requested effects; otherwise it waits as a question in the overview. Admission never widens the envelope.
- Trackers reachable only through a client's MCP connection are not polled by the supervisor; they stay explicit intake, because no client conversation runs while the supervisor works.
- The issue text is untrusted data, bounded and quoted into the source, never instructions to the controller.

## Alternatives rejected

- **Webhooks.** They need a reachable endpoint and a hosted service.
- **Admitting every labelled issue.** It would let anyone who can label an issue spend the operator's authority.

## Consequences

Labelling an issue is enough to start work within limits the operator set in advance. Everything outside the envelope still waits for a person.

## Verification

Fixture tests with a synthetic `gh`, a rehearsal against the private trial repository, and a refusal test for an issue outside the envelope.

[◀ Decisions index](./README.md)
