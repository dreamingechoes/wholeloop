# 0210 — Operator overview and change feed

- **Status:** Accepted
- **Date:** 2026-11-04

## Context

The owner plans a separate, optional interface (working name: the Deck) that shows live what the harness is doing: work items and where each sits in the flow, which decision waits for a person, gates, delivery runs, agents, worktrees and recent activity. It lives in its own repository. Its first version should be buildable on top of 1.0 alone.

Today that information exists but is spread over several reads: `wl status`, `wl delivery report`, `wl delivery runner-status`, `wl delivery events`, `wl worktree list` and the mailbox. Nothing orders it by what needs a person first. Nothing follows it live: [ADR-0190](./0190-operator-report-diagnostics-and-recovery-bundles.md) and P6-25 left the optional live watch out. An interface that read the journals itself would have to re-derive decision logic (what is blocked, what waits for whom, which status wins). That logic has one right answer, so it belongs in the core with tests.

Three facts the interface needs are not recorded at all:

- which client and model acted, when an agent acts inside a person's own session;
- through which channel a person decided;
- why a decision was taken.

[ADR-0066](./0066-v1-compatibility-baseline-and-deprecation.md) lets 1.x add commands, flags and output identities. Once v1 is frozen, though, adding fields to existing journal events means a new event identity. Those three fields are cheap only before the freeze.

## Decision

- **The core owns every meaning; an interface only renders.**
  - `wl overview [--json]` emits `wholeloop/overview@1`, a pure read of the store. It contains:
    - store health;
    - a headline chosen by a fixed precedence;
    - the attention list, ordered by the core, where each entry has a reason category and the exact next permitted command;
    - the item tree with each item's flow position;
    - a summary of each delivery run (route counts, budgets, grant, last progress);
    - agents, worktrees and scheduled checkpoints;
    - a bounded list of recent outcomes;
    - the journal positions read (the cursor) and a digest.
  - It reuses the computations behind `wl status`, `wl delivery report` and `wl delivery runner-status`, never a second derivation.
- **A local change feed.** `wl watch` writes newline-delimited `wholeloop/watch-frame@1` documents to stdout. There are four kinds of frame:
  - a full overview with its cursor and digest, at start and after every committed change;
  - redacted, bounded events for activity views;
  - liveness, kept apart from progress so a heartbeat never looks like work;
  - problems, such as a sequence gap, a digest mismatch or an unreadable store. After a problem frame the feed stops advancing.

  File-system events are only hints. A poll is the fallback, the feed reads journals only after a commit, and `--since <cursor>` resumes. The feed never writes the store and never opens a port, which keeps the promise of the controls specification. This is the watch P6-25 left out.
- **Attribution before the v1 freeze.** Three optional fields are added to journal events:
  - the client identity (client, version, model) of an agent actor, with its source;
  - the channel of a person actor;
  - a bounded rationale on decision events.

  Rules for these fields:
  - Older events stay valid.
  - An absent field means unknown; it is never inferred from client text, worker output or messages.
  - A value declared by a generated adapter is labelled declared.
  - Delivery workers keep the observed identity their bindings and receipts already record.
  - A rationale comes from stdin or a file, never from argv.
- **A contract kit for consumers.**
  - `wl overview schema` prints the JSON Schemas of both identities.
  - Fixture stores for every headline state and attention kind, with their expected overview and a recorded feed, live in this repository. The real core generates them and tests check them. A consumer pins a wholeloop version and copies them.
- **Neutral names.** The core contract serves the terminal and the skills as much as any interface, so it is `overview` and `watch`, not `deck`. An interface ships its own executable and never adds `wl` subcommands.
- **Growth in 1.x is additive only.**
  - `overview@1` and `watch-frame@1` keep their meaning through 1.x.
  - New information arrives as new commands and identities. Presence and narration are examples.
  - New frame kinds, including incremental patches, are emitted only behind an opt-in `wl watch` flag.
  - A changed meaning is a new identity, and the old one stays available on request.
  - An interface refuses identities it does not know rather than guessing.
- **Out of scope for the core.**
  - Any network listener: an interface's own server needs its own decision record.
  - Presence and narration: 1.x, with their own record, and never evidence.
  - Actions: an interface runs only existing `wl` commands, each confirmed separately.

## Alternatives rejected

- **The interface reads journal files itself.** It would copy decision logic outside the tested core and break on internal changes that keep public contracts intact.
- **`wl deck snapshot` as the core command.** It ties a core contract to one consumer. It also collides with the interface's own launcher.
- **Incremental patches in 1.0.** Recomputing the full overview is affordable at expected store sizes. Patches stay possible later behind a flag.
- **Attribution fields in 1.x.** Each would then need a new event identity.
- **Presence in 1.0.** Liveness that seven different clients report about themselves needs its own design, and it risks being read as evidence.

## Consequences

P6-36 (attribution), P6-37 (overview) and P6-38 (change feed) are added to Phase 6 for 1.0, and P6-32 depends on them. The v1 compatibility fixture for journal events changes once, with this record as its reason.

[◀ Decisions index](./README.md)
