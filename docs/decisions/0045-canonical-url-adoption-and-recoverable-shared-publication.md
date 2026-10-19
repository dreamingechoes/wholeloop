# 0045 — Canonical URL adoption and recoverable shared publication

- **Status:** Accepted
- **Date:** 2026-10-19

## Context

Shared work can enter the harness through a document or issue rather than a new
idea. Reimporting that URL must not create another initiative or pretend that
existing prose passed Define gates. Publication also crosses a failure boundary:
a lost response cannot establish that the remote write did not happen.

## Decision

- Canonicalize credential-free HTTPS identities, remove fragments and known
  tracking parameters, retain semantic queries, and match stored links first.
  Ambiguous cross-initiative matches require an explicit ID. Import only complete
  matching revision-bound reads, with a named owner and title; batch missing facts
  before creating history. Label imported observations separately from host reads.
- Retain imported context, revision and digest without fabricating approvals or
  completed steps. Standalone research stays local until adopted into an initiative;
  an unambiguously adopted brief inherits that initiative's publication destinations.
- Default each initiative to local. Explicit shared mode pins destinations and
  queues existing and future completed Define artifacts atomically. Keep synchronous
  completion free of remote I/O; a conductor flushes the durable outbox afterward.
  The SDK mode/complete wrappers perform that flush through an explicit ProviderHost.
- Bind each outbox key to the immutable completion event and destination. Journal
  intent before calling a writer; existing docs/items require a complete fresh read
  and conditional revision update that preserves unrelated content. Append an exact
  marker-bound chunk rather than replacing the shared document.
- Record a publication/link only after a complete fresh read contains that exact
  chunk. Cache success, retain uncertainty and reconcile ambiguous writes through
  reads. A repeat request provides no write authorization. Local mode pauses queued
  writes; it cannot recall a request already handed to an external client.
- Keep destinations pinned when changing modes: redirecting an ambiguous intent to
  another resource could duplicate work. Destination migration needs an explicit
  future protocol; the current workflow requires the same targets on resumption.
- Expose CLI requests/intents and labelled read imports without claiming that the
  bundled CLI authenticates opaque MCP tools. Real clients own invocation and raw
  response normalization. All coordination state and artifacts stay in the store.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Match only the literal input URL | Fragments and tracking parameters duplicate shared work |
| Mark imported prose approved | A source read is not a human decision or completed contract |
| Write remotely inside completion's journal lock | Network uncertainty holds the core lock and breaks recovery |
| Automatically retry missing receipts | A lost response can follow a successful remote create |
| Accept a marker or write response as proof | Neither establishes the exact completed artifact is present |
| Replace a whole target from an old read | Overwrites unrelated edits or concurrent changes |

## Verification

Temporary stores and data-only hosts exercise adoption, missing facts, URL identity,
publication, revision-preserving updates, ambiguity, reconciliation, projection
rebuild and compiled CLI handoffs. These are synthetic boundary tests; authenticated
provider semantics, physical interruptions, client enforcement and Linux remain
owner verification in the manual checklist.

[◀ Decisions index](./README.md)
