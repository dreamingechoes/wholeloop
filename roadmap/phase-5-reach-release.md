# Phase 5 — Reach & release

> **Outcome** — Tier B CLIs are supported, the headless engine makes parallel gates available everywhere, conformance runs every night against pinned CLI versions, and documentation is generated from the code it describes.

Expanded 1.0.0 also includes [Phase 6](./phase-6-autonomous-delivery.md) and [Phase 7](./phase-7-release-readiness.md). Distribution (P5-05) and the release (P5-07) moved to Phase 7 as P7-14 and P7-15 on 2026-11-07. Existing checked criteria and native failures in this phase retain their original scope.

---

## P5-01 · Adapters — Gemini CLI and Antigravity CLI

**Status:** ✅ · **Size:** L · **Depends on:** P1-11

**Goal** — Cover both of Google's CLIs.

**Deliverables** — two adapters (extension manifest for Gemini CLI; `.agents/` layout, `serverUrl` MCP dialect and own hook schema for Antigravity), plain-text question fallback where no ask tool exists, golden files, conformance scenario.

**Acceptance criteria:**

- [x] The P1 conformance scenario passes on both CLIs (sequential or headless engine where needed).

**Evidence** — The standalone framing scenario passes live on both CLIs, on macOS arm64 with Node 24.22.0, each with process and journal evidence:

- Antigravity 1.5.3 passed on 2026-11-08 (run cf-9ea0ac99ec4ae55e10cea088).
- Gemini 0.67.0 passed on 2026-11-14 with `gemini-3-flash-preview` (run cf-90485b95307b343c8b58c41e, source 486f566), through `GEMINI_MODEL=gemini-3-flash-preview npm run native:check -- gemini --live --probe framing`. Its receipt is retained outside the repository.

Both clients' read-only probes also pass. Narrowed: Linux and other client versions were not run, and the earlier Gemini attempt that ended on the free tier's daily quota stays recorded below.

**Progress (2026-11-11)** — The scenario passes live on Antigravity 1.5.3 (run cf-9ea0ac99ec4ae55e10cea088) and its read-only probe passes.

Gemini 0.67.0 is unpaused. Its read-only boundary now uses a disposable home, an admin-tier policy and session-only trust ([ADR-0071](../docs/decisions/0071-gemini-observer-registry-and-private-policy.md)). The read-only probe passes live.

The framing scenario reached `frame finalize` with the exact launcher and file grants honoured, then the API key's free-tier daily quota ended the run (exit 173). The criterion stays open until a Gemini run with quota passes.

**Local implementation:** Gemini extension generation, strict local-agent tools/model inheritance, plain-text questions, owned user/project overlays, explicit doctor, unapplied MCP recipes/declaration detection and the shared fresh framing runner are implemented. Actual Gemini 0.27.0 static loaders accepted eight generated agents and seventeen skills; installed-launcher simulation remains simulation. Use the explicit Git fallback for loose overlays. Generated extensions now bind the root through native hook.env, with exact core integrity checks; actual 0.27.0 loader/runner read/deny probes passed without model calls. Native enablement/permissions/model/MCP checks remain manual verification. Antigravity now has a closed plugin manifest, wl-agy- native namespace, strict inherited roles, owned user/project overlays, hash-pinned named hook transport, serverUrl MCP recipes/detection, explicit agy doctor and JSONL framing recipe. Installed-launcher simulation and authored native hook payloads exercise the real core; actual native loading/permissions/model/MCP checks remain manual verification. Local agy 1.4.2 listing could not bind a port under the execution sandbox. Both local adapters and hook transports are implemented; native model/permission/MCP conformance remains manual verification and does not block Cursor work. See ADR-0055 and ADR-0056.

**Docs** — platforms, getting-started, configuration/providers, ADR-0053.

## P5-02 · Adapter — Cursor CLI

**Status:** ✅ · **Size:** M · **Depends on:** P1-11

**Goal** — Cover Cursor's terminal agent.

**Deliverables** — adapter (`.cursor/` agents, rules and hooks; Agent Plugins manifest with `CURSOR_PLUGIN_ROOT`), golden files, conformance scenario.

**Acceptance criteria:**

- [x] The P1 conformance scenario passes; read-only roles use `readonly`.

**Evidence** — On 2026-11-08, macOS arm64, Node 24.22.0, the standalone framing scenario passes live on Cursor 2026.11.05-86047df with the free plan's `auto` model (run cf-45e0ec29f8536bf06a715170, process and journal evidence). Read-only roles render `readonly: true` (`test/unit/adapters/cursor.test.ts`, `test/unit/adapters/launcher-tools.test.ts`), and the live read-only probe of Cursor's headless observer saw it attempt `Write` and `Shell` and its policy refuse all three writes, leaving the workspace unchanged. Getting there needed workspace trust for directories wholeloop creates and a hook fix for Cursor 2026.11's empty Shell `cwd` ([ADR-0057](../docs/decisions/0057-cursor-native-formats-and-non-granting-hooks.md)). Narrowed: the generated readonly subagents were not exercised inside an interactive Cursor session, MCP and OAuth stay manual, and Linux was not run.

