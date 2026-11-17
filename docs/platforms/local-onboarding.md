# Local client setup — choose your CLI

> **TL;DR** — Pick your client's install target, preview the install, install it and run doctor for that target. Then restart the client and check that it finds the skills and asks for the right permissions. Writing the files and the client actually loading them are two separate things, and this page shows how to check each one for every client.

Installing from npm takes a few seconds per client. How far each client's discovery, trust and sign-in were verified is recorded in [V1 acceptance](../v1-acceptance.md).

## Contents

- [Before choosing a target](#before-choosing-a-target)
- [Claude Code](#claude-code)
- [Codex](#codex)
- [OpenCode](#opencode)
- [Copilot](#copilot)
- [Gemini](#gemini)
- [Antigravity](#antigravity)
- [Cursor](#cursor)
- [Verify a first step and retire the same installation](#verify-a-first-step-and-retire-the-same-installation)

## Before choosing a target

For the shortest complete route, start with [getting started](../getting-started.md), then [your first framing](../tutorials/first-framing.md). This page is the per-client reference; [troubleshooting](../troubleshooting.md) covers a missing executable or skill, an ownership conflict or a denied permission.

Install the CLI first ([getting started](../getting-started.md#install-the-cli)) and check it:

```console
$ wl --version
1.1.0
```

| Client | Target | Client executable | Framing skill |
| --- | --- | --- | --- |
| [Claude Code](#claude-code) | `claude` | `claude` | `wl-frame-problem` |
| [Codex](#codex) | `codex` | `codex` | `wl-frame-problem` |
| [OpenCode](#opencode) | `opencode` | `opencode` | `wl-frame-problem` |
| [Copilot](#copilot) | `copilot` | `copilot` | `wl-frame-problem` |
| [Gemini](#gemini) | `gemini` | `gemini` | `wl-frame-problem` |
| [Antigravity](#antigravity) | `antigravity` | `agy` | `wl-agy-frame-problem` |
| [Cursor](#cursor) | `cursor` | `agent` | `wl-frame-problem` |

Every section uses the same three commands, with that client's target. Their output looks like the [getting started example](../getting-started.md#install-for-one-client):

```bash
wl install --target <target> --scope user --dry-run
wl install --target <target> --scope user
wl doctor --target <target>
```

Things that apply to every client:

- **User scope** installs for every project; **project scope** writes into the repository you run it from, so try it in a disposable project first. Your work history, ownership records and backups always stay in your store.
- **Install never** installs the client, changes its general settings or MCP credentials, or starts a model.
- **Doctor checks versions and files**, which is not proof that the client loads the skills or that a model ran.
- **Edited or foreign files are kept and reported**, never overwritten. Inspect a reported conflict and its backups before choosing another scope or output.
- **Git guards are per repository.** After a user-scope install, the guard command shows `<repository>`: run it with each application repository you want guarded. A project-scope install names its own repository.

## Claude Code

```bash
wl install --target claude --scope user --dry-run
wl install --target claude --scope user
wl doctor --target claude
```

| | |
| --- | --- |
| **Files go to** | `wl-`-prefixed skills and agents under `.claude`, or under `CLAUDE_CONFIG_DIR` when set |
| **Call it with** | `/wl-frame-problem` |
| **After restarting, check** | The skill appears; roles are discovered; the guard hooks are active. Read-only behaviour and permissions are only proven in the real client |

A [manual observation on 2026-10-22](../../roadmap/manual-verification.md#manually-observed-claude-framing-and-session-recovery-2026-10-22) confirmed interactive framing, an on-hold closure and recovering the status after restarting Claude. It also recorded stop conditions nobody approved and a final revision nobody reviewed, so it is narrower than full conformance.

**The plugin route.** A generated Claude plugin uses the `wholeloop` namespace instead: `/wholeloop:frame-problem`, separate from the installed `wl-frame-problem`. To try it, follow the [local marketplace preview](../contributing/releasing.md#review-a-local-delivery-preview) and register it explicitly in a disposable client configuration. Validating the plugin's files does not activate it.

## Codex

```bash
wl install --target codex --scope user --dry-run
wl install --target codex --scope user
wl doctor --target codex
```

| | |
| --- | --- |
| **Files go to** | Skills in `.agents/skills`; roles in `CODEX_HOME/agents` or `.codex/agents` |
| **Call it with** | `$wl-frame-problem` from the skill picker |
| **After restarting, check** | The skill appears in the picker; the per-repository Git guard command, before you activate it |

- An [automatic trial](../../roadmap/manual-verification.md#automatic-native-client-trials-2026-10-22) passed standalone framing on Codex 0.163.0. It does not cover permissions, hooks or other steps.
- **Roles inherit the parent session's permissions.** Do not assume a role is read-only because of its name; the headless worker recipe is a separate, checked boundary.
- A portable plugin carries skills only, so it does not prove that Codex loads the TOML roles.
- Install does not rewrite Codex's shared settings or its credential store. See [target layouts and boundaries](./README.md#installing).

## OpenCode

```bash
wl install --target opencode --scope user --dry-run
wl install --target opencode --scope user
wl doctor --target opencode
```

| | |
| --- | --- |
| **Files go to** | The XDG `opencode` directory, or `OPENCODE_CONFIG_DIR`; project scope uses `.opencode`, including a `wholeloop.js` guard plugin |
| **Call it with** | Ask for `wl-frame-problem` |
| **After restarting, check** | Skills, roles and the guard plugin are active. Your other OpenCode configuration is kept |

**Two OpenCode formats.** Install asks the installed OpenCode for its version, in isolation, and renders the matching format; even a dry run leaves your real home untouched. If the binary reports no version, the older format is used. Install the client first, or export a format explicitly:

```bash
wl adapter build-native --target opencode --pin 2.1.1 --out <directory> --json
```

- In the newer format, the hook reads the current session directory and refuses to act without it.
- A real user-scope trial on OpenCode 2.1.1 allowed reading a README and denied a write to a reserved runtime path. Project-scope trust and other versions are separate checks.
- The headless worker has its own deny-by-default permissions, which say nothing about the interactive client's policy. See [additional tier-A artifacts](./README.md#additional-tier-a-targets).

## Copilot

```bash
wl install --target copilot --scope user --dry-run
wl install --target copilot --scope user
wl doctor --target copilot
```

| | |
| --- | --- |
| **Files go to** | `COPILOT_HOME` or `.copilot`; project scope uses `.github`, with `.agent.md` roles and a `hooks/wholeloop.json` binding |
| **Call it with** | Ask for `wl-frame-problem` |
| **After restarting, check** | Copilot selects the roles and their tools, and the hook is active. Copied files alone are not a pass |

- MCP detection only reads declarations. Review the rendered recipes and sign in through Copilot's own setup.
- The headless worker recipe limits workers to `view`, `glob` and `grep`; Copilot's own startup policy still needs a manual check.

## Gemini

```bash
wl install --target gemini --scope user --dry-run
wl install --target gemini --scope user
wl doctor --target gemini
```

| | |
| --- | --- |
| **Files go to** | `.gemini/skills` and `.gemini/agents`. `GEMINI_CLI_HOME` moves the home that contains `.gemini`, not the `.gemini` folder itself |
| **Call it with** | Ask for `wl-frame-problem` |
| **After restarting, check** | Skills and roles are discovered. Enabling preview agents, trusting the folder and signing in are Gemini's own setup |

When structured questions are not available, the skills ask with exact plain-text options instead.

**The extension route.** Gemini can also load wholeloop as an extension:

```bash
wl build --target gemini --out /tmp/wholeloop-gemini --json
```

- Writing the extension does not activate it; link or install it explicitly in Gemini.
- Extensions bind their `BeforeTool` hook through Gemini's environment data; installed skills use the Git guard command instead.
- The headless worker uses a private allow-list of core tools, refuses existing managed system settings and keeps Gemini's own trust and sign-in. Real model, permission and MCP checks remain open. See [Gemini boundaries](./README.md#gemini-extension-and-native-overlays).

## Antigravity

```bash
wl install --target antigravity --scope user --dry-run
wl install --target antigravity --scope user
wl doctor --target antigravity
```

| | |
| --- | --- |
| **Files go to** | `.gemini/antigravity-cli/plugins/wholeloop`; project scope uses `.agents` |
| **Call it with** | Ask for `wl-agy-frame-problem` |
| **After restarting, check** | The plugin, its inherited roles and its named hooks are active. Listing plugins or the version does not prove discovery, tool isolation or sign-in |

- Skills and agents use the `wl-agy-` prefix so they can coexist with Codex's.
- **Project scope** needs `hooks.json` to be absent, or to be wholeloop's own unchanged file; a personal policy is kept and the install refused.
- `wl build --target antigravity` produces a standalone copy. A headless worker recipe and a sequential role hand-off exist, but Antigravity's real initialization, settings and permissions remain unverified. See [native boundaries](./README.md#antigravity-plugin-and-native-overlays).
- Antigravity cannot be an [autonomous delivery](../concepts.md#autonomous-delivery) worker yet, because there is no way to give it a credential from the controller. Using it in your own session is unaffected.

## Cursor

```bash
wl install --target cursor --scope user --dry-run
wl install --target cursor --scope user
wl doctor --target cursor
```

| | |
| --- | --- |
| **Files go to** | `.cursor` skills and agents, an opt-in rule and `preToolUse` hooks |
| **Call it with** | Restart `agent` and ask for `wl-frame-problem` |
| **After restarting, check** | Roles and their read-only setting are inherited, and the hook is active |

- An existing shared `hooks.json` is refused rather than merged; your other rules stay untouched.
- Hook validators and version checks are narrower evidence than a real model and permission check.

**The plugin route.** A standalone Cursor plugin needs its root passed explicitly:

```bash
wl build --target cursor --out /tmp/wholeloop-cursor --json
CURSOR_PLUGIN_ROOT=/tmp/wholeloop-cursor agent --plugin-dir /tmp/wholeloop-cursor
```

The second command starts Cursor itself, with its own trust, sign-in and model. Without the root, the hook denies; installed overlays set it automatically. Exporting the plugin does not install or publish it. See [Cursor boundaries](./README.md#cursor-plugin-and-native-overlays).

## Verify a first step and retire the same installation

In your client, ask for the framing skill from the table with a small idea. Check that:

- [ ] missing facts produce real questions;
- [ ] completion records an initiative and its artifact in your store;
- [ ] the client stops at the next required decision.

A file receipt proves none of the client's permissions, MCP, hooks or model behaviour; the [manual checklist](../../roadmap/manual-verification.md) covers those.

The disposable framing scenario used for conformance supports every target. Prepare it with the exact client version you observed, then choose a fixture run or a live run; see [standalone conformance](./README.md#standalone-conformance). A simulated run reports `FIXTURE_PASS`; a live run is a real, signed-in model call.

**To remove** an installation, use the same target, scope and store you installed with:

```console
$ wl uninstall --target codex --scope user --dry-run
Dry run for codex at user scope: nothing was written.
…
$ wl uninstall --target codex --scope user
Removed codex at user scope.
…
```

Replace `codex` with your target. Files you edited are kept; unchanged files wholeloop wrote are removed, and your history and backups stay in the store. Git guards you activated have their own uninstall command, printed by uninstall. Restart the client to confirm the skills are gone.

<!-- docnav -->
[◀ Small change](../tutorials/small-change.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Troubleshooting ▶](../troubleshooting.md)
