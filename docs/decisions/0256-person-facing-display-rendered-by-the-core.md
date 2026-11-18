# 0256 — Person-facing display rendered by the core

- **Status:** Proposed
- **Date:** 2026-11-18

## Context

Every documented step session shows one compact layout: a header naming the step and its subject, aligned key and value lines, short progress lines, results marked passed, failed or unknown, then what was produced, the open questions and the next command. No skill, protocol or command defines that layout. The output contract asks skills to "show the returned preflight" and "show its receipt" in prose, and the step payloads carry internal fields (run IDs, bindings, digests, the profile's style block), so each model improvises a presentation and repeats the core's vocabulary to the person.

A trial of `wl-research` in Codex on 2026-11-17 showed the result: the person read about preflights, slots and refutation quorums instead of the answer. Most `wl` commands also print their JSON payload when `--json` is absent, so the terminal shows the same internals.

Presentation has one right answer for a given payload, which by [ADR-0003](./0003-deterministic-core-cli.md) belongs in the core with a test, not in a prompt.

## Decision (proposed)

- Every step command's payload gains a versioned `display` block: `header`, `rows`, optional `progress`, `produced`, `open` and `next`, plus `text`, the block rendered as plain text at 80 columns. The block is additive to the existing schemas.
- The same renderer produces the human output of the CLI without `--json`, so the terminal and every client show identical text.
- The output contract changes: a skill shows `display.text` verbatim for each command it runs, adds only what the person needs to decide, and never narrates internal fields or shows raw JSON. The preflight becomes the header line; the profile style block is for the agent only.
- A banned-terms list for person-facing text is kept beside the renderer; the experience check (P9-20) lints transcripts against it.

## Alternatives rejected

- **A layout described in the protocol for models to follow.** Each client and model would still render it differently, and nothing could test it.
- **Human output only in the CLI.** Clients would keep improvising from the JSON, which is where most of the noise came from.

## Consequences

Skills get shorter and the experience is the same on every client. Every step command needs a renderer and snapshot tests; documented sessions can be generated from real `display` output instead of written by hand.

## Verification

Snapshot tests of `display` for every step command, schema registration for the new block, and the transcript lint in the experience check.

[◀ Decisions index](./README.md)
