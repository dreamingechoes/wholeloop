# claude — conformance spike

First observed on macOS arm64, 2026-10-18 (2.1.299). The spike results below are from 2026-11-08, macOS arm64, Claude Code `2.1.319`, in disposable repositories outside the checkout, with project settings only and a local MCP server that returns a fixed marker.

- **Skill discovery:** reads `.claude/skills` only. A marker skill in each of `.agents/skills`, `.claude/skills`, `.github/skills`, `.opencode/skills` and `.codex/skills` produced only `probe-claude` in the session's skill list. Claude Code does **not** read `.agents/skills`.
- **Agent Plugins manifests:** `--plugin-dir` on the generated Codex package (root `plugin.json`, no `.claude-plugin/`) loads its seventeen skills from the `skills/` layout, but names the plugin after the directory, not the manifest's `name`, so the Agent Plugins manifest itself is not read. The generated Claude plugin installs from a local marketplace and lists all seventeen skills (P1-10).
- **Subagents:** `.claude/agents/*.md` with a `tools` list. Two `probe-reader` subagents launched in one message ran in parallel and each returned its file.
- **Read-only enforcement:** the headless recipe exposes no write or shell tool (`npm run native:check -- claude --live`, 2026-11-08).
- **Hooks:** `.claude/settings.json` hooks fired for `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `SubagentStop` and `Stop`. PreToolUse carries `cwd`, `effort`, `hook_event_name`, `permission_mode`, `prompt_id`, `session_id`, `tool_input`, `tool_name`, `tool_use_id` and `transcript_path`; redacted read, write and shell payloads are fixtures (P3-08).
- **Structured questions:** interactively, `AskUserQuestion` showed options A and B and returned the chosen answer. Headless (`-p`), the tool is not available at all, so a headless step cannot ask.
- **MCP:** `.mcp.json` with `mcpServers.<name>.command/args`, passed with `--mcp-config`; the tool appears as `mcp__marker__get_marker` and returned the marker.
- **Headless:** `claude -p --output-format stream-json --verbose` (or `json`), exit 0; the init event lists tools, skills, agents, plugins and MCP servers.

Not run: Linux, managed policy, and hook timeouts.

## Guard transport implementation (2026-10-19)

The generated claude native guard transport is implemented and executed with authored payloads against the copied core. This is synthetic transport evidence; it does not prove actual client registration, captured payloads or permissions. Real hook capture, timeout/managed-policy behavior and Linux remain manual checks.
