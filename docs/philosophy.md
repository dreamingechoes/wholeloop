# Philosophy — why the harness is the half that is yours

> **TL;DR** — An agent is a model plus a harness. The model is rented and identical for everyone; the harness is what makes the outcome depend on the *system* rather than on who happens to be driving. `wholeloop` is a harness built around one agreed path, from a loose idea to a measured result, that respects whatever your repository already knows.

> [!NOTE]
> **Status: 📐 design.** This page describes intent and is stable. The behaviour it motivates is tracked in the [roadmap](../roadmap/README.md).

---

## Same model, different results

Two engineers, one feature. Before starting, one looks at the data, the other opens the editor — they are solving different problems and nobody notices until review. While building, one argues with the model's first answer, the other accepts it; on screen both look equally finished, which is exactly what makes it dangerous. Every review asks different questions, every rollout re-decides the same four things, and after launch the learnings live in someone's notes or nowhere.

The model is identical in every one of those moments. The process around it is not. **A faster tool amplifies whatever process you already have — including the absence of one.**

## The half that is yours

| Half | What it is | Who has it |
|---|---|---|
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

A team's repository already encodes how it builds: skills for its backend, a design system, lint rules, a test command, a PR convention. A generic harness that ignores them produces generic code. Every step therefore **discovers and prefers** what the repository already has, and falls back to its own defaults only when nothing more specific exists ([ADR-0009](./decisions/0009-repo-first-capability-resolution.md)).

### 4. Bring your own tools

Confluence or Notion, Jira or Linear, Mixpanel or PostHog — the flow does not care. It needs *capabilities* (write a document, track a work item, query product analytics) and lets you choose who provides them. When the provider you need does not exist yet, adding it is a manifest, not a fork ([ADR-0008](./decisions/0008-extensibility-through-manifests.md)).

### 5. People decide at fixed points

The harness does not stop because it technically cannot go on. It stops because going on would produce a tidy answer to a question nobody has finished asking. Those stops are **hand-offs**, not controls: the point where processing information ends and product judgement starts — approving a spec, running the change on your own machine, deciding whether to kill something that shipped. That is where accountability lives, and it stays with a person.

### 6. Always legible

People rarely stop trusting a tool because of what it does; they stop when they cannot tell what it is doing. Every run states a **preflight** (what will happen, where, what it will never do, how to stop it), **narrates** one line per event, stops the instant you say so, and ends with a **receipt** of what it produced — actionable rows first, each with the command that opens or undoes it.

### 7. Done means measured, not merged

More than half of the flow sits after the merge: communications drafted, exposure ramped step by step, and weeks later the real numbers back on the table next to what the spec promised. The follow-up that used to depend on who remembered simply happens.

### 8. Small, correctable, alive

A harness is a snapshot of how a team works on the day it was written. It stays useful only while it keeps following the team:

- **The conversation leads, the harness follows.** Rules change in a retro or a thread, never in a commit nobody discussed.
- **Every repeated failure is a candidate rule** — once it has happened more than once. One case is an anecdote.
- **Changes to the checks get measured** against a corpus of known defects and harmless look-alikes. A fix that makes a reviewer cry wolf is not a fix.
- **Removing counts as much as adding.** A rule nobody can justify is a leftover.

That is also why skills are short and every hard rule has something that *executes* it ([ADR-0011](./decisions/0011-size-budgets-and-enforcement.md)): a rule that only exists as prose is decoration the agent can reason around.

## Rules fix the questions, not the answers

The obvious objection is that all this turns a team into a template. It does not. The rules fix the **questions** — what to ask before building, what counts as evidence, where a person decides, what done means — and leave the **answers** alone. Two engineers still work differently; they just answer the same questions, in the same order, against the same bar.

## What transfers

You do not need a harness this size to benefit from the exercise. Pick one step — researching an idea, preparing a rollout, checking impact a month later — and write it down as if a machine had to run it: what it may decide, what it must never assume, where it stops for a person. Then let the people who do that work attack it. A new colleague fills the gaps with common sense; a machine makes you fill them yourself. **The conversation is the deliverable.** `wholeloop` is what that conversation looks like once it is executable.

---

<!-- docnav -->
[◀ Docs index](README.md)  ·  [📖 Docs index](README.md)  ·  [🧭 Concepts](concepts.md)  ·  [Getting started ▶](getting-started.md)
