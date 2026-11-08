# Philosophy — why the harness is the half that is yours

> **TL;DR** — An agent is a model plus a harness. The model is rented and identical for everyone; the harness is what makes the outcome depend on the *system* rather than on who happens to be driving. `wholeloop` is a harness built around one agreed path, from a loose idea to a measured result, that respects whatever your repository already knows. It serves one person as well as a team, and it lets people decide either at each step or in advance, within limits they set. The last section tells how those two ideas grew out of the first version.

> [!NOTE]
> **Status: 🚧 partial.** These principles guide the implemented deterministic core and canonical harness. Client narration, immediate stopping and provider behavior also depend on actual hosts; native/model conformance and operational checks remain in the [manual checklist](../roadmap/manual-verification.md).

---

## Same model, different results

Two engineers, one feature. Before starting, one looks at the data, the other opens the editor — they are solving different problems and nobody notices until review. While building, one argues with the model's first answer, the other accepts it; on screen both look equally finished, which is exactly what makes it dangerous. Every review asks different questions, every rollout re-decides the same four things, and after launch the learnings live in someone's notes or nowhere.

The model is identical in every one of those moments. The process around it is not. **A faster tool amplifies whatever process you already have — including the absence of one.**

The same happens to one person on two different days. On Monday, with time, you look at the data first; on Friday, in a hurry, you open the editor. You do not need a team to be inconsistent; you only need a deadline. The harness gives a team a shared path and gives one person a path they can keep with themselves.

## The half that is yours

| Half | What it is | Who has it |
| --- | --- | --- |
| **Model** | The reasoning engine | Everyone, the same version on the same day |
| **Harness** | What context the agent gets and from where · which tools it can reach · in what order things happen · where it stops and who decides · how you know afterwards that it worked | Only you — and usually decided differently by each person, without anyone having decided that |

Something everyone has cannot be your edge. The harness can.

## A goal before a tool

The point is not automation for its own sake. It is **where people spend their time**. If agents take the work whose cost is mostly volume — writing code, writing tests, running QA, checking whether a metric moved — the hours that come back go to the part no model does yet: working out whether what is asked for is what is needed, hearing what a user cannot quite say, deciding what deserves to exist at all.

That shift only happens when the hand-off is reliable enough that nobody has to babysit it — a property of the process, not of the model. And it stays **an option, never a mandate**: anyone can still write a piece by hand, and the gates treat their work exactly the same.

## The principles, with their reasons

### 1. Ask, never guess

A confident assumption is the most dangerous mistake an agent can make, because it does not look like one. A machine that is wrong and says so is easy to correct; one that is wrong with confidence produces polished work on a false premise. So any fact the harness lacks — a path, a goal, a metric, a destination — becomes a **batched question**, and anything a source cannot reach becomes an **open question**, never a plausible fill-in. ([ADR-0010](./decisions/0010-interaction-profile-never-changes-coverage.md) makes this an invariant no setting can relax.)

### 2. Deterministic process, adaptive content

The flow runs the same steps in the same order for everyone. A step may resolve to *"not applicable, because X"*, but it is never skipped silently. What changes per initiative is what each step **produces**. In `wholeloop` this is literal: the process lives in a tested core ([ADR-0003](./decisions/0003-deterministic-core-cli.md)); the prompts only do the creative part.

### 3. Your repository first

Your repository, whether one person or a team keeps it, already encodes how it is built: skills for its backend, a design system, lint rules, a test command, a PR convention. A generic harness that ignores them produces generic code. Every step therefore **discovers and prefers** what the repository already has, and falls back to its own defaults only when nothing more specific exists ([ADR-0009](./decisions/0009-repo-first-capability-resolution.md)).

### 4. Bring your own tools

Confluence or Notion, Jira or Linear, Mixpanel or PostHog — the flow does not care. It needs *capabilities* (write a document, track a work item, query product analytics) and lets you choose who provides them. When the provider you need does not exist yet, adding it is a manifest, not a fork ([ADR-0008](./decisions/0008-extensibility-through-manifests.md)).

### 5. People own every decision, at the moment or in advance

The harness does not stop because it technically cannot go on. It stops because going on would produce a tidy answer to a question nobody has finished asking. Those stops are **hand-offs**, not controls: the point where processing information ends and product judgement starts — approving a spec, running the change on your own machine, deciding whether to kill something that shipped. That is where accountability lives, and it stays with a person.

