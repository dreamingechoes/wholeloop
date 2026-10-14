# 0012 — Steps are named verb + object

- **Status:** Accepted
- **Date:** 2026-10-14

## Context

Step names are the most-read part of the harness: they appear in slash commands, preflights, docs and status output. Names borrowed from a methodology (PRD, epic, frame, bet…) carry meaning only for people who share that methodology, and mean different things in different companies. A newcomer should know what a step gives them from the name alone.

The four blocks — Define, Build, Rollout, Learn — and the points where a person decides are the shape we keep; the vocabulary inside them is ours to choose.

## Decision

1. **Thirteen steps named verb + object**, grouped in four blocks:

   | Block | Steps |
   |---|---|
   | Define · shape the problem | `research` · `frame-problem` · `write-spec` · `cut-scopes` |
   | Build · ship it right | `slice-work` · `build-slice` · `verify-works` · `review-code` · `open-pr` |
   | Rollout · release with care | `prepare-launch` · `ramp-exposure` |
   | Learn · measure, then decide | `measure-impact` · `decide-next` |

   Plus four utilities: `next`, `status`, `setup`, `sync`.
2. **Namespacing where the CLI has none.** `throughline:<step>` in CLIs with plugin namespaces; `tl-<step>` elsewhere, so names never collide with a repo's own skills.
3. **A glossary maps common vocabulary** (PRD → spec, epic → scope, story/ticket → slice, QA → verify, …) so teams can keep talking their own language.
4. Item IDs follow the same idea: short, typed, speakable — `init-41c2`, `scope-a9e0`, `slice-0d4e`, `brief-7f3a`.

## Consequences

### Positive

- Self-explanatory commands; less to learn before the first run.
- Neutral across methodologies and companies.

### Negative

- People used to "PRD" or "epic" need the glossary at first.
- Renaming a step later is a breaking change for muscle memory and docs; names are treated as public API.

## Alternatives considered

| Option | Why not |
|---|---|
| Methodology names (PRD, epic, bet…) | Meaning varies between teams; opaque to newcomers |
| Single nouns (`spec`, `tasks`, `verify`) | Say what the step is about, not what you get |
| Numbered steps only | Easy to order, impossible to remember |

## Links

- [The flow](../flow/README.md) · [Glossary](../glossary.md)

[◀ Decisions index](./README.md)
