# Documentation style — how every page is written

> **TL;DR** — Documentation is part of the product, not a by-product. Every page has a TL;DR, a predictable structure, a status note only when its behaviour is not settled, Mermaid diagrams in the shared palette, and a generated navigation footer. CI checks all of it.

Enforced on every change by `npm run check`: `wl docs check` (docnav, nav listing, status notes, links, anchors, referenced ADR status/supersession), markdownlint and the Mermaid parse check.

---

## Voice

- **English**, always — code, docs, messages.
- **Concise and dense, never a wall.** Short paragraphs, bullets, tables. A long page opens with a TL;DR.
- **Warm and direct.** Write for a newcomer who is smart and short on time. Prefer "you" over "the user".
- **Say why.** A rule without its reason invites someone to delete it. Long reasons go to an [ADR](../decisions/README.md); the page links it.
- **Honest status.** Never describe planned behaviour as if it existed. A page describes released behaviour unless its status note says otherwise.

## Markdown source layout

Keep each prose paragraph on one source line, without a fixed column limit. Use the same layout for prose in list items and blockquotes. Separate paragraphs with a blank line. Let the editor or renderer wrap visually; hard wrapping at 80 columns causes unrelated text to move when a sentence changes and conflicts with the existing EditorConfig and markdownlint settings.

Preserve literal and structural line breaks: fenced/indented code, inline code, HTML, tables, link destinations/titles, explicit Markdown hard breaks and GitHub alert headers. These are syntax, not prose wrapping. Generated sections retain their generator's exact format. Byte-bound Markdown inputs under test/fixtures and test/evals/definition/artifacts are literal test data: WL001 leaves them unchanged while all other Markdown rules remain active.

Run `npm run lint:md` to check the convention through the parser-aware WL001 rule. Run `npm run lint:md:fix` to join soft-wrapped prose and apply the existing Markdown fixes. Both use the project's existing markdownlint toolchain; no additional formatter or dependency is needed. Review the diff before committing, especially literal examples and generated content.

## Status notes

A page describes the released behaviour, so it needs no status line to say that it exists. Add a note right after the TL;DR only when a reader must know that the page's behaviour is not settled:

| Note | Use it when |
| --- | --- |
| `> [!IMPORTANT]` then `> **Experimental.** …` | The page covers an [experimental surface](../extending/compatibility.md#experimental-surfaces), such as autonomous delivery: released and tested, but it may change in a minor release |
| `> [!NOTE]` then `> **Partial.** …` | Part of the behaviour is missing; say which part |
| `> [!NOTE]` then `> **Design.** …` | The page describes target behaviour that is not implemented yet |

Keep a note to one or two sentences: what is not settled and, when it helps, the decision behind it. A limit that applies to a page without changing its status, such as remote publication being experimental on a step page, is an ordinary sentence under the TL;DR. Dates, task history and work in progress belong in the [journal](../../roadmap/journal.md).

Notes change **in the same change** that moves the behaviour, and a note is removed when the behaviour settles. `wl docs check` refuses the `> **Status: …**` banner every page carried before 1.0.1, so they cannot return ([ADR-0016](../decisions/0016-documentation-is-part-of-the-product.md)).

## Referenced decisions

Every linked numbered ADR and plain ADR-NNNN mention needs exactly one metadata status in the first fifteen lines: Accepted, Superseded, Superseded by NNNN, or Superseded by a relative Markdown ADR link whose label matches the filename's number. Plain successors must resolve uniquely. Successor declarations are checked too; cycles are rejected. Missing/proposed/rejected/deprecated, duplicate, late or fenced-example statuses fail docs check. Unreferenced draft records may remain Proposed until accepted; add the published index/reference when the decision is settled. This enforces [P0-07](../../roadmap/phase-0-foundations.md#p0-07--review-and-accept-the-foundational-adrs) without claiming that metadata proves agreement with actual native conformance.

## Generated references

Build first, then run `wl docs check` to check navigation, status notes, links, anchors and the current command/config/provider tables. Reference comparison uses the built core's contracts, not a person's resolved configuration or authenticated services. Rebuild after changing source definitions. Missing pages or missing, reversed or duplicate marker pairs fail; an absent marker must never turn a check into an empty successful comparison.

`wl docs reference` checks tables without changing files and exits 4 on drift. `wl docs reference --write` explicitly regenerates all four sections; --kind commands/config/providers/platforms selects one. It preflights every selected page/marker before writing, preserves surrounding prose and skips unchanged pages. The write batch is not a crash-atomic multi-file transaction; inspect an interrupted write and regenerate after restoring any incomplete markers. Valid semantic stale tables are replaced from source, while malformed ownership markers require inspection.

Use `npm run docs:references` to build and regenerate together. Existing docs:commands and docs:config scripts delegate to the same renderer; docs:providers updates the manifest-derived mapping table; docs:platforms updates adapter declarations. The provider source JSON catalog has its separate providers:catalog check. Generated mapping rows describe declared operations/access, not authenticated availability or actual server behavior. Local adapter declarations are generated from the build/install registry and remain separate from native conformance. Supplied observation snapshots have their own explicit conformance matrix --docs destination/time comparison and optional write; ordinary docs check cannot reconstruct external evidence. Disabled nightly collection/issue automation has its own explicit maintainer activation and external artifacts; simulation passes cannot establish native support.

## Expanded delivery acceptance map

When changing an autonomous-delivery specification case, update [the acceptance map](../reference/delivery-acceptance.md) in the same change. The docs gate requires every accepted case definition and one row per declared case, its exact definition file, existing test/evaluation links and executable hard-rule enforcers from enforcement.yml. Required native, hosted, backend and host-platform labels cannot be downgraded. A local gate result does not close external acceptance; retain its observed records and failures in the manual matrix. The existing docs-check JSON identity remains unchanged.

## README diagrams

The root README is also the package page on npm, which shows Mermaid as code. Its diagrams are therefore images: each one has a `.mmd` source in `docs/assets/diagrams/` and an SVG rendered from it with `npm run docs:diagrams`, linked from the README by its absolute `raw.githubusercontent.com` URL so npm can load it. The SVGs use plain text labels, a common font and a white background, so they read the same on GitHub's light and dark themes and on npm. Each SVG starts with its source's SHA-256; the Mermaid check parses the sources and fails when an SVG is missing or older than its source. Biome skips the rendered SVGs, which are generated output. Diagrams inside `docs/` stay Mermaid code blocks, which GitHub renders.

## Page templates

### Step page (`docs/flow/<block>/<step>.md`)

```markdown
# <step> — <one line: what you get>

> **TL;DR** — 2–3 sentences.

(A status note only if the step is experimental, partial or a design.)

## At a glance
| | |
|---|---|
| **Block** | Define / Build / Rollout / Learn |
| **Invoke** | `/wholeloop:<step>` · `$wl-<step>` · `/wl-<step>` |
| **Decision point** | none / name |
| **Reads** | … |
| **Writes** | … |
| **Slots** | … |
| **Capabilities** | … |
| **Agents** | … |

## When to use it — and when not
## How it works          (one Mermaid diagram)
## Standalone use        (inputs it accepts, what it asks when alone)
## Run it                (one example session, then a per-CLI invocation table)
## Before & after        (hand-offs: what feeds it, what it feeds)
## Gotchas & FAQ
```

## Tutorials and how-to guides

A tutorial should give the reader a complete route to an observable result: prerequisites, initial working directory, commands or client prompts, expected outputs, a stopping point and the next useful page. Use the [local core tour](../tutorials/local-core.md) for a terminal-only example and [first framing](../tutorials/first-framing.md) for a model-backed procedure.

Label terminal core calls and native skill requests separately. Explain whether a transcript is illustrative or actually observed, and keep native/service acceptance distinct from simulations. Show how to retain IDs, recover in a fresh process/session and interpret expected nonzero exits. Use local, disposable stores for scripted exercises rather than polluting a reader's project or personal work history.

Run copied commands as written and record the environment and limits in the journal. When an instruction needs real accounts, permission choices or a human judgment, describe that boundary and its expected evidence instead of manufacturing a successful transcript. Keep reference/schema detail in the relevant reference page so the first-use route stays readable.

<!-- docnav -->
[◀ Nightly conformance](conformance.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Glossary ▶](../glossary.md)
