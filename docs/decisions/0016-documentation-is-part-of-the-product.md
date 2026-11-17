# 0016 — Documentation is part of the product

- **Status:** Accepted
- **Date:** 2026-10-14

## Context

**Amended 2026-11-17 (1.1.0, readability).** The style guide asked for pages that were "concise and dense" and for reasons "linked to ADRs", and the pages followed it: 138 paragraphs over 80 words, 552 ADR references outside the decision records, and 3 of 106 terminal examples showing their output. Precise text that a newcomer cannot read does not teach the way of working. The guide now asks for short paragraphs with the key term in bold, every wholeloop term defined on first use, real output after every command, a diagram when an idea has more than three moving parts and short terminal recordings rendered with VHS. Pages read to use wholeloop no longer link ADRs: they give the reason in a sentence, and the records stay for architecture, contributing and reference pages, whose readers change the design. Each step page also animates its example session in the client: those recordings replay the transcript printed on the page and say *Illustrative* both inside the recording and under it, so they are never read as observed output. Rejected: a link list per page, which keeps the churn of updating pages each time a decision is amended; and recording real client sessions for the pages, which take minutes, differ on every run and spend an account's quota. The paragraph length and the absence of ADR links in user pages are guidance for now; an enforcer in `wl docs check` is a separate change.

**Amended 2026-11-16 (1.0.1, README diagrams).** npm shows a package README without running Mermaid, so the README's loop diagram appeared there as code. The README's diagrams are now SVG files rendered from Mermaid sources under `docs/assets/diagrams/`, with plain text labels and a white background so one image reads on GitHub's themes and on npm. Each SVG carries its source's digest, and the Mermaid check fails on a stale or missing render, so the gate needs no browser. Pages under `docs/` keep Mermaid code blocks. Rejected: a separate README for the package rewritten at release time, which would publish bytes that differ from the reviewed source; and a third-party rendering service, which the README would then depend on.

**Amended 2026-11-16 (1.0.1, status notes).** Status banners only where the status matters. After 1.0.0, 42 of the 73 banners said that a page's behaviour was implemented, which every reader already assumes of released documentation; they pushed the few notes that matter below a line of noise. A page now describes released behaviour unless a note right after its TL;DR says otherwise: **Experimental** for an experimental surface, **Partial** with what is missing, or **Design** for target behaviour. Limits that do not change a page's status, such as remote publication on a step page, are ordinary sentences. `wl docs check` no longer requires a banner and refuses the retired `**Status:**` form, so it cannot return. Rejected: keeping the banners as they were, and dropping every note, which would hide that autonomous delivery may still change in a minor release.

A harness is a way of working, written down. If the documentation is thin, stale or hard to navigate, nobody can learn the way of working, evaluate it or change it — and the harness becomes an opaque tool people either trust blindly or avoid. Documentation that describes planned behaviour as if it existed is worse than none.

## Decision

1. **Docs ship with the change.** A pull request that changes behaviour updates the affected pages, status notes and generated references in the same change. A behaviour change without docs is not done.
2. **Honest status.** A page describes released behaviour; a page whose behaviour is experimental, partial or only designed says so in a note after its TL;DR, updated with the behaviour (amended 2026-11-16).
3. **Fixed templates** for step pages, concept pages and ADRs ([docs style](../contributing/docs-style.md)).
4. **Generated navigation.** Page order lives in `docs/nav.yml`; `wl docs nav` writes every footer; `wl docs check` fails CI on drift.
5. **Diagrams are first-class.** Mermaid with a shared palette that reads in light and dark themes; every diagram is parse-checked in CI. The README's diagrams are rendered to SVG for npm and checked against their sources (amended 2026-11-16).
6. **Links are checked** in CI; relative only; no absolute local paths.
7. **Generated references** for anything that mirrors code: configuration keys (from the JSON Schema), `wl` commands (from the CLI definitions), the compatibility matrix (from conformance results), the provider catalogue (from manifests).
8. **English, readable, warm.** TL;DR on every long page; short paragraphs, real examples with their output; reasons stated in the page, ADR links only on architecture, contributing and reference pages (amended 2026-11-17).

## Consequences

### Positive

- A newcomer can learn and run any step from the docs alone.
- References cannot drift from the code they describe.
- Broken links and diagrams never reach `main`.

### Negative

- Every change carries a documentation cost — accepted on purpose.
- Docs tooling is real code to maintain ([P0-04](../../roadmap/phase-0-foundations.md#p0-04--documentation-tooling)).

## Alternatives considered

| Option | Why not |
| --- | --- |
| Docs written after the code stabilises | They never catch up |
| A hosted docs site as the primary surface | Extra infrastructure; GitHub already renders everything we need |
| Hand-maintained navigation | Drifts with every new page |

## Links

- [Documentation style](../contributing/docs-style.md)
- [ADR-0001 — Record architecture decisions](./0001-record-architecture-decisions.md)

[◀ Decisions index](./README.md)
