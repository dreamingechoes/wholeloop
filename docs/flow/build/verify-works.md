# verify-works — check that the change keeps its promises

> **TL;DR** — The quality gate for behaviour. It runs your repository's own checks a single time, takes the slice's acceptance criteria exactly as written, and gives each one to a read-only verifier that tests it against what the code really does. It also asks whether the tests you touched would notice if the feature broke. Every finding is challenged before it blocks. It reports; the builder repairs; the loop repeats until green.

> [!NOTE]
> **Status: 🚧 partial.** Gate planning, per-criterion coverage, budgets, refutations and snapshot-bound verdicts are implemented. Actual suite execution, changed-test analysis and this step workflow are pending. Tracked in [P3-05](../../../roadmap/phase-3-build.md#p3-05--verify-works).

---

## At a glance

| | |
| --- | --- |
| **Block** | Build — inside the "until green" loop, or on its own |
| **Invoke** | `/wholeloop:verify-works` · `$wl-verify-works` · `/wl-verify-works` |
| **Decision point** | None — *until green* is a machine loop with a round limit |
| **Reads** | A slice's worktree, a branch or a PR · its acceptance criteria (from the slice, an issue, the PR description, or you) |
| **Writes** | One verdict per round on the slice — `PASS` or `FAIL`, each finding with its evidence · nothing inside your repository |
| **Slots** | `verify.suite` — the test, lint and type-check commands your repo already uses |
| **Capabilities** | `codehost` (read a PR) · `tracker` (read criteria from an issue) |
| **Agents** | `verifier` — one per criterion or test group, plus the challengers of each finding |

## When to use it — and when not

**Use it when** "the tests pass" is not the same question as "users get what we said they would". Inside the flow, [`build-slice`](./build-slice.md) calls it after every build round.

**Don't use it for** naming, structure or whether an abstraction is right — that belongs to [`review-code`](./review-code.md). Behaviour first, craft second; they always run in that order.

## How it works

```mermaid
flowchart TD
  IN["slice worktree · branch · PR"] --> SU["repo checks, one run<br/>tests · lint · types"]:::core
  IN --> AC["acceptance criteria,<br/>exactly as written"]
  AC --> V1["verifier · criterion 1"]
  AC --> V2["verifier · criterion 2"]
  AC --> V3["verifier · test group"]
  SU --> CF["touched tests:<br/>would they catch a break?"]
  V1 & V2 & V3 & CF --> X["each finding challenged<br/>by 3 independent verifiers"]
  X --> R{"2 or more say<br/>it is wrong?"}
  R -- yes --> DROP["dropped, with their reasons"]
  R -- no --> KEEP["blocker"]
  DROP & KEEP --> VD["single verdict"]:::build
  VD -- FAIL --> BACK["to the builder<br/>round n of 4"]
  classDef core fill:#eceff3,stroke:#5b6573,color:#111827;
  classDef build fill:#dce9fb,stroke:#2f6fc4,color:#0b1f3a;
```

1. **One run of the checks, shared by everyone.** They run inside the slice's own worktree, so nothing you have open is disturbed, and verifiers read the result instead of launching their own. The commands come from `wl discover` (package scripts, `Makefile`, task runners, CI config) or your explicit `verify.suite` binding — never guessed.
2. **Criteria are the contract.** A verifier judges the change against what was agreed, not against its own taste in features.
3. **Tests that can't go red are findings.** If a test would still pass with the feature deleted, it is reported — it gives confidence it hasn't earned.
4. **Findings must survive a challenge.** Three verifiers try to knock each one down; it is dropped only if two or more actively argue against it. A verifier that crashes or times out simply doesn't count, so silence can never erase a real problem.
5. **Doubt keeps correctness findings alive.** If nobody can show the behaviour is right, the finding stays.
6. **Reads, never writes.** Verifiers have no edit tools wherever the CLI can enforce that, and the core checks the slice's worktree is untouched after each round — any change fails the round.
7. **Bounded, and yours to tune.** Four rounds by default; change it per project (`gates.verify.rounds`) or per run (`--rounds verify=6`). Still red at the limit? The run stops, hands you every finding with its evidence, and asks whether to extend or stop.

## Standalone use

| You give it | It checks |
| --- | --- |
| nothing | the current branch against its base |
| `slice-0d4e` | that slice's worktree against its criteria |
| `#142` or a PR URL | that PR, checked out in a temporary worktree, with criteria from its description or linked issue |
| a branch name | that branch, in a temporary worktree; criteria are requested if none are found |

No criteria anywhere? It **asks**. Without them the result is only a test run, and the verdict says exactly that.

## Run it

```text
> /wholeloop:verify-works slice-0d4e

Verify — slice-0d4e "user can filter orders by date"
Checks    npm test · npm run lint · npx tsc --noEmit   (from package.json)
Criteria  4 (from slice-0d4e)
Round     1 of 4

▸ checks ran — 212 passed · 0 failed · lint clean · types clean
▸ verifiers started: AC-1 · AC-2 · AC-3 · AC-4 · touched tests
✓ AC-1  ✓ AC-2  ✗ AC-3  ✓ AC-4
✗ touched tests: filters.spec.ts "applies range" still passes with the filter removed
▸ challenging 2 findings…
  AC-3 kept — nobody argued against it (end date excluded; criterion says included)
  touched tests kept — 1 of 3 argued against it

Verdict   FAIL — 2 blockers, recorded on slice-0d4e
Next      builder, round 2 of 4
```

| CLI | Invoke | Parallel verifiers |
| --- | --- | --- |
| Claude Code | `/wholeloop:verify-works …` | native subagents |
| Codex CLI | `$wl-verify-works …` | native subagents |
| OpenCode | `/wl-verify-works …` | native subagents |
| Copilot CLI | `/wl-verify-works …` | native subagents (`/fleet`) |
| Gemini CLI · Antigravity · Cursor | `/wl-verify-works …` | native where available, otherwise headless or one by one ([orchestration](../../architecture/orchestration-and-gates.md)) |

## Before & after

- **Fed by:** [`build-slice`](./build-slice.md) on every round, or any branch or PR directly.
- **Feeds:** [`review-code`](./review-code.md) when green; the builder when red.

## Gotchas & FAQ

**"Everything is green locally — why FAIL?"** Passing tests and met criteria are different claims. The verdict names the criterion and shows the evidence.

**"It picked the wrong test command."** Pin it once: `wl answer verify.suite="make check" --scope project`, or set it in `.wholeloop/config.yml`.

**"Can I skip a verifier to save time?"** You can make it slower; you can't make it check less ([ADR-0010](../../decisions/0010-interaction-profile-never-changes-coverage.md)).

**"Does it see the UI?"** Not from source alone. Until a rendering source is configured, the verdict states that visual behaviour was not checked.

---

<!-- docnav -->
[◀ build-slice](build-slice.md)  ·  [📖 Docs index](../../README.md)  ·  [🧭 Concepts](../../concepts.md)  ·  [review-code ▶](review-code.md)
