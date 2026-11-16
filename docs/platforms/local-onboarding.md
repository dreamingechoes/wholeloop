# Local client setup — choose your CLI

> **TL;DR** — Build once, choose a named target, inspect its dry run and install its owned components. Run doctor for that target, then restart the native client and verify discovery and permissions. File installation and native activation are separate observations.

> [!NOTE]
> **Status: ✅ implemented.** Installation for all seven clients, packaged resources and diagnostics are tested, and installation from npm takes seconds per tier-A client on a fresh Linux machine. Discovery, trust and sign-in are verified only as far as [V1 acceptance](../v1-acceptance.md) records.

## Before choosing a target

For the shortest complete route, start with [getting started](../getting-started.md), then [your first framing](../tutorials/first-framing.md). This page is the target-specific reference. Use [troubleshooting](../troubleshooting.md) for a missing executable/skill, ownership conflict or native permission failure.

Install the CLI first ([getting started](../getting-started.md#install-the-cli)) and check it:

```bash
wl --version
```

The examples below use user scope; project scope writes native components inside the current project, so run that variant from the intended disposable project. All runtime state/ownership/backups stay in the external store.

Run npm run check for the complete local suite, including offline package installation. The bundled CLI supports runtime Node 20 or newer; individual native clients have their own requirements. Installation does not install the native CLI, change general settings/MCP credentials or start a model.

| Client | Target | Native executable | Managed framing skill |
| --- | --- | --- | --- |
| [Claude Code](#claude-code) | claude | claude | wl-frame-problem |
| [Codex](#codex) | codex | codex | wl-frame-problem |
| [OpenCode](#opencode) | opencode | opencode | wl-frame-problem |
| [Copilot](#copilot) | copilot | copilot | wl-frame-problem |
| [Gemini](#gemini) | gemini | gemini | wl-frame-problem |
| [Antigravity](#antigravity) | antigravity | agy | wl-agy-frame-problem |
| [Cursor](#cursor) | cursor | agent | wl-frame-problem |

Choose the section for your client. Select the same explicit target in doctor; its version/file diagnostics are not proof of native activation or a model run. Edited/unowned output is preserved and refused. Inspect a reported conflict and its retained backups before choosing a fresh output/scope.

## Claude Code

```bash
wl install --target claude --scope user --dry-run
wl install --target claude --scope user
wl doctor --target claude
```

Managed loose components use wl-prefixed names under .claude, or the absolute CLAUDE_CONFIG_DIR override. Restart Claude and request the wl-frame-problem skill in the intended project. Inspect role discovery and the scoped guard transport; read-only/native permission behavior remains an actual-client check.

The [2026-10-22 manual observation](../../roadmap/manual-verification.md#manually-observed-claude-framing-and-session-recovery-2026-10-22) confirms interactive loose-skill framing, an on-hold closure and status recovery after restarting Claude. It also records unapproved narrative conditions and an unreviewed final revision; this is narrower than full native conformance.

Standalone generated plugins use the wholeloop namespace instead. For that delivery route, follow the [local marketplace preview](../contributing/releasing.md#review-a-local-delivery-preview) and explicitly register/install it in a disposable client configuration. The plugin invocation is /wholeloop:frame-problem; it is distinct from the loose wl-frame-problem entrypoint. Static plugin validation does not activate it.

## Codex

The [automatic native trial](../../roadmap/manual-verification.md#automatic-native-client-trials-2026-10-22) passed standalone framing on Codex 0.163.0. That structural result does not replace the permission/hook spike, other steps or a different client's acceptance.

```bash
wl install --target codex --scope user --dry-run
wl install --target codex --scope user
wl doctor --target codex
```

Skills use .agents/skills; native roles use CODEX_HOME/agents or .codex/agents. Restart Codex and select $wl-frame-problem in the intended project. A portable plugin is skills-only and does not establish native TOML agent loading. Native roles inherit parent permissions; do not infer read-only isolation from a role name. The checked headless recipe is a separate execution boundary.

Inspect the returned per-repository Git fallback command before activating it. General install does not rewrite shared Codex settings or its credential store. See [target layouts and boundaries](./README.md#installing).

## OpenCode

```bash
wl install --target opencode --scope user --dry-run
wl install --target opencode --scope user
wl doctor --target opencode
```

User components use the XDG opencode root or absolute OPENCODE_CONFIG_DIR. Project scope uses .opencode, including its dedicated wholeloop.js guard plugin. Restart OpenCode, request wl-frame-problem and verify skills/roles plus plugin activation. Existing unrelated native configuration is retained; actual permission and compatible-skill precedence remain manual checks.

Install selects V1/V2 from an isolated native version probe; even dry-run leaves the real home untouched. If the binary cannot report a version, legacy rendering is retained. Install the intended client first, or export an explicit dialect with adapter build-native --target opencode --pin 2.1.1 --out path --json. V2's hook obtains the current session directory and refuses missing context. An actual isolated user-scope 2.1.1 trial allowed a README read and denied a reserved runtime write. Project-scope activation/trust and other versions remain separate checks. Neither install nor doctor certifies native model/permission use.

The headless observer has its own deny-default permissions and fresh agent; it does not prove the interactive client's policy. See [additional tier-A artifacts](./README.md#additional-tier-a-targets).

## Copilot

```bash
wl install --target copilot --scope user --dry-run
wl install --target copilot --scope user
wl doctor --target copilot
```

User components use COPILOT_HOME or .copilot; project scope uses .github with native .agent.md roles and a dedicated hooks/wholeloop.json binding. Restart Copilot and request wl-frame-problem. Check native role/tool selection and actual hook activation instead of treating copied files as a native conformance pass.

MCP detection observes declarations only. Review rendered recipes and configure authentication through Copilot's own setup. The separate headless recipe limits workers to view/glob/grep; custom native startup policy still needs manual checks.

## Gemini

```bash
wl install --target gemini --scope user --dry-run
wl install --target gemini --scope user
wl doctor --target gemini
```

GEMINI_CLI_HOME overrides the home containing .gemini, rather than the .gemini folder itself. Managed overlays provide .gemini/skills and agents. Native preview agent enablement, trust and authentication are explicit client setup. Restart, request wl-frame-problem and verify discovery/inheritance. Questions fall back to exact plain-text options when structured questions are unavailable.

For the separate extension delivery route:

```bash
wl build --target gemini --out /tmp/wholeloop-gemini --json
```

Explicit native linking/installation activates that extension; merely writing it does not. Generated extensions bind their BeforeTool root through native environment data. Loose overlays use the returned Git fallback command. Actual model, permission and MCP checks remain open. The headless observer uses a private positive core-tool registry and refuses existing managed system settings; it preserves native trust/authentication. See [Gemini boundaries](./README.md#gemini-extension-and-native-overlays).

## Antigravity

```bash
wl install --target antigravity --scope user --dry-run
wl install --target antigravity --scope user
wl doctor --target antigravity
```

User scope uses .gemini/antigravity-cli/plugins/wholeloop. Native skills/agents use wl-agy- to coexist with Codex. Restart agy, request wl-agy-frame-problem and verify the native plugin, inherited roles and named hooks. Listing/version probes do not establish discovery, tool isolation or authentication.

Project scope uses .agents and requires hooks.json to be absent or already owned unchanged; personal policy is preserved and refused. Standalone output is available through build --target antigravity. The private headless observer recipe is implemented with initialization before assignment; actual client initialization/settings/permissions remain unverified. Sequential role handoff is also available. See [native boundaries](./README.md#antigravity-plugin-and-native-overlays).

## Cursor

```bash
wl install --target cursor --scope user --dry-run
wl install --target cursor --scope user
wl doctor --target cursor
```

Managed installation provides .cursor skills/agents, an opt-in rule and preToolUse hooks. Existing shared hooks.json is refused; unrelated rules remain untouched. Restart agent, request wl-frame-problem and verify inherited roles/readonly plus native hook activation. Pure hook validators and version probes are narrower evidence than a real model/permission check.

Optional standalone native plugin launch requires explicit root environment data:

```bash
wl build --target cursor --out /tmp/wholeloop-cursor --json
CURSOR_PLUGIN_ROOT=/tmp/wholeloop-cursor agent --plugin-dir /tmp/wholeloop-cursor
```

The second command starts the native client; arrange its own trust/auth/model setup. Managed overlays bind roots automatically. Missing root context denies; export does not install or publish a marketplace package. See [Cursor boundaries](./README.md#cursor-plugin-and-native-overlays).

## Verify a first step and retire the same installation

In the selected native client, ask it to use the exact framing skill from the table for a small idea. Confirm that missing input produces real questions, that completion records an owned initiative/artifact in the external store, and that the client stops for the next required decision. Follow the [manual checklist](../../roadmap/manual-verification.md) for actual permissions, MCP, hooks and model evidence; a filesystem receipt proves none of these.

The disposable framing runner supports every target. Prepare with the exact observed version before choosing fixture or live execution; see [standalone conformance](./README.md#standalone-conformance). Simulation remains FIXTURE_PASS. Live execution is an explicit authenticated model operation.

For removal, use the same named target, scope and external store used to install:

```bash
wl uninstall --target codex --scope user --dry-run
wl uninstall --target codex --scope user
```

Replace codex with your selected target. Existing edits are preserved; unchanged owned native files are removed while external history/backups remain. Separately activated Git hooks have their own returned uninstall command. Restart the native client to verify removal. Actual native discovery/permissions/models on Linux and other client versions remain separate verification; executed core tests are recorded in [the platform checks](../../roadmap/manual-verification.md#automated-platform-checks-2026-10-22).

<!-- docnav -->
[◀ Platforms](README.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Architecture ▶](../architecture/README.md)