**Local implementation:** native/portable manifests, seventeen skills/eight inherited roles with native readonly observers, opt-in rule, owned user/project overlays, non-granting fail-closed hooks, MCP recipes/detection, explicit agent doctor and fresh stdin framing are implemented. Shared hook slots refuse unowned policy; standalone roots require explicit CURSOR_PLUGIN_ROOT environment data. Native version/help and pure hook validators were checked, while installed-core simulations remain FIXTURE_PASS. Actual client discovery/permissions/model/MCP and the live scenario remain manual checks. See ADR-0057; these checks do not block P5-03.

**Docs** — platforms.

## P5-03 · Headless fan-out engine

**Status:** ✅ · **Size:** L · **Depends on:** P3-03

**Goal** — Parallel, isolated gate lenses on any CLI with a headless mode.

**Deliverables** — `wl fanout run --engine headless`, per-CLI headless invocation from adapters, non-interactive read-only permissions, concurrency limit, timeouts, result collection into `wl gate submit`.

**Acceptance criteria:**

- [x] The same gate run gives the same verdict under native, headless and sequential engines (stubbed workflow test + one real conformance run).
- [x] A crashed worker is reported, never counted as a refutation.

**Local implementation:** bounded process transport, shell-free stdin prompts, per-assignment sessions, timeout/output/concurrency limits, owned-group cancellation, exact response validation, round locks and the existing gate aggregator are tested. Native/headless/sequential synthetic verdict parity passes. Claude, Codex, OpenCode, Copilot and Cursor recipes are help-probed and tested through synthetic PATH clients. Codex now receives a native per-assignment output schema through --output-schema; exact envelope identity stays mandatory in the core. Actual Codex 0.163.0 on core 9ea3a298 passes the compiled CLI six-lens review gate-35be1f516f42cb8c with all workers successful, no missing coverage and an unchanged repository. Together with the native/sequential/headless stubbed verdict/quorum comparison, this meets the task's one-real-run criterion. Preserve two earlier rounds with five unbound JSON replies and one accepted reply each (ADR-0091). This does not certify every client, real refutation quality or adversarial isolation; those checks remain in the platform/manual backlog. OpenCode selects V1/V2 from the observed native version. V2 uses an isolated global native config, path-checked reader only and final ended text after clean exit; V1 retains its per-worker permissions and completed-step JSONL. Actual V2 loads the inspector and returns a no-tool response; its own full gate remains unverified. Copilot exposes only view/glob/grep with explicit read grants and silent text. Cursor uses Ask/sandbox, private worker-local policy, an explicit read/search-only hook and successful native final JSON; no personal/project settings are rewritten. Gemini now uses a private positive core-tool registry with MCP/extensions/hooks, experimental and built-in delegation disabled. Refuse existing managed settings, retain original system defaults and native trust/auth/model choices, and decode only successful native JSON. Actual 0.27.0 metadata/registry checks expose only four read/search tools in an explicitly untrusted credential-free fixture. Synthetic compiled transport passes; actual model conformance remains open. Antigravity now has a conditional private primary observer/read-only hook and bounded JSONL startup readiness before assignment delivery. Only exact worker cwd, read tools and strict permission modes proceed to one fresh matching successful turn. Clients that need input before init remain unavailable; actual AGY 1.4.2 startup ordering/agent/hook/model conformance remain manual checks. All seven local recipes are implemented with their stated conditions; sequential fallback remains available without granting a readiness bypass. The local engine task is complete at its stated acceptance scope; wider native platform and workflow checks do not become passed checks from this one run.

**Docs** — architecture/orchestration-and-gates, ADR-0006, ADR-0046, ADR-0058, ADR-0060, ADR-0071, ADR-0072.

## P5-04 · Nightly conformance and the generated matrix

**Status:** ⏸️ · **Size:** M · **Depends on:** P1-14, P5-01, P5-02 · **Release:** after 1.0.0

**Moved after 1.0.0** on 2026-11-15, by the maintainer's decision. Its criterion can only be met when a real regression appears on a client's latest version, so it cannot close on a schedule. The standalone scenario it automates passed live on all seven clients before 1.0.0 (P1-14, P5-01, P5-02). The workflow stays disabled until the maintainer adds client credentials.

**Goal** — Know the moment a CLI release breaks something.

