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
| **Never writes** | anything inside your repositories, unless you choose `--scope project` |

## 1. Install

From a source checkout (development requires Node 22 or newer):

```bash
npm ci
npm run check
npm run build
node dist/wl.mjs install --target claude,codex,opencode,copilot --scope user --dry-run --json
node dist/wl.mjs install --target claude,codex,opencode,copilot --scope user --json
```

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
node dist/wl.mjs guard hooks install --repo /path/to/project --json
```

Use the same external --store/workspace as Build/open-pr. Inspect existing Git hooks
and the [guard ownership rules](./architecture/core-cli.md#hooks-and-guards) first.
No model call, authentication or service publication is part of file installation.

### Gemini from source

```text
node dist/wl.mjs build --target gemini --out /tmp/wholeloop-gemini --json
node dist/wl.mjs install --target gemini --scope project --dry-run --json
node dist/wl.mjs install --target gemini --scope project --json
node dist/wl.mjs doctor --target gemini --json
```

The generated directory is also a Gemini extension for explicit native extension
installation/linking; source-native overlays use .gemini/skills and agents directly.
GEMINI_CLI_HOME overrides the home containing .gemini, rather than the .gemini
folder itself. Preview agent enablement, trust and authentication are native setup;
no personal settings or credentials are copied. Questions fall back to exact
plain-text options when a structured ask tool is unavailable. The shared conformance
runner accepts Gemini, while actual model/permission checks remain with the owner.
Loose overlays use the returned per-repository Git hook activation command.
Generated extensions use an environment-bound hook after explicit native extension
activation; file installation does not activate it. See [Gemini boundaries](./platforms/README.md#gemini-extension-and-native-overlays).

Published npm/marketplace installation remains planned. Once released, npm global
installation and the client plugin marketplace will be alternative entry points;
the source path above is available now.

### Review a local delivery preview

```text
wl release artifacts --out /tmp/wholeloop-delivery --dry-run --json
wl release artifacts --out /tmp/wholeloop-delivery --json
claude plugin validate /tmp/wholeloop-delivery --strict
```

The export contains all seven independent native trees plus a relative Claude
marketplace entry, each with the same built version/source/core. Root metadata
records file hashes/modes, local target summaries and publication not performed.
Version 0.0.0 remains a development preview. Static validation checks metadata;
actual installation/discovery and model conformance remain separate.

Dry runs render and preflight ownership without writing. Existing unowned,
changed, missing or extra entries are refused before idempotency/replacement.
Unchanged owned output reports already-correct; an owned upgrade retains its prior
tree in the returned backup. Interrupted filesystem replacement is not claimed
crash-atomic. Preserve unexpected output and choose a fresh directory.

To test registration yourself in an isolated real client configuration, use
claude plugin marketplace add /tmp/wholeloop-delivery and then
claude plugin install wholeloop@wholeloop. These commands change that client's
settings; export and validation do not register it. Remote installation requires
a hosted copy of the complete delivery tree and an explicit owner publication
choice. npm automation/provenance, release notes, compiled binaries and actual
public distribution remain P5-05 work. See
[ADR-0062](./decisions/0062-owned-seven-client-distribution-previews.md).

## 2. Check

The source-built core can diagnose the local environment now:

```text
wl doctor --json
wl doctor --target codex --artifact /path/to/generated-codex --store /external/store --json
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

| Try | Invoke (Claude Code · Codex · others) | You get |
| --- | --- | --- |
| Research a question | `/wholeloop:research …` · `$wl-research …` · `/wl-research …` | an evidence brief with open questions |
| Frame an idea | `/wholeloop:frame-problem …` | an initiative with a framed problem and an owner |
| Fix something small | `/wholeloop:build-slice "…"` | a slice built in its own worktree, checked until green |

Or hand it the whole thing and let it walk the flow, stopping wherever you have to decide:

```text
/wholeloop:next "Users can't find last month's orders"
```

## 4. Make it yours (optional)

```text
wl profile preset sparring          # or: mentor · pair · autopilot
wl profile set language=es          # talk to me in Spanish, write artifacts in English
/wholeloop:setup                  # providers, destinations, CLIs — guided
```

Team-wide choices go into `.wholeloop/config.yml` in the repository ([configuration](./configuration/README.md)).

## Uninstall

```bash
node dist/wl.mjs uninstall --target all --scope user --dry-run --json
node dist/wl.mjs uninstall --target all --scope user --json
```

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
| The step is not listed in your CLI | generated files are stale or the CLI was open during install | `wl install --target <cli>` again, then restart the CLI |
| "`wl` not found" inside a skill | the plugin path cannot find Node | install Node ≥ 20, or use the bundled plugin |
| A provider shows "not connected" | the MCP server is not in this CLI's config | `wl mcp add <provider> --target <cli>` |
| Questions are plain text, not a picker | your CLI has no structured question tool | expected — answer with the option number |

---

## Antigravity setup

Build first, then inspect `wl install --target antigravity --scope project --dry-run
--json`. Explicit install writes wl-agy- skills/agents and the native named hook map;
user scope uses .gemini/antigravity-cli/plugins/wholeloop. Project hooks.json must
be absent or already owned unchanged: existing personal policy is refused.
Use `wl doctor --target antigravity --json` for metadata diagnostics and
`wl uninstall --target antigravity --scope project --json` for owned removal.
Standalone plugin output is available through build --target antigravity.
See [native boundaries](./platforms/README.md#antigravity-plugin-and-native-overlays)
before enabling a disposable native client; local transport tests do not establish
actual native activation or authentication.

## Cursor setup

Build first, then inspect `wl install --target cursor --scope project --dry-run
--json`. Explicit install writes owned .cursor skills/agents, one opt-in rule and
preToolUse hooks. Native observer agents set readonly; all roles inherit models.
Existing shared hooks.json is refused, while unrelated rules remain untouched.
Use `wl doctor --target cursor --json` for agent version/owned-file diagnosis and
`wl uninstall --target cursor --scope project --json` for retained owned removal.

Standalone native plugin delivery needs an explicit root environment binding:

```text
node dist/wl.mjs build --target cursor --out /tmp/wholeloop-cursor --json
CURSOR_PLUGIN_ROOT=/tmp/wholeloop-cursor agent --plugin-dir /tmp/wholeloop-cursor
```

That command explicitly starts a native client; arrange its trust, authentication
and model setup yourself. Managed overlays bind roots automatically. This does not
install/publish a marketplace package. Hook root data stays outside shell syntax;
missing context denies. Native discovery/readonly/MCP and actual framing remain
[owner checks](../roadmap/manual-verification.md#cursor-native-activation-p5-02).

<!-- docnav -->
[◀ Philosophy](philosophy.md)  ·  [📖 Docs index](README.md)  ·  [Concepts ▶](concepts.md)
