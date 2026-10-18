# 0026 — Destination host contract and document updates

- **Status:** Accepted
- **Date:** 2026-10-18

## Context

Destination tools have different authentication, content formats and response
shapes. A manifest alone cannot prove publication, and a document update must not
destroy content that the author never read. The bundled CLI must retain guidance
when installed without the repository's source tree.

## Decision

1. Bundle the canonical provider manifests and bounded guidance into a generated
   catalog, checked for drift. Preserve repository/user overrides and inherited
   guidance. Expose both resource paths and embedded text where available.
2. Use an injected host interface for external tool invocation and tool-specific
   argument/response normalization. The deterministic core binds typed manifest
   defaults, checks the operation taxonomy and validates normalized status/ref.
   Authentication stays in the tool/client credential store; no new dependency
   or automatic integration installation is required.
3. Generic invocation rejects docs.update. The dedicated update helper fetches
   the same document inside its invocation, requires complete body and revision,
   then passes that snapshot to the transform. Only its result can be written,
   with source digest and revision. Incomplete/mismatched/pending reads and
   transformation errors block writes; unchanged content skips them.
4. Hosts preserve native document formats and enforce supported revision
   preconditions. Pending async writes remain pending. Local repository docs
   publication confines Markdown output to docs/, creates exclusively and checks
   digest conflicts before atomic replacement under the external writer lock.
5. Keep fixture transcripts explicitly synthetic. They verify the core/host
   contract, not live authentication, native schemas or remote publication.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Accept an earlier caller-supplied read receipt | It could refer to a different document or stale session |
| Give the core every vendor's credential and transport stack | It would duplicate clients and expand the secret-handling surface |
| Store only guidance paths in the bundle | Installed CLI users do not have the source checkout |
| Treat queued async results as published | An operation may still fail after acceptance |
| Use the Docs MCP endpoint for document creation | Its current official tools expose read/update, so optional gws supplies creation |

## Consequences

Host adapters still need live validation and vendor-specific normalization.
Repository writers are serialized with wholeloop writers; unrelated editors do
not share that lock, so digest checks detect observed conflicts but cannot provide
a filesystem-wide compare-and-swap guarantee. No commit or push follows a docs
publication automatically. Runtime coordination stays outside the repository.

## Links

- [Provider catalog](../configuration/providers.md)
- [External state](./0004-state-outside-the-repo.md)
- [Declarative providers](./0008-extensibility-through-manifests.md)

[◀ Decisions index](./README.md)