**Deliverables** — scheduled CI job across all supported CLIs at pinned and latest versions, result artifact, generated capability matrix in `docs/platforms/README.md`.

**Acceptance criteria:**

- [ ] A regression on *latest* opens an issue naming the CLI version and the failing assertion.

**Local implementation:** a bounded read-only matrix renderer accepts versioned pinned/latest observations, preserves unknown/simulation/live evidence and marks results older than 48 hours stale. Comparable fresh native passes/failures produce deterministic regression candidates naming actual versions and failing assertions. Duplicate/relabelled runs, invalid reports and future observations are refused. Explicit page comparison/regeneration now shares strict marker ownership with code references, requires a fixed as-of time, preserves surrounding prose/dates and projects no raw reports. Initial published documentation rows remain UNRUN. An explicit collector now validates a whole exact-version batch before setup, preflights separate native binary paths, creates fresh external fixtures and continues after client crashes. It forwards deadlines/cancellation and emits matrix-ready timestamps/structural reports without journal paths. Fixture mode remains simulation; actual versions, native provisioning and trust/authentication are host inputs. Structural issue drafts now share the same comparability filter and expose exact versions/assertions, stable markers and original dates without private payloads. A default-preview host inventories intact open/closed markers, refuses incomplete scans, changed/old-core input or invalid CI context, rechecks freshness and sends only on explicit activation. Partial outcomes remain visible without retries. Public exact-version resolution and explicit private-prefix provisioning now cover all seven clients/channels. Closed vendor paths/checksums, whole-batch planning, credential-free installation, archive preflight and retained partial receipts are implemented. Cursor has no independently supplied expected digest; top-level pins do not freeze vendor postinstall/transitive downloads or auto-updates. A disabled schedule/manual workflow now checks one exact core, provisions selected client pairs and observes fresh channel homes with only selected native keys. Separate credential-free aggregation produces the matrix, drafts and an external owned-page artifact; a separately activated serialized issue job verifies exact transferred results before service access. Missing credentials remain UNRUN; no source page/ref is automatically committed or pushed. Local code deliverables are implemented; park P5-04 pending actual native installs/settings/models/Actions and authenticated issue-delivery acceptance. No native acceptance is inferred from the matrix's synthetic tests.

**Docs** — platforms, ADR-0059, ADR-0064, ADR-0070, ADR-0073, ADR-0074, ADR-0075.

## P5-05 · Distribution

**Moved** — Now [P7-14 · Public repository and 1.0.0 release candidate](./phase-7-release-readiness.md#p7-14--public-repository-and-100-release-candidate) (2026-11-07), with its history and local implementation unchanged.

## P5-06 · Generated references and docs pass

**Status:** ✅ · **Size:** M · **Depends on:** P5-04

**Goal** — Documentation that cannot drift from the code.

**Deliverables** — generated config reference, command reference, provider catalogue and capability matrix; every status banner reviewed; getting-started split per CLI where it helps.

**Acceptance criteria:**

- [x] `wl docs check` verifies generated pages are current.
- [x] No page says `📐 design` for behaviour that is released.

**Local implementation:** command/config/provider/adapter reference tables use the same built-core renderers for generation and docs check. Strict marker ownership catches missing/duplicate/reversed pairs, default mode is read-only, explicit writes preflight the selected batch and preserve surrounding prose. Existing generator scripts delegate to the core. The declared provider table does not claim authentication or actual operation support. The overview/banner audit corrects the six remaining design-only pages and the FAQ claim that no local implementation exists. Native interaction claims retain explicit limits. Local adapter declarations now share the build/install registry, including all seven targets, hook/read-only boundaries and current engines. Generated docs retain unverified native conformance; no simulation is promoted to support. The reported framing renderer has its own explicit external-input/time page comparison and optional regeneration. A focused seven-client onboarding page now covers named targets, source-built executable selection, scopes, native activation boundaries, namespaces and first-step/removal checks. The quick start uses the selected absolute core instead of assuming file installation creates a global alias. All local docs deliverables/criteria are complete using P5-04's implemented renderer/projection; disabled scheduled collection/version resolution/issue automation are implemented, and native acceptance remains in the adapter/manual checklists. No unknown evidence is promoted to native support. See ADR-0052, ADR-0061 and ADR-0064.

**Docs** — all.

## P5-07 · 1.0

**Moved** — Now [P7-15 · 1.0.0](./phase-7-release-readiness.md#p7-15--100) (2026-11-07), with its checked criterion and local implementation unchanged.

---

[◀ P4](./phase-4-rollout-learn.md)  ·  [Roadmap](./README.md)  ·  [P6 ▶](./phase-6-autonomous-delivery.md)  ·  [📓 Journal](./journal.md)
