# copilot — conformance spike

The spike results below are from 2026-11-08, macOS arm64, Copilot CLI `1.0.83`, in disposable repositories outside the checkout.

- **Skill discovery:** reads `.github/skills`, `.agents/skills` and `.claude/skills`; not `.opencode/skills` or `.codex/skills`.
- **Plugins:** `copilot plugin marketplace add` reads a Claude `.claude-plugin/marketplace.json`, and `copilot plugin install` installs the generated Agent Plugins package with its seventeen skills (isolated `COPILOT_HOME`, no model call). Plugin agents are named `wholeloop:wl-<name>` (P1-11).
- **Subagents:** `.github/agents/*.agent.md` with a `tools` list. Two `probe-reader` subagents started within 1 ms of each other and both completed, each returning its file.
- **Read-only enforcement:** the generated reviewer under `--allow-all` exposed only `view`, `glob`, `rg`, `skill` and the session `sql` tool (P1-11).
- **Hooks:** in a trusted folder, Copilot fires both its own `.github/hooks/*.json` (`sessionStart`, `userPromptSubmitted`, `preToolUse`, `postToolUse`, `agentStop`) and Claude's `.claude/settings.json` hooks, using Claude's event and tool names (`PreToolUse` for `AskUserQuestion`). In an untrusted folder, a headless run fired neither. Plugin hooks fire headless (P3-08), which is how wholeloop installs its guard.
- **Structured questions:** interactively, `ask_user` offered options A and B and returned the choice. Headless, it is unavailable.
- **MCP:** Copilot does not read the repository's `.mcp.json`, even in a trusted folder. `--additional-mcp-config` or `~/.copilot/mcp-config.json` with `mcpServers.<name>` (`type: local`, `command`, `args`, `tools`) works: the tool `marker-get_marker` returned the marker.
- **Headless:** `copilot -p --output-format json`, exit 0, JSONL events including `tool.execution_start`, `subagent.started` and `session.mcp_servers_loaded`.

Not run: Linux.

## 2026-10-19 · Generated portable package probe

- Rechecked Copilot CLI 1.0.83 on macOS arm64. Mount the generated portable artifact with --plugin-dir under a temporary COPILOT_HOME and run plugin list. Exit 0 lists wholeloop under External Plugins with no reported error.
- This proves a local package is recognized, not that every component was discovered or that a role obeys its tool restrictions. No plugin was installed into personal configuration and no model/session, source query or message ran.
- Actual skill/agent invocation, read-only sentinels, hook behavior and Linux remain unverified.

## Guard transport implementation (2026-10-19)

The generated copilot native guard transport is implemented and executed with authored payloads against the copied core. This is synthetic transport evidence; it does not prove actual client registration, captured payloads or permissions. Real hook capture, timeout/managed-policy behavior and Linux remain manual checks.
