# 0010 — The interaction profile never changes coverage

- **Status:** Accepted
- **Date:** 2026-10-14

## Context

**Amended 2026-11-21 ([ADR-0258](./0258-proportional-depth-and-gate-cost.md)).** Coverage may now vary, but only through an explicit rigor choice (`quick`, `standard`, `deep`) for research and gates, made by the person or proposed by the step and confirmed for that run, never by a profile, preset or dial. `standard` keeps the coverage this record describes; reduced coverage is recorded in the artifact and shown in the result, and nothing drops below the refutation quorum. Finding severity changes what fails a round, not what is inspected. Rejected: letting a preset or the profile's `depth` dial choose rigor, which is the hidden quality setting this record exists to prevent.

**Amended 2026-11-08.** Autonomous delivery lets a person take a decision in advance instead of at its decision point: an explicit, recorded grant authorizes the work, and pinned rubrics let independent machine judges apply the decision ([ADR-0112](./0112-private-delegation-and-independent-machine-decisions.md)). That is a grant of authority, never an interaction setting, so this record still holds: no profile, preset or dial can skip, delegate or weaken a decision point, a lens or a necessary question. The [philosophy](../philosophy.md#5-people-own-every-decision-at-the-moment-or-in-advance) now reads "people own every decision, at the moment or in advance" and keeps its earlier wording, "people decide at fixed points", visible. Rejected: an `autopilot` profile that also delegates decisions, which would turn a style choice into a transfer of accountability.

People want different things from the same harness. Some want detailed explanations, others one line per action. Some want a sparring partner that argues every assumption, others a supportive pair. Some are comfortable with five agents running at once, others want to see each plan before code is written. Forcing one style makes the harness feel wrong to half its users.

The risk is that a style setting becomes a quiet way to lower the bar: "brief" that skips explanations people need to decide, "autopilot" that skips checks, "fast" that asks fewer necessary questions.

## Decision

1. **Personal dials:** `verbosity`, `depth`, `challenge`, `pace`, `stops`, `teaching`, `language`, `artifact_language` — with presets `mentor`, `pair` (default), `sparring`, `autopilot`. Teams may add presets ([ADR-0008](./0008-extensibility-through-manifests.md)).
2. **Profile keys are personal.** The user's file beats the project's suggestion; a run override beats both, for that run only.
3. **The core renders the profile** into a style block of at most ten lines included in every `wl step begin` payload. Skills never interpret dials themselves.
4. **Invariants no dial can touch:**

   | Invariant | Meaning |
   | --- | --- |
   | Output contract | Preflight, one-line narration, stop on request, receipt — always |
   | Coverage | Every lens, every verification, every round budget as configured, at the rigor the person chose for the run ([ADR-0258](./0258-proportional-depth-and-gate-cost.md)); no dial sets rigor |
   | Decision points | All of them, in every profile |
   | Ask, never guess | Fewer *optional* questions are allowed; fewer *necessary* ones never are |

5. **`verbosity` governs explanation only** — how much reasoning surrounds each action — never the output contract. **`pace` governs concurrency only.** **`challenge` governs how hard ideas are questioned in conversation**, not which adversarial checks run.

## Consequences

### Positive

- The harness adapts to the person without becoming a different harness.
- Identical style instructions in every CLI, snapshot-tested.
- A team can trust any member's run to have the same coverage.

### Negative

- Some users will want a "just do it, skip the checks" mode; the answer is an explicit rigor choice that is recorded and shown, never a profile setting.
- The invariants must be enforced in code and tests, not only stated here ([ADR-0011](./0011-size-budgets-and-enforcement.md)).

## Alternatives considered

| Option | Why not |
| --- | --- |
| No profile at all | One style fits nobody well |
| Profile can relax checks | Turns a preference into a hidden quality setting |
| Skills read dials directly | Each CLI and skill would interpret them differently |

## Links

- [Interaction profile](../configuration/profile.md)
- [P1-06 — profile](../../roadmap/phase-1-walking-skeleton.md#p1-06--interaction-profile)

[◀ Decisions index](./README.md)
