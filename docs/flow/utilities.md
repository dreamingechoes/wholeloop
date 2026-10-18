# Utilities — next, status, setup, sync

> **TL;DR** — Four helpers that move you around the flow rather than through one step of it. `next` is the single front door: it figures out where things stand and runs forward to the next decision. `status` shows what is where and what is waiting on whom. `setup` configures your profile, providers and CLIs. `sync` keeps the store and your external tools in agreement.

> [!NOTE]
> **Status: 🚧 partial.** Canonical skills and local `wl next`, `wl status` and `wl setup` are implemented in [P1-12](../../roadmap/phase-1-walking-skeleton.md#p1-12--first-skills--next-status-setup-frame-problem). Generated client installation remains pending conformance. The scenarios below describe the target flow; picking up from a URL remains [P2-08](../../roadmap/phase-2-define.md#p2-08--adopt-from-a-url-publish-as-you-go), `sync` in [P4-06](../../roadmap/phase-4-rollout-learn.md#p4-06--sync).

---

## At a glance

| Utility | Invoke | Reads | Writes | Decision point |
| --- | --- | --- | --- | --- |
| **next** | `/wholeloop:next` · `$wl-next` · `/wl-next` | anything: nothing, an ID, a URL, an idea | whatever the steps it runs write | the ones in those steps |
| **status** | `/wholeloop:status` · `$wl-status` · `/wl-status` | the store | nothing | none |
| **setup** | `/wholeloop:setup` · `$wl-setup` · `/wl-setup` | your CLIs' config, the repo | user / project config · MCP config of chosen CLIs | none |
| **sync** | `/wholeloop:sync` · `$wl-sync` · `/wl-sync` | the store · `codehost` · `tracker` | the store · tracker items | none |

---

## Available local commands

```text
wl next "Find old orders faster" --owner Alex --json
wl next init-0123abcd --json
wl status --json
wl status init-0123abcd --json
wl setup --json
wl setup --profile pair --docs local-docs --tracker local-tracker --scope user --json
```

`next` begins minimal framing from a sentence. Missing ownership becomes a
question before creating an item; no input selects the sole open item or asks
which one to continue. IDs reuse unfinished runs. After framing completion it
reports the next step as unavailable until that workflow lands. Pending decisions
become questions for a person, never automatic approvals. URL adoption and
`--through` routing remain planned.

`status` reports stored items, owners, step plans, pending decisions and unread
message counts without consuming messages or writing the store. It does not yet
read live integrations or scheduled checkpoints.

`setup` returns batched choices or applies an explicit subset of profile/docs/
tracker choices. `--scope user|project|run` is required before applying choices.
All selections validate before an atomic settings write. Run scope returns a
transient override; project profile suggestions still yield to user preferences.
Adapter installation, MCP configuration edits and authentication remain manual.
The canonical skills live in `harness/skills/`; live client execution awaits the
adapter/conformance tasks, while compiled CLI workflow tests exercise these paths.

The remaining examples show the broader target behavior.

## next

**The one entry point.** Give it anything; it works out what you mean, says what it is about to do, and runs the flow forward until a person needs to decide.

```mermaid
flowchart TD
  IN["nothing · an ID · a URL · an idea"] --> LOC{"what is this?"}
  LOC -- "an idea" --> NEW["new initiative<br/>start at frame-problem"]
  LOC -- "an ID in the store" --> ST["read its state"]
  LOC -- "a URL (issue, doc, PR)" --> HY["pick it up from the URL<br/>rebuild what's needed locally"]
  LOC -- "nothing" --> AS["show what's open,<br/>ask which one"]
  ST & HY --> FIRST["first step whose output is missing"]
  NEW & FIRST --> PLAN["preflight: steps · where it stops"]:::core
  PLAN --> RUN["run steps in order"]
  RUN --> STOP{{"next decision point"}}:::person
  classDef core fill:#eceff3,stroke:#5b6573,color:#111827;
  classDef person fill:#ffd9cc,stroke:#c2410c,color:#3b1205;
```

- **States the plan before acting.** Which steps, in which order, and where it will stop — in a few lines. Say "only up to the spec" and it stops there.
- **Never repeats finished work.** It starts from the first step whose output doesn't exist yet; a step skipped with a reason stays skipped.
- **Picks up from a URL.** A tracker issue, a document or a PR is enough to rebuild the local state the next step needs, matching existing records instead of duplicating them.
- **The whole front in one go.** `next "idea" --through build` runs Define and Build back to back, still stopping at **approve** and **test it**.
- **Respects your `stops` setting.** With `stops: each-step` it pauses after every step even when no decision is due ([profile](../configuration/profile.md)).

```text
> /wholeloop:next https://linear.app/acme/issue/ENG-482

Found     ENG-482 "Filter orders by date" → no local record yet, picking it up
Has       spec (approved in Linear) · 1 scope · no slices
Plan      slice-work → build-slice → verify-works ⇄ review-code → stop at "test it"
Go?       [ Go ]  [ Only slice-work ]  [ Change the plan ]
```

## status

**What is where, and who is it waiting on.** Read-only, instant, safe anywhere.

```text
> /wholeloop:status

Waiting on you
  approve      init-41c2 spec "orders date filter"           since 2 days
  test it      slice-0d4e (green)                             wl open slice-0d4e
  ramp         scope-a9e0 at 10% · criteria met               re-check was due today
Due checkpoints
  D+30         scope-7c21 "CSV export"                        measure-impact scope-7c21
In progress
  build        slice-77ab · round 2 of 4 verify               started 14 min ago
```

`status <id>` zooms into one item; `--json` prints the same data for scripts and dashboards.

## setup

**Configure once, change any time.** Interactive, short, and it only asks about what you're about to use.

| Area | What it sets | Where it's remembered |
| --- | --- | --- |
| **Profile** | verbosity, depth, challenge, pace, stops, teaching, language — or a preset | your user config |
| **Providers** | which tool fulfils each capability (docs, tracker, codehost, sources…) | project config (team) or user config (you) |
| **CLIs** | which CLIs get adapters installed, user-wide or for this project | the CLIs' own config folders |
| **MCP servers** | install recipes for the providers you picked, per CLI (`wl mcp add <provider> --target <cli>`) | each CLI's MCP config |

```text
> /wholeloop:setup providers

Docs       ( ) local markdown  (•) Notion ✓ detected  ( ) Confluence  ( ) Google Docs
Tracker    ( ) local  ( ) GitHub Issues  (•) Linear ✓ detected  ( ) Jira
Codehost   (•) GitHub ✓ gh signed in  ( ) GitLab
Analytics  [x] PostHog ✓ detected  [ ] Mixpanel ✗ not connected → show install
Remember   (•) this repo (shared via .wholeloop/config.yml)  ( ) only me
```

Nothing has to be configured up front: every step asks for what it needs the first time and offers to remember the answer. `setup` is just the place to see and change it all at once.

## sync

**Make the store and your tools agree.** Reality first: merged PRs, closed issues and flag states are read, the store is updated to match, and external items are moved to reflect it.

```mermaid
flowchart LR
  R["reality<br/>PRs · issues · flags"] --> S["store"]:::core --> T["tracker items"]
  S --> W["worktrees of merged<br/>slices removed"]
  classDef core fill:#eceff3,stroke:#5b6573,color:#111827;
```

- **A merged PR closes its slice** and removes the slice's worktree; when every slice of a scope is closed, the scope moves to Rollout.
- **Tracker items follow** — transitioned to match, never moved backwards without asking.
- **Idempotent and safe on a schedule.** Running it twice changes nothing the second time; a CLI's scheduler or plain `cron` can run `wl sync` headless.
- **Reports, never guesses.** A PR it can't match to a slice is listed, not assigned.

```text
> /wholeloop:sync

▸ checked 6 open slices against GitHub
✓ slice-0d4e  PR #151 merged → closed · worktree removed · ENG-482 → Done
✓ scope-a9e0  all slices closed → ready for prepare-launch
? PR #155     no matching slice — link it with: wl link <slice> #155
```

---

## Gotchas & FAQ

**"Do I need `next` at all?"** No. Calling a step directly is just as valid; `next` saves you from remembering which one comes now.

**"Can a teammate continue my work?"** Yes, if the work lives in a shared tool (tracker, docs, PRs). They run `next <URL>` and it rebuilds what's needed on their machine. Purely local work stays on yours.

**"Will `sync` overwrite edits made in the tracker?"** No. External edits win on content; `sync` only moves status and links to match what really happened.

---

<!-- docnav -->
[◀ decide-next](learn/decide-next.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Configuration ▶](../configuration/README.md)
