# Phase 2 — Define

> **Outcome** — A loose idea becomes an approved spec with a measurement plan and an approved set of scopes, backed by real research, published to the team's own tools — on every tier-A CLI.

---

## P2-01 · `research`

**Status:** ✅ · **Size:** L · **Depends on:** P1-12

**Goal** — Evidence-first answers to hard questions, with nothing invented.

**Deliverables** — `research` skill, `researcher` and `challenger` agents, angle-planning schema, native fan-out, cross-examination with the refutation quorum, brief template and shape check.

**Acceptance criteria:**

- [x] Angles offered are exactly the configured or detected `source.*` providers.
- [x] An unreachable source becomes an open question in the brief (test with a failing provider stub).
- [x] A claim is dropped only with the configured number of refutations (workflow test with stubbed agents).

**Docs** — flow/define/research.

## P2-02 · `frame-problem`, complete

**Status:** ✅ · **Size:** M · **Depends on:** P2-01

**Goal** — Every framing ends in a spec or an argued no-go.

**Deliverables** — calls `research` when too hard to frame, `--from brief-xxxx`, `--no-go` (dropped / on hold with reopening condition), challenge-dial behaviour, publishing via `docs` and `tracker`.

**Acceptance criteria:**

- [x] Unknowns appear as `TBD` with what is missing and who could answer — never as invented values (shape check).
- [x] Running it twice on the same idea adopts the existing initiative instead of duplicating it.

**Technical remediation:** final decision rendering and digest-bound owner/challenger review are implemented under ADR-0086; eighteen focused regressions and the full local check pass. Native decision-fidelity acceptance remains separate.

**Docs** — flow/define/frame-problem.

## P2-03 · `write-spec`

**Status:** ✅ · **Size:** L · **Depends on:** P2-02

**Goal** — A spec a builder and an analyst can both execute.

**Deliverables** — spec template (overridable), stories with testable criteria, metrics, rollout outline, measurement plan (provider, baseline, target, window, stored query), technical appendix, the **approve** decision point.

**Acceptance criteria:**

- [x] Shape check fails on: a metric without source or window, a story without criteria, vague-word criteria from the lexicon.
- [x] A repo skill bound to `spec.template` is followed instead of the built-in template.

**Docs** — flow/define/write-spec.

## P2-04 · `cut-scopes`

**Status:** ✅ · **Size:** M · **Depends on:** P2-03

**Goal** — Deliverables that can ship and be measured independently.

**Deliverables** — scope creation (default one), apportioned metrics, delivery mode, flag name via `flags.naming`, simple/complex call, tracker mirroring, the **approve scopes** decision point.

**Acceptance criteria:**

- [x] Every metric of the spec is owned by at least one scope (shape check).
- [x] Scopes are mirrored as tracker items with links recorded in the store.

**Docs** — flow/define/cut-scopes.

## P2-05 · Challenger modes and definition checks

**Status:** ✅ · **Size:** M · **Depends on:** P2-03

**Goal** — Defects in definitions are caught before they become code.

**Deliverables** — `challenger` modes (problem · spec · criteria · scopes), deterministic criteria lint (contradictory pairs that can be detected structurally, untestable wording), challenge-dial mapping.

**Acceptance criteria:**

- [x] Deterministic checks have unit tests over good and bad fixtures.
- [x] The dial changes tone and number of counter-questions only (snapshot of rendered instructions).

**Docs** — architecture/orchestration-and-gates (agents).

## P2-06 · Destination providers

**Status:** ✅ · **Size:** L · **Depends on:** P1-08

**Goal** — Specs, briefs and scopes land where teams already work.

**Deliverables** — built-in manifests and fixture tests for: GitHub Issues · GitLab Issues · Jira · Linear (tracker); Confluence · Notion · Google Docs · repo `docs/` (docs). Read-modify-write enforced for `docs.update`.

**Acceptance criteria:**

- [x] Each provider passes offline contract tests with explicitly synthetic response fixtures; remote destinations are labelled experimental, fixture-tested and service-unverified.
- [x] `docs.update` never writes a body that was not fetched first in the same operation (test).

**Local implementation:** complete and fixture-tested. All eight providers pass `wl provider test`; synthetic host-boundary transcripts are checked in. ADR-0084 is accepted: authenticated per-vendor certification is a deferred follow-up, not a 1.0 prerequisite. Remote destinations remain experimental and service-unverified. The manual backlog preserves actual account/permission/readback checks unchecked; local fixture acceptance never represents those checks as passed.

**Docs** — configuration/providers (catalogue status).

## P2-07 · Source providers

**Status:** ✅ · **Size:** L · **Depends on:** P1-08

**Goal** — Research and measurement have real data to work with.

**Deliverables** — manifests, guidance and fixtures for: PostHog · Mixpanel · Amplitude · Metabase · BigQuery · PostgreSQL (read-only) · Sentry · Zendesk · Intercom · Confluence/Notion as `source.knowledge`.

**Acceptance criteria:**

- [x] Every guidance file is within its budget and specific to its tool.
- [x] Each provider declares `degrade: open-question`.

**Docs** — configuration/providers.

## P2-08 · Adopt from a URL, publish as you go

**Status:** ✅ · **Size:** M · **Depends on:** P2-06

**Goal** — Anyone can pick up shared work; shared mode keeps tools in step.

**Deliverables** — `next <URL>` adopts existing documents and items (matching by stored links, never duplicating), per-initiative work mode (local or shared), publish-on-complete for Define steps.

**Acceptance criteria:**

- [x] Adopting the same URL twice yields one initiative.
- [x] Switching an initiative to shared publishes what exists and records the links.

**Docs** — flow/utilities (`next`), architecture/state-and-messaging.

## P2-09 · Definition eval corpus

**Status:** ✅ · **Size:** M · **Depends on:** P2-05

**Goal** — Measure whether the challengers catch real defects without crying wolf.

**Deliverables** — labelled corpus of defective and look-alike definitions, eval runner, recall and false-alarm report per defect class.

**Acceptance criteria:**

- [x] The report runs on demand and is reproducible from a fixed seed set.
- [x] Baseline numbers are recorded in the journal.

**Docs** — architecture/determinism-and-testing.

---

[◀ P1](./phase-1-walking-skeleton.md)  ·  [Roadmap](./README.md)  ·  [P3 ▶](./phase-3-build.md)
