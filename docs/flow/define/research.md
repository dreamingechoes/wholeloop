# research — an evidence-first brief on any hard question

> **TL;DR** — Splits a question into **angles**, investigates each one against a real source in parallel, lets a challenger try to refute the claims the conclusion rests on, and hands back a **brief**: claims with evidence and confidence, plus the open questions nothing could answer. Optional in the flow; useful on its own any day.

Independent angles run concurrently at every interaction pace when the client supports native fan-out; otherwise the same assignments run sequentially. Actual native overlap and authenticated sources still need live-client evidence.

## At a glance

| | |
| --- | --- |
| **Block** | Define — optional, only when it's hard |
| **Invoke** | `/wholeloop:research` · `$wl-research` · `/wl-research` |
| **Decision point** | None |
| **Reads** | A question (text, file or URL) · optionally an initiative or scope ID |
| **Writes** | A brief (`brief-xxxx`) in the store · optionally attached to an initiative · optionally published through the `docs` capability |
| **Slots** | `research.method` (a repo's own research skill, if any) |
| **Capabilities** | any `source.*` provider — web, code, product analytics, BI, support, errors, observability, knowledge… |
| **Agents** | `researcher` (one per angle) · `challenger` (cross-examination) |

## When to use it — and when not

**Use it when** the answer depends on several unknowns — usage data, technical feasibility, what comparable products do, what support is hearing — and a confident guess would be expensive.

**Skip it when** the problem and a plausible success signal are already clear. [`frame-problem`](./frame-problem.md) can start from a sentence and calls `research` itself when it judges the problem too hard to frame directly.

## How it works

```mermaid
flowchart TD
  Q["question"] --> P["plan angles<br/>one per source, schema-bound"]
  P --> C{{"confirm angles"}}:::person
  C --> A1["researcher · web"]
  C --> A2["researcher · product analytics"]
  C --> A3["researcher · codebase"]
  C -.-> A4["unavailable source<br/>→ open question"]:::opt
  A1 & A2 & A3 --> X["challenger cross-examines<br/>the load-bearing claims"]
  X --> R{"≥ 2 of 3 verifiers refute?"}
  R -- yes --> DROP["claim dropped,<br/>reason recorded"]
  R -- no --> KEEP["claim kept,<br/>with confidence"]
  DROP & KEEP --> B["brief: claims · evidence · confidence · open questions"]:::core
  A4 --> B
  classDef person fill:#ffd9cc,stroke:#c2410c,color:#3b1205;
  classDef core fill:#eceff3,stroke:#5b6573,color:#111827;
  classDef opt stroke-dasharray:5 3;
```

1. **Sources are providers.** The angles on offer are exactly the `source.*` providers you have configured or that `wl` detects. Add a provider and it shows up here, with no change to the step ([extending/providers](../../extending/providers.md)).
2. **Confirming angles is cheap and optional.** It is a lightweight check, not one of the six decision points: say "go", "drop 2" or "add competitors' mobile apps".
3. **Never fabricated.** A source that is not configured, not authenticated or returns nothing becomes an **open question** with what is missing and who might have it.
4. **Cross-examination is bounded.** Only the claims each angle's conclusion rests on are challenged; a claim falls only on **two active refutations**, so a silent verifier cannot delete a real finding.
5. **The brief has a fixed shape**, checked by `wl step complete` before it is recorded.

The plan view returns pending `jobs` and `examinations`. Each assignment includes its question, exact allowed source, angle or original claim, inline result schema and final-message destination. Start independent jobs before joining native handles; launch examination slots after the source phase has joined. Another verifier's vote is never part of an assignment. The conductor validates and submits the returned results.

## Standalone use

Alone, `research` needs only a question. It creates a **loose brief** that you can later feed into [`frame-problem`](./frame-problem.md) (`--from brief-7f3a`) or simply keep. Inside an initiative, the brief attaches to it and its open questions become inputs to the next step.

## Run it

![research: an illustrative example session in a coding client](../../assets/terminal/session-research.gif)

*Illustrative: the example session below, animated. Its wording depends on your client and model, and remote sources such as PostHog need a provider you configured.*

The same session as text:

```text
> /wholeloop:research Do users struggle to find their past orders, and how do comparable products solve it?

Research — "Do users struggle to find their past orders?"
Mode      standalone · no initiative · brief stored outside the repo
Profile   pair (standard · balanced challenge)
Sources   not configured for this repo yet ↓

Which sources can I use?                                 (multi-select)
  [x] Web                    native
  [x] This codebase          native
  [ ] PostHog                ✓ MCP detected in your CLI config
  [ ] Mixpanel               ✗ not connected — I can show you how to add it
  [ ] Support tickets        ✗ no provider configured
Remember this for:  ( ) just this time  (•) this repo  ( ) always

Angles (3) — "go", "drop 2" or "add …"
 1  web       how comparable products expose order history, search and filters
 2  posthog   orders-page usage: searches, time to find, drop-off
 3  codebase  current orders list: filters, pagination, query limits
 —  support   not available → open question

▸ researcher:web started · researcher:posthog started · researcher:codebase started
✓ codebase 3 claims · ✓ posthog 2 claims · ✓ web 4 claims
▸ challenger cross-examining 4 load-bearing claims…
✗ dropped 1 claim — 2 of 3 verifiers refuted it (single-week sample)

Produced
  Research brief   brief-7f3a    wl open brief-7f3a
Open questions     2             support tickets unreachable · no baseline for "time to find"
Next (optional)    /wholeloop:frame-problem --from brief-7f3a
```

| Client | Invoke | Parallel angles run as |
| --- | --- | --- |
| Claude Code | `/wl-research …`, or `/wholeloop:research …` with the plugin | native subagents |
| Codex CLI | `$wl-research …` | native subagents |
| OpenCode | Ask for `wl-research` | native subagents |
| Copilot CLI | Ask for `wl-research` | native subagents (`/fleet`) |
| Gemini CLI · Cursor | Ask for `wl-research` | native where available, otherwise headless or one by one |
| Antigravity | Ask for `wl-agy-research` | native where available, otherwise headless or one by one |

## Before & after

- **Fed by:** anything: a question, a pasted thread, a file, an existing initiative or scope.
- **Feeds:** [`frame-problem`](./frame-problem.md) and [`write-spec`](./write-spec.md) (evidence, baselines, open questions); any later step that needs evidence.

## Gotchas & FAQ

**"It asked me which sources to use — every time?"** Only until you answer with *this repo* or *always*; then it is remembered at that scope.

**"A source I need is not in the list."** Write a provider manifest for it, usually a few lines pointing at an MCP server ([how](../../extending/providers.md)).

**"Why was a claim dropped that looked right to me?"** The receipt links each dropped claim with the verifiers' reasons. If they were wrong, that is a calibration case worth adding to the eval corpus.

## Available core workflow

The commands the skill uses, for scripts and skill authors:

```text
wl step begin research --input "How do people find old orders?" --owner Alex --json
wl research plan --for brief-0123abcd --json
wl research submit --for brief-0123abcd --file /path/to/source-result.json --json
wl research examine --for brief-0123abcd --file /path/to/examination.json --json
wl research complete --for brief-0123abcd --json
```

- **Attach or resume.** `step begin research --parent <initiative-or-scope>` attaches a new brief, and its owner becomes a known fact. `--for` resumes an existing brief.
- **Claims.** Each claim carries evidence references with excerpts, a confidence and whether the conclusion rests on it (*load-bearing*). The versioned schemas in `src/research/schemas/` define source results and votes.
- **Verifiers.** Each verifier returns a reasoned `refute`, `confirm` or `uncertain`; a refutation needs evidence. The plan pins the number of verifiers (`research.verifiers`: 3, 5, 7 or 9; default 3) and its strict-majority threshold, so changing the setting later does not change a run.
- **Append-only.** Source results and examinations cannot be replaced within a run; start a new run to revise them. `research complete` builds the brief from what was recorded, and a different final artifact is refused.
- **Gaps stay visible.** A missing source result becomes an open question with an owner. A missing or uncertain examination keeps the claim, at low confidence, and a duplicated verifier counts once.
- **Independence is the client's job.** The core cannot check that verifiers ran in separate sessions; the client assigns them.

A completed brief adopted into an initiative can also be published with the initiative's other Define artifacts. [Shared publication](../utilities.md#adopt-a-url-and-publish-define-artifacts).

<!-- docnav -->
[◀ The flow](../README.md)  ·  [📖 Docs index](../../README.md)  ·  [🧭 Concepts](../../concepts.md)  ·  [frame-problem ▶](frame-problem.md)
