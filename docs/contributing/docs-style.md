# Documentation style — how every page is written

> **TL;DR** — Documentation is part of the product, not a by-product. Every page has a status banner, a TL;DR, a predictable structure, Mermaid diagrams in the shared palette, and a generated navigation footer. CI checks all of it.

> [!NOTE]
> **Status: ✅ implemented.** Enforced on every change by `npm run check`: `wl docs check` (docnav, nav listing, status banners, links, anchors), markdownlint and the Mermaid parse check.

---

## Voice

- **English**, always — code, docs, messages.
- **Concise and dense, never a wall.** Short paragraphs, bullets, tables. A long page opens with a TL;DR.
- **Warm and direct.** Write for a newcomer who is smart and short on time. Prefer "you" over "the user".
- **Say why.** A rule without its reason invites someone to delete it. Long reasons go to an [ADR](../decisions/README.md); the page links it.
- **Honest status.** Never describe planned behaviour as if it existed. The status banner says which is which.

## Status banner

Every page starts, after the title and TL;DR, with exactly one of:

| Banner | Meaning |
| --- | --- |
| `📐 design` | Target behaviour; nothing implemented yet |
| `🚧 partial` | Some of it works; the page says which parts |
| `✅ implemented` | Matches the released behaviour, verified by tests or conformance runs |

Banners are updated **in the same change** that moves the behaviour.

## Generated references

Build first, then run `wl docs check` to check navigation, status banners, links,
anchors and the current command/config/provider tables. Reference comparison uses
the built core's contracts, not a person's resolved configuration or authenticated
services. Rebuild after changing source definitions. Missing pages or missing,
reversed or duplicate marker pairs fail; an absent marker must never turn a check
into an empty successful comparison.

`wl docs reference` checks tables without changing files and exits 4 on drift.
`wl docs reference --write` explicitly regenerates all four sections; --kind
commands/config/providers/platforms selects one. It preflights every selected page/marker
before writing, preserves surrounding prose and skips unchanged pages. The write
batch is not a crash-atomic multi-file transaction; inspect an interrupted write
and regenerate after restoring any incomplete markers. Valid semantic stale tables
are replaced from source, while malformed ownership markers require inspection.

Use `npm run docs:references` to build and regenerate together. Existing docs:commands
and docs:config scripts delegate to the same renderer; docs:providers updates the
manifest-derived mapping table; docs:platforms updates adapter declarations. The provider source JSON catalog has its separate
providers:catalog check. Generated mapping rows describe declared operations/access,
not authenticated availability or actual server behavior. Local adapter declarations are generated from the build/install registry and remain
separate from native conformance. The native matrix still awaits P5-04 live
collection/page integration; simulation passes cannot establish native support.

## Page templates

### Step page (`docs/flow/<block>/<step>.md`)

```markdown
# <step> — <one line: what you get>

> **TL;DR** — 2–3 sentences.

> [!NOTE]
> **Status: …**

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
<!-- docnav -->
[◀ Authoring](authoring.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Glossary ▶](../glossary.md)
