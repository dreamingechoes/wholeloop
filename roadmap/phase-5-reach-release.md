# Phase 5 — Reach & release

> **Outcome** — Tier B CLIs are supported, the headless engine makes parallel gates available everywhere, conformance runs every night against pinned CLI versions, and 1.0 is published with documentation generated from the code it describes.

---

## P5-01 · Adapters — Gemini CLI and Antigravity CLI

**Status:** ⏸️ · **Size:** L · **Depends on:** P1-11

**Goal** — Cover both of Google's CLIs.

**Deliverables** — two adapters (extension manifest for Gemini CLI; `.agents/` layout, `serverUrl` MCP dialect and own hook schema for Antigravity), plain-text question fallback where no ask tool exists, golden files, conformance scenario.

**Acceptance criteria:**

- [ ] The P1 conformance scenario passes on both CLIs (sequential or headless engine where needed).

**Local implementation:** Gemini extension generation, strict local-agent tools/model
inheritance, plain-text questions, owned user/project overlays, explicit doctor,
unapplied MCP recipes/declaration detection and the shared fresh framing runner
are implemented. Actual Gemini 0.27.0 static loaders accepted eight generated agents
and seventeen skills; installed-launcher simulation remains simulation. Use the
explicit Git fallback for loose overlays. Generated extensions now bind the root
through native hook.env, with exact core integrity checks; actual 0.27.0
loader/runner read/deny probes passed without model calls. Native enablement/permissions/model/MCP
checks remain owner verification. Antigravity now has a closed plugin manifest, wl-agy- native namespace, strict
inherited roles, owned user/project overlays, hash-pinned named hook transport,
serverUrl MCP recipes/detection, explicit agy doctor and JSONL framing recipe.
Installed-launcher simulation and authored native hook payloads exercise the real
core; actual native loading/permissions/model/MCP checks remain owner verification.
Local agy 1.4.2 listing could not bind a port under the execution sandbox. Both local adapters and hook transports are implemented; native model/permission/MCP
conformance remains owner verification and does not block Cursor work. See
ADR-0055 and ADR-0056.

**Docs** — platforms, getting-started, configuration/providers, ADR-0053.

## P5-02 · Adapter — Cursor CLI

**Status:** ⏸️ · **Size:** M · **Depends on:** P1-11

**Goal** — Cover Cursor's terminal agent.

**Deliverables** — adapter (`.cursor/` agents, rules and hooks; Agent Plugins manifest with `CURSOR_PLUGIN_ROOT`), golden files, conformance scenario.

**Acceptance criteria:**

- [ ] The P1 conformance scenario passes; read-only roles use `readonly`.

**Local implementation:** native/portable manifests, seventeen skills/eight inherited
roles with native readonly observers, opt-in rule, owned user/project overlays,
non-granting fail-closed hooks, MCP recipes/detection, explicit agent doctor and
fresh stdin framing are implemented. Shared hook slots refuse unowned policy;
standalone roots require explicit CURSOR_PLUGIN_ROOT environment data. Native
version/help and pure hook validators were checked, while installed-core simulations
remain FIXTURE_PASS. Actual client discovery/permissions/model/MCP and the live
scenario remain owner checks. See ADR-0057; these checks do not block P5-03.

**Docs** — platforms.

## P5-03 · Headless fan-out engine

**Status:** ⏸️ · **Size:** L · **Depends on:** P3-03

**Goal** — Parallel, isolated gate lenses on any CLI with a headless mode.

**Deliverables** — `wl fanout run --engine headless`, per-CLI headless invocation from adapters, non-interactive read-only permissions, concurrency limit, timeouts, result collection into `wl gate submit`.

**Acceptance criteria:**

- [ ] The same gate run gives the same verdict under native, headless and sequential engines (stubbed workflow test + one real conformance run).
- [x] A crashed worker is reported, never counted as a refutation.

