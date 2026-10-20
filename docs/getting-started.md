# Getting started — from nothing to your first step

> **TL;DR** — Install the `wl` CLI (or the plugin for your CLI), let it generate the skills for the agentic CLIs you use, run `wl doctor`, then invoke any step. Nothing needs configuring up front: what is missing becomes a question the first time it matters.

> [!WARNING]
> **Status: 🚧 partial — local source installation available.** The core, four tier-A native render targets plus Gemini/Antigravity/Cursor, owned user/project install and uninstall, common guards and observed diagnostics are implemented. Actual native discovery/trust/permissions and cross-platform conformance remain owner checks; published npm/remote-marketplace distribution remains planned in [P5-05](../roadmap/phase-5-reach-release.md#p5-05--distribution). No real client/model session is implied by the filesystem and transport fixtures.

---

## At a glance

| | |
| --- | --- |
| **Requires** | Node.js ≥ 20 · git ≥ 2.30 (worktrees) · at least one supported agentic CLI |
| **Installs** | the `wl` CLI · generated skills, agents and hooks for the CLIs you choose |
| **Writes** | your CLI's skill/agent folders (user or project scope) · `~/.config/wholeloop/` · `~/.local/state/wholeloop/` |
| **Repository installation** | `--scope project` writes native components; runtime state remains external |

## 1. Install

From a source checkout (development requires Node 22 or newer):

```bash
npm ci
npm run build
export WHOLELOOP_CLI="$PWD/dist/wl.mjs"
node "$WHOLELOOP_CLI" install --target codex --scope user --dry-run --json
node "$WHOLELOOP_CLI" install --target codex --scope user --json
```

Replace codex with your chosen target; run npm run check for the full local suite.
Keep the absolute WHOLELOOP_CLI path when changing into your project. Native file
installation does not add a global wl command to PATH.

Target/scope are explicit; all selects every implemented installation target: the four tier-A clients plus Gemini, Antigravity and Cursor. Use a named target list when you want only those clients. Installation creates
wl-prefixed native skills/agents and scoped/dedicated guard bindings, backed by a
self-contained artifact per target. Claude loose native components use wl-* names;
`build --target claude` still produces its separate plugin format. No general client
settings, MCP configuration, marketplace registry or credential store is rewritten.

| Scope | Native output | Packaged core/resources |
| --- | --- | --- |
| user | client skill/agent/hook directories, with absolute configured overrides | external store distributions |
| project | .claude/, .agents/, .codex/, .opencode/, .github/, .gemini/ and .cursor/ native directories | .wholeloop/distribution/target, intentional distributable output |

Project launchers/hooks use relative bindings and work after relocation. Runtime
ownership receipts, locks, backups and all execution state remain in the external
store. User roots are resolved at runtime, including CLAUDE_CONFIG_DIR, CODEX_HOME,
OPENCODE_CONFIG_DIR, XDG_CONFIG_HOME, COPILOT_HOME and GEMINI_CLI_HOME; ambiguous relative native
overrides are refused. Inspect [platform layouts](./platforms/README.md#installing).

Packaged entrypoints are inventoried without competing as repository-specific
slot guidance. Several client installs can coexist without asking which copy of
the harness should fill frame.template; real conflicting team guides still ask.
Older unchanged owned output needs an upgrade to receive that routing marker.

Repeated matching installs report already-correct. Upgrades verify old ownership,
skip unchanged files and retain replaced/removed bytes outside repositories. Edited
or unowned files, unexpected private-tree contents and unsafe links are preserved
and refused. There is no force/adoption option. After an interruption, inspect the
pending external receipt; uninstall must include all pending targets and recognizes
only recorded old/new bytes. Physical interruption recovery still needs owner checks.

Installation reports files installed, with native activation unverified. Restart or
reload the selected client, accept project trust where required and verify actual
skills/agents/permissions. Git fallbacks are a separate per-repository action; use
the concrete command returned by install, or the available compiled core:

```text
node "$WHOLELOOP_CLI" guard hooks install --repo /path/to/project --json
```

Use the same external --store/workspace as Build/open-pr. Inspect existing Git hooks
and the [guard ownership rules](./architecture/core-cli.md#hooks-and-guards) first.
No model call, authentication or service publication is part of file installation.

Choose a [client-specific setup path](./platforms/local-onboarding.md) for native
activation, namespaces, environment overrides and the first framing check.

Published npm/marketplace installation remains planned. Once released, npm global
installation and the client plugin marketplace will be alternative entry points;
the source path above is available now.

For offline package checks, delivery previews, release-note drafts and source
preflight, see [release preparation](./contributing/releasing.md). These maintainer
controls are separate from your first native setup.

## 2. Check

The source-built core can diagnose the local environment now:

```text
node "$WHOLELOOP_CLI" doctor --target codex --json
node "$WHOLELOOP_CLI" doctor --target codex --artifact /path/to/generated-codex --store /external/store --json
```

The versioned wholeloop/doctor@1 report distinguishes pass/fail/unknown/skip. Default
checks skip unobserved optional clients if another tier-A CLI reports a version;
explicit targets must all report versions. Fixed reason codes distinguish missing
executables, timeouts, output limits, failed launches/exits and malformed replies.
A missing binary gets an install recipe; an existing failed command gets a diagnostic
command rather than an automatic reinstall. Exit 3 means at least one required check
needs attention. Each failure includes instructions and an argv command for repair
or further diagnosis. Nothing is installed or repaired automatically.

Doctor observes Node/Git/client versions with bounded shell-free version commands
(2500 ms, 64 KiB, hard termination so a SIGTERM handler cannot defeat the deadline),
checks layered provider/MCP declarations without authentication, and performs a real
atomic external-store write/rename probe. It removes only probe files/directories
it created, preserving existing state. A store under Git, including symlink targets,
is rejected before writing; probe/cleanup failures remain failures.

Doctor automatically checks owned user/project receipts and native/artifact files.
It distinguishes current, stale, changed, pending, invalid and absent ownership;
absence of a local receipt does not prove absence of unmanaged components.
An explicit target/artifact pair additionally checks standalone generated output.
Every expected file, executable mode, manifest and source/core hash must match this
build; changed output is preserved and the remedy builds into a fresh directory.
Without that input, the standalone artifact check remains unknown; managed scope
checks are reported separately. A matching artifact is not proof
of native client installation/discovery, sandbox enforcement or a model run. All
reports retain conformance unverified and authenticated false.

The suggested npm client-install recipes are documented by
[Claude](https://code.claude.com/docs/en/setup),
[Codex](https://developers.openai.com/codex/cli/),
[OpenCode](https://opencode.ai/docs/) and
[Copilot](https://docs.github.com/en/copilot/get-started/cli-quickstart).
Use a compatible runtime/package manager and inspect these commands before running
them; the current Claude/Copilot npm recipes require Node 22 or newer, while the
bundled wholeloop core supports Node 20. Native client requirements remain separate.

## 3. Your first step

Any step works on its own. Three good first runs:

| Try | Managed skill to request | You get |
| --- | --- | --- |
| Research a question | wl-research | an evidence brief with open questions |
| Frame an idea | wl-frame-problem | an initiative with a framed problem and an owner |
| Fix something small | wl-build-slice | a slice built in its own worktree, checked until green |

Antigravity uses wl-agy- names; standalone Claude plugins use /wholeloop: names.
Use the exact native entrypoint from your [client setup](./platforms/local-onboarding.md).

Or hand it the whole thing and let it walk the flow, stopping wherever you have to decide:

```text
Use wl-next for: "Users can't find last month's orders"
```

## 4. Make it yours (optional)

```text
node "$WHOLELOOP_CLI" profile preset sparring          # or: mentor · pair · autopilot
node "$WHOLELOOP_CLI" profile set language=es          # talk to me in Spanish, write artifacts in English
```

Ask your client to use wl-setup (wl-agy-setup on Antigravity) for guided provider,
destination and CLI choices. Team-wide choices go into `.wholeloop/config.yml` in the repository ([configuration](./configuration/README.md)).

## Uninstall

```bash
node "$WHOLELOOP_CLI" uninstall --target codex --scope user --dry-run --json
node "$WHOLELOOP_CLI" uninstall --target codex --scope user --json
```

Use the same named target/scope/store as installation; replace codex as needed.
Uninstall removes only observed unchanged owned files, accepts already missing owned
files and cleans newly created empty parents while retaining unrelated data. External
history/backups remain. Separately activated Git hooks are managed separately; use
the returned Node/core guard hooks uninstall command, backed by a retained external
core even after the native tree is removed, if
you want to retire those repository policies. Pending native removal still needs a
client restart and verification. A cloned project can run its checked-in distribution
without a local receipt, but another scope/store cannot automatically adopt ownership.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| The step is not listed in your CLI | generated files are stale or the CLI was open during install | repeat install with the same explicit target/scope, then restart the CLI |
| "`wl` not found" inside a skill | Node or the selected packaged root is unavailable | check Node ≥ 20 and use the rendered packaged launcher |
| A provider shows "not connected" | the MCP server is not in this CLI's config | inspect mcp add output, then apply the recipe through the native client setup |
| Questions are plain text, not a picker | your CLI has no structured question tool | expected — answer with the option number |

<!-- docnav -->
[◀ Philosophy](philosophy.md)  ·  [📖 Docs index](README.md)  ·  [Concepts ▶](concepts.md)
