# Local client setup — choose your CLI

> **TL;DR** — Build once, choose a named target, inspect its dry run and install its owned components. Run doctor for that target, then restart the native client and verify discovery and permissions. File installation and native activation are separate observations.

> [!NOTE]
> **Status: 🚧 partial.** The seven source-built installation paths, packaged resources and diagnostics are implemented and tested locally. Native trust, skill/agent discovery, permissions, authentication and model sessions remain owner verification. Published npm/remote-marketplace delivery remains pending.

## Before choosing a target

From the wholeloop checkout, with development Node 22 or newer:

```bash
npm ci
npm run build
export WHOLELOOP_CLI="$PWD/dist/wl.mjs"
node "$WHOLELOOP_CLI" --version
```

Keep this absolute executable path when changing into the project you want to
work on. The examples below use user scope; project scope writes native components
inside the current project, so run that variant from the intended disposable
project. All runtime state/ownership/backups stay in the external store.

Run npm run check for the complete local suite, including offline package
installation. The bundled CLI supports runtime Node 20 or newer; individual native
clients have their own requirements. Installation does not install the native CLI,
change general settings/MCP credentials or start a model.

| Client | Target | Native executable | Managed framing skill |
| --- | --- | --- | --- |
| [Claude Code](#claude-code) | claude | claude | wl-frame-problem |
| [Codex](#codex) | codex | codex | wl-frame-problem |
| [OpenCode](#opencode) | opencode | opencode | wl-frame-problem |
| [Copilot](#copilot) | copilot | copilot | wl-frame-problem |
| [Gemini](#gemini) | gemini | gemini | wl-frame-problem |
| [Antigravity](#antigravity) | antigravity | agy | wl-agy-frame-problem |
| [Cursor](#cursor) | cursor | agent | wl-frame-problem |

Choose the section for your client. Select the same explicit target in doctor;
its version/file diagnostics are not proof of native activation or a model run.
Edited/unowned output is preserved and refused. Inspect a reported conflict and
its retained backups before choosing a fresh output/scope.

## Claude Code

```bash
node "$WHOLELOOP_CLI" install --target claude --scope user --dry-run --json
node "$WHOLELOOP_CLI" install --target claude --scope user --json
node "$WHOLELOOP_CLI" doctor --target claude --json
```

Managed loose components use wl-prefixed names under .claude, or the absolute
CLAUDE_CONFIG_DIR override. Restart Claude and request the wl-frame-problem skill
in the intended project. Inspect role discovery and the scoped guard transport;
read-only/native permission behavior remains an actual-client check.

Standalone generated plugins use the wholeloop namespace instead. For that
delivery route, follow the [local marketplace preview](../contributing/releasing.md#review-a-local-delivery-preview)
and explicitly register/install it in a disposable client configuration. The
plugin invocation is /wholeloop:frame-problem; it is distinct from the loose
wl-frame-problem entrypoint. Static plugin validation does not activate it.

## Codex

```bash
node "$WHOLELOOP_CLI" install --target codex --scope user --dry-run --json
node "$WHOLELOOP_CLI" install --target codex --scope user --json
node "$WHOLELOOP_CLI" doctor --target codex --json
```

Skills use .agents/skills; native roles use CODEX_HOME/agents or .codex/agents.
Restart Codex and select $wl-frame-problem in the intended project. A portable
plugin is skills-only and does not establish native TOML agent loading. Native
roles inherit parent permissions; do not infer read-only isolation from a role
name. The checked headless recipe is a separate execution boundary.

Inspect the returned per-repository Git fallback command before activating it.
General install does not rewrite shared Codex settings or its credential store.
See [target layouts and boundaries](./README.md#installing).

## OpenCode

```bash
node "$WHOLELOOP_CLI" install --target opencode --scope user --dry-run --json
node "$WHOLELOOP_CLI" install --target opencode --scope user --json
node "$WHOLELOOP_CLI" doctor --target opencode --json
```

User components use the XDG opencode root or absolute OPENCODE_CONFIG_DIR.
Project scope uses .opencode, including its dedicated wholeloop.js guard plugin.
Restart OpenCode, request wl-frame-problem and verify skills/roles plus plugin
activation. Existing unrelated native configuration is retained; actual permission
and compatible-skill precedence remain owner checks.

The headless observer has its own deny-default permissions and fresh agent; it
does not prove the interactive client's policy. See
[additional tier-A artifacts](./README.md#additional-tier-a-targets).

## Copilot

```bash
node "$WHOLELOOP_CLI" install --target copilot --scope user --dry-run --json
node "$WHOLELOOP_CLI" install --target copilot --scope user --json
node "$WHOLELOOP_CLI" doctor --target copilot --json
```

User components use COPILOT_HOME or .copilot; project scope uses .github with
native .agent.md roles and a dedicated hooks/wholeloop.json binding. Restart
Copilot and request wl-frame-problem. Check native role/tool selection and actual
hook activation instead of treating copied files as a native conformance pass.

MCP detection observes declarations only. Review rendered recipes and configure
authentication through Copilot's own setup. The separate headless recipe limits
workers to view/glob/grep; custom native startup policy still needs owner checks.

## Gemini

```bash
node "$WHOLELOOP_CLI" install --target gemini --scope user --dry-run --json
node "$WHOLELOOP_CLI" install --target gemini --scope user --json
node "$WHOLELOOP_CLI" doctor --target gemini --json
```

GEMINI_CLI_HOME overrides the home containing .gemini, rather than the .gemini
folder itself. Managed overlays provide .gemini/skills and agents. Native preview
agent enablement, trust and authentication are explicit client setup. Restart,
request wl-frame-problem and verify discovery/inheritance. Questions fall back
to exact plain-text options when structured questions are unavailable.

For the separate extension delivery route:

```bash
node "$WHOLELOOP_CLI" build --target gemini --out /tmp/wholeloop-gemini --json
```

Explicit native linking/installation activates that extension; merely writing it
does not. Generated extensions bind their BeforeTool root through native
environment data. Loose overlays use the returned Git fallback command.
Actual model, permission and MCP checks remain open. The headless observer uses a
private positive core-tool registry and refuses existing managed system settings;
it preserves native trust/authentication. See
[Gemini boundaries](./README.md#gemini-extension-and-native-overlays).

## Antigravity

```bash
node "$WHOLELOOP_CLI" install --target antigravity --scope user --dry-run --json
node "$WHOLELOOP_CLI" install --target antigravity --scope user --json
node "$WHOLELOOP_CLI" doctor --target antigravity --json
```

User scope uses .gemini/antigravity-cli/plugins/wholeloop. Native skills/agents use
wl-agy- to coexist with Codex. Restart agy, request wl-agy-frame-problem and verify
the native plugin, inherited roles and named hooks. Listing/version probes do not
establish discovery, tool isolation or authentication.

Project scope uses .agents and requires hooks.json to be absent or already owned
unchanged; personal policy is preserved and refused. Standalone output is available
through build --target antigravity. The headless observer recipe remains separate
code work; sequential role handoff is available. See
[native boundaries](./README.md#antigravity-plugin-and-native-overlays).

## Cursor

```bash
node "$WHOLELOOP_CLI" install --target cursor --scope user --dry-run --json
node "$WHOLELOOP_CLI" install --target cursor --scope user --json
node "$WHOLELOOP_CLI" doctor --target cursor --json
```

Managed installation provides .cursor skills/agents, an opt-in rule and preToolUse
hooks. Existing shared hooks.json is refused; unrelated rules remain untouched.
Restart agent, request wl-frame-problem and verify inherited roles/readonly plus
native hook activation. Pure hook validators and version probes are narrower
evidence than a real model/permission check.

Optional standalone native plugin launch requires explicit root environment data:

```bash
node "$WHOLELOOP_CLI" build --target cursor --out /tmp/wholeloop-cursor --json
CURSOR_PLUGIN_ROOT=/tmp/wholeloop-cursor agent --plugin-dir /tmp/wholeloop-cursor
```

The second command starts the native client; arrange its own trust/auth/model
setup. Managed overlays bind roots automatically. Missing root context denies;
export does not install or publish a marketplace package. See
[Cursor boundaries](./README.md#cursor-plugin-and-native-overlays).

## Verify a first step and retire the same installation

In the selected native client, ask it to use the exact framing skill from the
table for a small idea. Confirm that missing input produces real questions, that
completion records an owned initiative/artifact in the external store, and that
the client stops for the next required decision. Follow the
[owner checklist](../../roadmap/manual-verification.md) for actual permissions,
MCP, hooks and model evidence; a filesystem receipt proves none of these.

The disposable framing runner supports every target. Prepare with the exact
observed version before choosing fixture or live execution; see
[standalone conformance](./README.md#standalone-conformance). Simulation remains
FIXTURE_PASS. Live execution is an explicit authenticated model operation.

For removal, use the same named target, scope and external store used to install:

```bash
node "$WHOLELOOP_CLI" uninstall --target codex --scope user --dry-run --json
node "$WHOLELOOP_CLI" uninstall --target codex --scope user --json
```

Replace codex with your selected target. Existing edits are preserved; unchanged
owned native files are removed while external history/backups remain. Separately
activated Git hooks have their own returned uninstall command. Restart the native
client to verify removal. Linux/other supported Node/client versions remain
explicit owner verification.

<!-- docnav -->
[◀ Platforms](README.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Architecture ▶](../architecture/README.md)
