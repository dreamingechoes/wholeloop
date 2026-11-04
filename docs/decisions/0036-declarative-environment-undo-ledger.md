# 0036 — Declarative environment undo ledger

- **Status:** Accepted
- **Date:** 2026-10-19

## Context

Worktrees isolate code, not seeded databases, containers, dev servers or remote services. A final "clean up later" note cannot identify those effects or explain how to reverse them. Automatically executing an unverified undo could destroy data.

## Decision

- Add env declare/report. Store one immutable declaration per item/key with its resource, effect, person and explicit undo argv/working directory. Identical declarations are idempotent; changed definitions need a new key. Retain event identity/time and rebuild JSON/Markdown projections from the journal.
- Treat recipes as declarations, not execution receipts. The ledger imports no executor and neither performs the write nor runs undo. Empty reports say that nothing was declared, not that nothing happened. A person/host must inspect and authorize actual cleanup, including whether an undo is still appropriate.
- Resolve cwd at runtime, preserve literal argv (including empty arguments and spaces) and keep commands as JSON in receipts. Do not interpolate a shell string. Reject bounded invalid inputs and common credential-bearing URLs/flags/shapes; credentials belong in encrypted, OS or tool stores. These exclusions do not establish that arbitrary source text contains no secrets.
- Report an item's descendants and shared ancestors, without unrelated sibling effects. Show recipes in reverse declaration order as a starting point for human inspection; this does not prove their dependency order. Build and draft-PR receipts include every then-current declaration with its undo. Resume packs carry a bounded reference. Current reports include later declarations; historical step artifacts remain immutable.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Run undo automatically on stop/prune | Effects may still be needed and recipes have not been verified |
| Store only opaque shell strings | Loses argument boundaries and encourages interpolation of credentials |
| Overwrite recipes in place | Destroys the record of what a prior receipt actually described |
| Mix all sibling effects into every part | Hands one repository unrelated cleanup obligations |
| Treat no declarations as a clean environment | Absence of records is not observed absence of effects |

## Consequences

The ledger makes cleanup reviewable without pretending to control every external system. It cannot discover undeclared effects or prove an undo works. Users must exercise recipes on disposable resources and repeat supported-platform checks. No external service or undo command was run by the local ledger tests.

[◀ Decisions index](./README.md)