**Local implementation:** bounded process transport, shell-free stdin prompts,
per-assignment sessions, timeout/output/concurrency limits, owned-group cancellation,
exact response validation, round locks and the existing gate aggregator are tested.
Native/headless/sequential synthetic verdict parity passes. Claude, Codex, OpenCode,
Copilot and Cursor recipes are help-probed and tested through synthetic PATH clients.
OpenCode uses a per-worker deny-default read-only agent and completed-message JSONL;
Copilot exposes only view/glob/grep with explicit read grants and silent text.
Cursor uses Ask/sandbox, private worker-local policy, an explicit read/search-only
hook and successful native final JSON; no personal/project settings are rewritten.
Gemini now uses a private positive core-tool registry with MCP/extensions/hooks,
experimental and built-in delegation disabled. Refuse existing managed settings,
retain original system defaults and native trust/auth/model choices, and decode
only successful native JSON. Actual 0.27.0 metadata/registry checks expose only four
read/search tools in an explicitly untrusted credential-free fixture. Synthetic
compiled transport passes; actual model conformance remains open. Antigravity now has a conditional private primary observer/read-only hook and
bounded JSONL startup readiness before assignment delivery. Only exact worker cwd,
read tools and strict permission modes proceed to one fresh matching successful
turn. Clients that need input before init remain unavailable; actual AGY 1.4.2
startup ordering/agent/hook/model conformance remain owner checks. All seven local
recipes are implemented with their stated conditions; sequential fallback remains
available without granting a readiness bypass.
Neither gap blocks independent local generator/guard implementation.

**Docs** — architecture/orchestration-and-gates, ADR-0006, ADR-0046, ADR-0058, ADR-0060, ADR-0071, ADR-0072.

## P5-04 · Nightly conformance and the generated matrix

**Status:** 🔄 · **Size:** M · **Depends on:** P1-14, P5-01, P5-02

**Goal** — Know the moment a CLI release breaks something.

**Deliverables** — scheduled CI job across all supported CLIs at pinned and latest versions, result artifact, generated capability matrix in `docs/platforms/README.md`.

**Acceptance criteria:**

- [ ] A regression on *latest* opens an issue naming the CLI version and the failing assertion.

**Local implementation:** a bounded read-only matrix renderer accepts versioned
pinned/latest observations, preserves unknown/simulation/live evidence and marks
results older than 48 hours stale. Comparable fresh native passes/failures produce
deterministic regression candidates naming actual versions and failing assertions.
Duplicate/relabelled runs, invalid reports and future observations are refused.
Explicit page comparison/regeneration now shares strict marker ownership with
code references, requires a fixed as-of time, preserves surrounding prose/dates
and projects no raw reports. Initial published documentation rows remain UNRUN.
An explicit collector now validates a whole exact-version batch before setup,
preflights separate native binary paths, creates fresh external fixtures and
continues after client crashes. It forwards deadlines/cancellation and emits
matrix-ready timestamps/structural reports without journal paths. Fixture mode
remains simulation; actual versions, native provisioning and trust/authentication
are host inputs. Structural issue drafts now share the same comparability filter and expose exact
versions/assertions, stable markers and original dates without private payloads.
A default-preview host inventories intact open/closed markers, refuses incomplete
scans, changed/old-core input or invalid CI context, rechecks freshness and sends
only on explicit activation. Partial outcomes remain visible without retries.
Scheduled activation and installers/version resolution remain code work; actual
CI/authenticated issue delivery remains owner verification.
No native acceptance is inferred from the matrix's synthetic tests.

**Docs** — platforms, ADR-0059, ADR-0064, ADR-0070, ADR-0073.

## P5-05 · Distribution

**Status:** ⏸️ · **Size:** M · **Depends on:** P1-13

**Goal** — One command to install, wherever you work.

**Deliverables** — npm release automation (conventional-commit changelog, provenance), Claude Code marketplace entry with bundled core, Agent Plugins root manifest, Gemini extension, optional compiled binaries in GitHub Releases. Switching the repository from private to public is part of this task and is the owner's explicit decision.

**Acceptance criteria:**

- [ ] The repository is made public only after the owner explicitly approves it.
- [ ] A fresh machine goes from nothing to `wl doctor` green in under five minutes for each tier-A CLI (documented run).
- [ ] Release notes contain no tool attribution.

