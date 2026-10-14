# Documentation style — how every page is written

> **TL;DR** — Documentation is part of the product, not a by-product. Every page has a status banner, a TL;DR, a predictable structure, Mermaid diagrams in the shared palette, and a generated navigation footer. CI checks all of it.

> [!NOTE]
> **Status: 📐 design.** The conventions are in force from the first commit; the automated checks land in [P0-04](../../roadmap/phase-0-foundations.md#p0-04--documentation-tooling).

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
|---|---|
| `📐 design` | Target behaviour; nothing implemented yet |
| `🚧 partial` | Some of it works; the page says which parts |
| `✅ implemented` | Matches the released behaviour, verified by tests or conformance runs |

Banners are updated **in the same change** that moves the behaviour.

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
