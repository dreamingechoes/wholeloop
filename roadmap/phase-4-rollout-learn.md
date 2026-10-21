# Phase 4 — Rollout & Learn

> **Outcome** — The loop closes. A merged scope gets its launch kit, a staged ramp with evidence at every stage, real numbers at each checkpoint compared to what the spec promised, and a recorded decision that feeds the next idea.

---

## P4-01 · `prepare-launch` and the `launcher`

**Status:** ⏸️ · **Size:** L · **Depends on:** P3-07

**Goal** — Everything a launch needs, drafted and ready, nothing sent.

**Deliverables** — rollout plan, comms drafts (`comms.draft` only), dashboards from the pinned measurement plan (`dashboards.create`), enablement docs (support guide, one-pager, runbook) via `docs`, voice from `comms.voice`, templates from `launch.templates`, hand-off artifacts when a provider is missing.

**Acceptance criteria:**

- [ ] The `launcher` has no tool able to send a message (adapter test per CLI).
- [x] Each dashboard links back to the measurement-plan entry it implements.

**Local implementation:** complete and fixture-tested. The core pins measurement
revisions, loads repository voice/templates, stores complete kits and dispatches
only explicit draft/create requests through a separate conductor host boundary.
Per-CLI adapter denial tests remain pending with P1 adapters/conformance; canonical
read-only metadata and synthetic hosts are not substitutes. This manual/client
criterion does not block dependent local rollout implementation.

**Docs** — flow/rollout/prepare-launch.

## P4-02 · `ramp-exposure`

**Status:** ✅ · **Size:** M · **Depends on:** P4-01

**Goal** — Exposure grows only on evidence and only by a person's hand.

**Deliverables** — stage plan (default 0 → internal → 10 → 50 → 100, configurable), exit criteria per stage (`ramp.criteria`), evidence from `source.errors` / `source.observability` / key metrics, `flags.read-state` + `flags.propose-change`, **ramp** decision at every stage, re-entrant across sessions.

**Acceptance criteria:**

- [x] A source that cannot be read reports *unknown*, never *pass* (test).
- [x] The decision is recorded per stage with who, when and the evidence shown.

**Docs** — flow/rollout/ramp-exposure.

## P4-03 · `measure-impact` and the `analyst`

**Status:** ✅ · **Size:** L · **Depends on:** P2-07

**Goal** — Real numbers against the promise, reproducibly.

**Deliverables** — checkpoints from `learn.checkpoints` (default launch · D+7 · D+30), execution of the stored queries, verdict per metric vs target, qualitative signal section, digest mode across scopes (draft + comment on doc or tracker item), report format from `learn.report`.

**Acceptance criteria:**

- [x] Every number in the report links to the query and source it came from.
- [x] A missing datapoint is reported as unknown with the reason (test with a stub provider).

**Docs** — flow/learn/measure-impact.

## P4-04 · `decide-next`

**Status:** ✅ · **Size:** M · **Depends on:** P4-03

**Goal** — Every scope ends with an explicit, recorded decision.

**Deliverables** — **decide** decision point (keep · iterate · kill · unflag), challenger arguing the other side per profile, written reason required, follow-up proposals (flag removal, iteration idea), scope and initiative closure, feedback into `frame-problem`.

**Acceptance criteria:**

- [x] An initiative closes only when every scope is decided.
- [x] *Iterate* creates or reopens a framed idea linked to the evidence.

**Docs** — flow/learn/decide-next.

## P4-05 · Rollout providers

**Status:** 🔄 · **Size:** L · **Depends on:** P1-08

**Goal** — The launch and ramp steps work with the tools teams actually use.

**Deliverables** — manifests and fixtures for: Slack · Microsoft Teams · email (comms, draft only); LaunchDarkly · Unleash · GrowthBook · PostHog · config-file flags (flags, read + propose); PostHog · Mixpanel · Amplitude · Metabase · Grafana (dashboards); Datadog · Grafana stack (observability); Figma (design).

**Acceptance criteria:**

- [x] No manifest can map a send or toggle verb (validated).
- [x] Each provider passes `wl provider test` with fixtures.

**Local implementation:** offline fixtures cover every declared operation of all
fourteen targets; native unsent drafts, unapplied proposals, config-file reads and
metric-linked dashboard handoffs are implemented. Known sending/toggle routes are
rejected. Fixtures do not establish opaque server semantics. The first explicit LaunchDarkly REST host now reads only complete unrestricted
boolean user/key configuration through bounded credential-store transport and
the existing ramp normalizer. A default-preview CLI performs no I/O until --live;
complex targeting remains unknown. Actual native/service acceptance is unverified.
The Unleash Admin reader now binds full feature/project/environment state and
explicit variants, rejecting dependencies/unions/targeting while supporting one
unrestricted default or ordinary default-stickiness rollout. GrowthBook now reads
published per-environment boolean/default/force/id-rollout state, ignores drafts,
checks supplied compiled definitions and labels hash-dependent cohorts explicitly.
Decimal percentages preserve exact forward/reverse configured values. The PostHog reader now performs complete exact-key lookup then detail GET with
explicit owner-configured project/environment scope and conservative person-cohort
normalization. Grafana now has an explicit create-only PromQL host with exact artifact/datasource/
folder binding, default-preview CLI and once-intent POST/readback. Remaining
Mixpanel/Amplitude dashboard bridges remain code work; Metabase now creates
one dashboard-owned native SQL question with exact classic-query/attachment
readback and explicit unverified owner-reviewed time scope; PostHog now has
explicit project/timezone preconditions, dashboard/insight creation, exact attachment
readback and retained pending references for known partial outcomes;
local dashboard output is explicitly pending. Keep P4-05 partial and continue
independent local sync/grounding work. See the manual checklist, ADR-0042, ADR-0076, ADR-0077, ADR-0078 ADR-0079, ADR-0080, ADR-0081 and ADR-0082.

**Docs** — configuration/providers.

## P4-06 · `sync`

**Status:** ✅ · **Size:** M · **Depends on:** P3-07

**Goal** — Reality, the store and the team's tracker agree.

**Deliverables** — merged PRs close their slices, tracker items transition, scopes reach done only when every slice is closed, merged worktrees pruned, idempotent and safe on a schedule.

**Acceptance criteria:**

- [x] Running `sync` twice in a row changes nothing the second time (test).
- [x] No item is closed whose PR is not merged.

**Local delivery semantics:** scope delivery-ready requires every slice certified
merged/closed; the scope stays open for its final human learning decision. Tracker
transitions use explicit SDK targets/hosts and observed final state; unbound
references remain handoffs. Cleanup retains active/dirty/not-locally-merged work.
Real server, scheduling and cross-platform checks remain on the manual checklist.

**Docs** — flow/utilities (`sync`).

## P4-07 · Grounding eval corpus

**Status:** ✅ · **Size:** M · **Depends on:** P4-03

**Goal** — Prove the data steps do not invent numbers.

**Deliverables** — sandboxed datasets with deliberately absent metrics, a grounding judge, report per step.

**Acceptance criteria:**

- [x] Every asserted number traces to a datapoint; every trap metric is reported as unknown.

**Docs** — architecture/determinism-and-testing.

---

[◀ P3](./phase-3-build.md)  ·  [Roadmap](./README.md)  ·  [P5 ▶](./phase-5-reach-release.md)