**Local implementation:** release artifacts exports seven independently valid
native delivery trees and a relative local Claude marketplace from one exact
source/core/version. Root/child integrity manifests, read-only dry-run preflight,
complete ownership validation, idempotency and backup-preserving upgrades are tested.
Native Claude static marketplace validation passes without registration or models.
Local Conventional Commit release-note drafts now share commit subject parsing,
pin an explicit complete local range and omit bodies/trailers/attribution. Review
entries identify rejected commits without copying unsafe subjects; a semantic
version remains a label and changes no version/ref/tag/publication. Declared impact
does not establish compatibility. Actual public hosting, npm ownership/provenance,
optional binaries and publication remain separate owner decisions.
Offline npm archive verification now preflights the four-file allowlist, checks
actual tarball integrity and installs into an isolated prefix/HOME/config/cache.
Both linked aliases and embedded managed-file install/idempotency/removal execute
from the actual package. Source bytes, privacy/version and publication stay
unchanged. Native discovery/fresh-machine timing remain owner checks. The explicit
publication automation below covers hosted release assets and provenance requests.
Read-only release preflight now checks exact build/package/lock/source and supplied
CI metadata, refusing private/mismatched/dirty/masked input. Ready is consistency
only, not authenticated context or authorization. No source/ref/publication changes
or service call occurs. The actual current development package remains blocked.
Reviewed-bundle automation now prepares actual offline npm/native archives and exact
notes, binding all hashes/sizes to source/context. Manual dispatch defaults to
preparation only; explicit publication uses a protected release environment,
immutable artifact ID/independent manifest digest, no rebuild, OIDC/provenance and
non-overwriting tags. Synthetic publication ordering/failure tests are local only.
Actual public hosting, configured owner protection/npm ownership and real
OIDC/provenance/release remain owner checks; no publication has run.

**Docs** — getting-started, ADR-0015, ADR-0062, ADR-0063, ADR-0067, ADR-0068, ADR-0069.

## P5-06 · Generated references and docs pass

**Status:** ✅ · **Size:** M · **Depends on:** P5-04

**Goal** — Documentation that cannot drift from the code.

**Deliverables** — generated config reference, command reference, provider catalogue and capability matrix; every status banner reviewed; getting-started split per CLI where it helps.

**Acceptance criteria:**

- [x] `wl docs check` verifies generated pages are current.
- [x] No page says `📐 design` for behaviour that is released.

**Local implementation:** command/config/provider/adapter reference tables use the same
built-core renderers for generation and docs check. Strict marker ownership catches
missing/duplicate/reversed pairs, default mode is read-only, explicit writes preflight
the selected batch and preserve surrounding prose. Existing generator scripts delegate
to the core. The declared provider table does not claim authentication or actual
operation support. The overview/banner audit corrects the six remaining design-only pages and the FAQ
claim that no local implementation exists. Native interaction claims retain explicit
limits. Local adapter declarations now share the build/install registry, including
all seven targets, hook/read-only boundaries and current engines. Generated docs
retain unverified native conformance; no simulation is promoted to support. The
reported framing renderer has its own explicit external-input/time page comparison
and optional regeneration. A focused seven-client onboarding page now covers named
targets, source-built executable selection, scopes, native activation boundaries,
namespaces and first-step/removal checks. The quick start uses the selected absolute
core instead of assuming file installation creates a global alias. All local docs
deliverables/criteria are complete using P5-04's implemented renderer/projection;
scheduled collection/version resolution/issue automation remain P5-04 code work,
and native acceptance remains in the adapter/owner checklists. No unknown evidence
is promoted to native support. See ADR-0052, ADR-0061 and ADR-0064.

**Docs** — all.

## P5-07 · 1.0

**Status:** ⏸️ · **Size:** S · **Depends on:** P5-05, P5-06

**Goal** — A stable contract others can build extensions against.

**Deliverables** — schema versions frozen at 1 (config, manifests, step contract, journal events), deprecation policy, release.

**Acceptance criteria:**

- [x] Every schema has a version and a compatibility test.
- [ ] The 1.0 release is tagged and announced.

**Local implementation:** source/compiled command registration checks every declared
output. The v1 candidate records forty-one source schemas, 139 output variants,
thirteen step definitions, 148 command signatures and five exit codes. Individual
compatibility cases retain declaration identities, command options/signatures and
exit meanings; public adapter/distribution manifests validate before emission.
The compatibility/deprecation policy preserves existing 1.x contracts and requires
new identities/migrations for changed formats. Conservative fingerprints do not
prove runtime semantics or native support. Actual release/tag/announcement,
released README status and remaining delivery/native acceptance remain open;
package version/privacy are unchanged. Further collector, headless and distribution
code does not wait for owner checks and adds new identities to this candidate.

**Docs** — compatibility policy, ADR-0065, ADR-0066; released README status remains pending.

---

[◀ P4](./phase-4-rollout-learn.md)  ·  [Roadmap](./README.md)  ·  [📓 Journal](./journal.md)