This principle first read *"people decide at fixed points"*, and the supervised flow still works that way by default: it stops at the same six points, every time, in every mode ([decision points](./concepts.md#decision-points)). What changed is where the decision can be taken. A person can also decide **in advance**: which work is authorized, which rubric judges each decision, within which limits and budget, and what always comes back to them. A machine then applies that decision; it never makes one nobody delegated. Delegation is an explicit, recorded authorization, never a style setting: no interaction profile can switch a decision point off ([ADR-0010](./decisions/0010-interaction-profile-never-changes-coverage.md), [ADR-0112](./decisions/0112-private-delegation-and-independent-machine-decisions.md)). Some decisions are never delegated: widening the machine's own authority, changing what counts as accepted, and supplying a fact only a person knows.

### 6. Always legible

People rarely stop trusting a tool because of what it does; they stop when they cannot tell what it is doing. Every run states a **preflight** (what will happen, where, what it will never do, how to stop it), **narrates** one line per event, stops the instant you say so, and ends with a **receipt** of what it produced — actionable rows first, each with the command that opens or undoes it.

### 7. Done means measured, not merged

More than half of the flow sits after the merge: communications drafted, exposure ramped step by step, and weeks later the real numbers back on the table next to what the spec promised. The follow-up that used to depend on who remembered simply happens.

### 8. Small, correctable, alive

A harness is a snapshot of how you, or your team, work on the day it was written. It stays useful only while it keeps following you:

- **The conversation leads, the harness follows.** Rules change in a retro, a thread or your own review of last week's work, never in a commit nobody thought through.
- **Every repeated failure is a candidate rule** — once it has happened more than once. One case is an anecdote.
- **Changes to the checks get measured** against a corpus of known defects and harmless look-alikes. A fix that makes a reviewer cry wolf is not a fix.
- **Removing counts as much as adding.** A rule nobody can justify is a leftover.

That is also why skills are short and every hard rule has something that *executes* it ([ADR-0011](./decisions/0011-size-budgets-and-enforcement.md)): a rule that only exists as prose is decoration the agent can reason around.

## Rules fix the questions, not the answers

The obvious objection is that all this turns people into a template. It does not. The rules fix the **questions** — what to ask before building, what counts as evidence, where a person decides, what done means — and leave the **answers** alone. Two engineers still work differently, and so does one engineer on two different days; they just answer the same questions, in the same order, against the same bar.

## The method works without the tool

You can apply the idea behind `wholeloop` without adopting it. Take one step of your own work, such as researching an idea, preparing a rollout or checking a result a month later, and write it down as precisely as if a machine had to run it: what it may decide on its own, what it must never assume and where it must stop for a person. Then review that description with whoever does the work, even if that is only you a week later.

A new colleague fills the gaps in such a description with common sense; a machine cannot, so writing for one exposes every assumption nobody had stated. **The agreement that review produces is the real result**: the questions everyone answers, the points where a person decides and a shared idea of done. `wholeloop` is that agreement, written once for the whole path from idea to measured result and made executable.

## How this philosophy has evolved

The earlier wording stays visible above where it changed, because the reasoning behind each step matters as much as where it led.

1. **From a team to a repository.** It began as an attempt to move one team's way of working into a repository, so the process would survive whoever happened to be driving. Writing it down showed that nothing in it needed a team: the same questions keep one person consistent with themselves.
2. **From an idea to a measured result, with people at fixed points.** The first complete flow covered the path from zero to one with human checks between the steps: approve the spec, test the change, ramp, decide. Those checks remain the default.
3. **From fixed points to delegated decisions.** Autonomous delivery added a second way to decide: authorize the work once, pin the rubrics that judge each decision and let independent machine judges apply them, inside budgets, with every judgement recorded. It ships experimental in 1.0.0.
4. **Where it is going.** The long-term goal is a harness configurable from fully supervised to a software factory that works around the clock without anyone at the keyboard. Each step toward it keeps the limits above: a person still decides what is authorized and what counts as done, and the machine still asks rather than guesses. The [roadmap](../roadmap/phase-8-software-factory.md) describes that path; none of it is a promise of current behaviour.

---

<!-- docnav -->
[◀ Docs index](README.md)  ·  [📖 Docs index](README.md)  ·  [🧭 Concepts](concepts.md)  ·  [Getting started ▶](getting-started.md)
