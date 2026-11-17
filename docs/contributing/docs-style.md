# Documentation style — how every page is written

> **TL;DR** — Documentation is part of the product. Write for a smart newcomer with no context: short paragraphs, the key term in bold, a real example with its real output, and a diagram when an idea has moving parts. Keep the history of decisions in the ADRs, not in the pages people read to get something done. CI checks the structure; this page explains the rest.

`npm run check` enforces the mechanical part on every change: `wl docs check` (navigation footers, the nav list, status notes, links, anchors and the status of referenced ADRs), markdownlint and the Mermaid parse check.

## Contents

- [Who you are writing for](#who-you-are-writing-for)
- [Paragraphs and emphasis](#paragraphs-and-emphasis)
- [Commands and their output](#commands-and-their-output)
- [Terminal recordings](#terminal-recordings)
- [Diagrams](#diagrams)
- [Decisions and why](#decisions-and-why)
- [Status notes](#status-notes)
- [Markdown source layout](#markdown-source-layout)
- [Generated content](#generated-content)
- [Page templates](#page-templates)
- [Tutorials and how-to guides](#tutorials-and-how-to-guides)

## Who you are writing for

Picture someone who is **smart, short on time and new to wholeloop**. They know Git and a terminal. They do not know what a *grant*, a *receipt* or a *slot* is, and they did not read the page before this one.

- **English**, always.
- **"You"**, not "the user".
- **Warm and direct.** Say what happens, then why it matters.
- **Honest.** Never describe planned behaviour as if it existed. A page describes released behaviour unless its [status note](#status-notes) says otherwise.

## Paragraphs and emphasis

A wall of text loses the reader even when every sentence is right.

- **One idea per paragraph, three or four sentences at most.** When a paragraph lists things, make it a list.
- **Bold the key term** the first time it appears in a section, so a skimming reader finds it. Use *italics* for a nuance or a term being introduced. Do not bold whole sentences.
- **Define every wholeloop term on first use**, in a few words or with a link to the [glossary](../glossary.md). A page must not assume the reader came from another page.
- **Rules go in lists or tables.** "Never X, never Y, only Z when W" reads better as three bullets.
- **Open with the outcome.** Each section starts with what the reader gets or does, then the detail.
- **Use callouts sparingly.** `> [!TIP]` for a shortcut or a reassurance ("`unknown` is not a failure"), `> [!WARNING]` for something that loses work or exposes a secret. One or two per page.

## Commands and their output

A command without its output asks the reader to trust it blindly.

- **Show the output after every command** in a `console` block, with the prompt `$` before the command. A reader sees what success looks like before running it.
- **Use real output.** Run the command with the released CLI in a disposable home, then paste what it printed. Shorten personal or temporary paths to `~` and long identifiers to their first characters followed by `…`; mark removed lines with a single `…` line.
- **Explain the flags** of a long command in a short table under it: flag, what it does, when to change it.
- **Long setup goes in a `<details>` block** with a summary such as "Setup: copy once". The reader sees the steps that teach something, not the boilerplate around them.
- **Sessions with a coding client are illustrative.** Their wording changes with the model, so label them as an example and never present one as observed output.
- **Exit codes that are not zero are part of the example.** When a command is expected to fail, say so before it and show what it prints.

```console
$ wl status
No stored work yet. Ask your coding client for wl-frame-problem, or run 'wl next <idea>'.
```

## Terminal recordings

Short animations show a command running, which a static block cannot.

- Each recording is a [VHS](https://github.com/charmbracelet/vhs) script under `docs/assets/terminal/` (`.tape`) and the GIF it renders next to it.
- Render with `vhs docs/assets/terminal/<name>.tape` from the repository root, with the released CLI on the path. Each script sets its own disposable `HOME` and state directories, so no personal path appears in the image.
- Record only `wl` commands with their real output; never a simulated model session.
- Keep each recording under 30 seconds and the GIF under 1 MB. The README links them by their absolute `raw.githubusercontent.com` URL, like the diagrams, so npm can show them.
- Re-render a recording when its commands or their output change. No gate checks them, so mention it in the change.

## Diagrams

Draw a diagram when an idea has **more than three actors, states or steps**. A diagram supports the text; it does not replace the sentence that says what it shows.

- Inside `docs/`, use a `mermaid` code block, which GitHub renders. Keep it small: one idea, about a dozen nodes at most.
- Use the shared palette, which reads on light and dark themes:

| Class | Use for | Definition |
| --- | --- | --- |
| `person` | A person's decision | `fill:#ffd9cc,stroke:#c2410c,color:#3b1205` |
| `core` | The `wl` core, the store, generic nodes | `fill:#eceff3,stroke:#5b6573,color:#111827` |
| `define` | Define block | `fill:#d9f2e3,stroke:#1f7a45,color:#0b2e1a` |
| `build` | Build block | `fill:#dce9fb,stroke:#2f6fc4,color:#0b1f3a` |
| `rollout` | Rollout block | `fill:#fbecd0,stroke:#b7791f,color:#3a2606` |
| `learn` | Learn block | `fill:#f6dcef,stroke:#b03a8c,color:#3a0b2c` |
| `opt` | Optional | `stroke-dasharray:5 3` |

### README diagrams

The root README is also the package page on npm, which shows Mermaid as code. Its diagrams are therefore images:

- Each one has a `.mmd` source in `docs/assets/diagrams/` and an SVG rendered from it with `npm run docs:diagrams`.
- The README links the SVG by its absolute `raw.githubusercontent.com` URL, so npm can load it.
- The SVGs use plain text labels, a common font and a white background, so they read the same on GitHub's light and dark themes and on npm.
- Each SVG starts with its source's SHA-256. The Mermaid check parses the sources and fails when an SVG is missing or older than its source. Biome skips the rendered SVGs, which are generated output.

## Decisions and why

**Say why.** A rule without its reason invites someone to delete it. Give the reason in a sentence, where the rule is.

**Pages people read to use wholeloop do not link ADRs.** That covers the README, getting started, tutorials, step pages, configuration, platforms, troubleshooting, the FAQ, the glossary, concepts and philosophy. The [decision records](../decisions/README.md) are the history of how the design got here; they change as features are added, and a reader who wants to get something done does not need them. Architecture, contributing and reference pages link them, because their readers change the design.

**Every referenced ADR must have a settled status.** `wl docs check` reads the first fifteen lines of each linked ADR, and of each plain `ADR-NNNN` mention, and requires exactly one status:

- `Accepted`;
- `Superseded`, `Superseded by NNNN`, or `Superseded by` a relative link whose label matches the file's number.

It refuses a missing, proposed, rejected or deprecated status, a duplicate or late status line, a status inside a code example, an ambiguous successor and a cycle of successors. A draft record that nothing links may stay Proposed until it is accepted. This is how [P0-07](../../roadmap/phase-0-foundations.md#p0-07--review-and-accept-the-foundational-adrs) is enforced; the metadata does not prove that native clients behave as the decision says.

## Status notes

A page describes released behaviour, so it needs no line saying that the behaviour exists. Add a note right after the TL;DR only when the reader must know that it is **not settled**:

| Note | Use it when |
| --- | --- |
| `> [!IMPORTANT]` then `> **Experimental.** …` | The page covers an [experimental surface](../extending/compatibility.md#experimental-surfaces), such as autonomous delivery: released and tested, but it may change in a minor release |
| `> [!NOTE]` then `> **Partial.** …` | Part of the behaviour is missing; say which part |
| `> [!NOTE]` then `> **Design.** …` | The page describes target behaviour that is not implemented yet |

- Keep a note to one or two sentences: what is not settled and, when it helps, why.
- A limit that does not change the page's status, such as remote publication being experimental on a step page, is an ordinary sentence under the TL;DR.
- Dates, task history and work in progress belong in the [journal](../../roadmap/journal.md).
- A note changes **in the same change** that moves the behaviour, and is removed when the behaviour settles. `wl docs check` refuses the `> **Status: …**` banner that every page carried before 1.0.1, so it cannot return ([ADR-0016](../decisions/0016-documentation-is-part-of-the-product.md)).

## Markdown source layout

**Keep each prose paragraph on one source line**, with no column limit, and the same for prose in list items and blockquotes. Separate paragraphs with a blank line and let the renderer wrap. Hard wrapping at 80 columns moves unrelated text when one sentence changes.

Line breaks that are syntax stay as they are: fenced and indented code, inline code, HTML, tables, link destinations and titles, explicit hard breaks and GitHub alert headers. Generated sections keep their generator's format. Markdown files under `test/fixtures` and `test/evals/definition/artifacts` are byte-exact test data, which the paragraph rule leaves alone.

- `npm run lint:md` checks the layout with the WL001 rule.
- `npm run lint:md:fix` joins wrapped prose and applies markdownlint's own fixes. Review the diff, especially literal examples.

## Generated content

Some sections mirror code and are written by tools, between `<!-- name:start -->` and `<!-- name:end -->` markers. **Never edit them by hand.**

| Section | Page | Regenerate with |
| --- | --- | --- |
| Commands | [core CLI](../architecture/core-cli.md) | `npm run docs:references` |
| Configuration keys | [configuration](../configuration/README.md) | `npm run docs:references` |
| Provider mappings | [providers](../configuration/providers.md) | `npm run docs:references` |
| Adapter declarations | [platforms](../platforms/README.md) | `npm run docs:references` |
| Conformance matrix | [platforms](../platforms/README.md) | `wl conformance matrix <results.json> --docs <repository> --write` |
| Navigation footers | every page | `npm run docs:nav` |

How the checks behave:

- `wl docs check` builds nothing; build first. It compares each table with the built core's contracts, not with your configuration or any signed-in service.
- `wl docs reference` checks the tables without changing files and exits 4 on drift. `--write` regenerates all four sections, or one with `--kind commands|config|providers|platforms`. It checks every marker before writing, keeps the surrounding prose and skips unchanged pages.
- A missing page, or a missing, reversed or duplicated marker, fails: a missing marker must never pass as an empty comparison.
- The write is not atomic across files. After an interrupted write, restore any broken marker and regenerate.
- Provider rows describe declared operations, not what a signed-in service actually allows. Adapter rows come from the build registry and are separate from native conformance, whose evidence the nightly job collects outside the gate.

### Expanded delivery acceptance map

When you change an autonomous-delivery specification case, update [the acceptance map](../reference/delivery-acceptance.md) in the same change. The docs gate requires:

- every accepted case definition, with one row per declared case and its exact definition file;
- existing test and evaluation links, and executable enforcers from `enforcement.yml`;
- the required native, hosted, backend and platform labels, which cannot be downgraded.

A green local gate does not close external acceptance; keep its observed records and failures in the manual verification list.

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

A tutorial takes the reader to **an observable result**. Give it:

1. **What you will have at the end**, in one or two sentences, and a diagram when the route has several stages.
2. **Before you start**: what to install, which directory to start in, what stays untouched.
3. **Steps** that each follow the same shape: what you are doing and why → the command or client request → its output → what the output means.
4. **A stopping point** and the next useful page.

Also:

- **Label terminal commands and client requests separately.** A `wl` command in a terminal never starts a conversation with a model.
- **Show how to keep IDs and recover** in a new terminal or session, and what an expected non-zero exit looks like.
- **Use a disposable store and repository** for scripted exercises, never the reader's project or personal history.
- **Run every command as written** before publishing it. When a step needs a real account, a permission choice or a person's judgement, describe that boundary and what the reader should see, instead of inventing a successful transcript.
- **Keep reference detail out.** Schemas and every option belong in the reference pages, so the first-use route stays readable.

Good models: the [local core tour](../tutorials/local-core.md) for a terminal-only route, and [first framing](../tutorials/first-framing.md) for a route through a coding client.

<!-- docnav -->
[◀ Nightly conformance](conformance.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Glossary ▶](../glossary.md)
