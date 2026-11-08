# codex — conformance spike

First observed on macOS arm64, 2026-10-18 (0.163.0). The spike results below are from 2026-11-08, macOS arm64, Codex `0.166.0`, in disposable repositories outside the checkout.

- **Skill discovery:** reads `.agents/skills` and `.codex/skills`; not `.claude/skills`, `.github/skills` or `.opencode/skills`.
- **Plugins:** `codex plugin marketplace add` reads a Claude `.claude-plugin/marketplace.json`, and `codex plugin add` installs the generated Agent Plugins package with its seventeen skills, enabled (isolated `CODEX_HOME`, no model call).
- **Subagents:** custom agents are `.codex/agents/*.toml` (`name`, `description`, `developer_instructions`). Two subagents ran in parallel (child sessions 19:50:10–19:50:16 and 19:50:13–19:50:18 UTC). In that run the model spawned generic subagents rather than the named `probe-reader`; a named custom agent was loaded and inspected in P4-01. Spawning fails under `codex exec --ephemeral` ("no rollout found for thread id"), because children need the parent's persisted session.
- **Read-only enforcement:** a custom agent cannot lower the parent's sandbox, approvals or MCP servers (current subagent documentation, checked 2026-11-08; ADR-0048). The read-only headless recipe refused all three writes (2026-11-08).
- **Hooks:** project `.codex/hooks.json` runs only after the user trusts it interactively; redacted read, write and shell `PreToolUse` payloads are fixtures, and `apply_patch` sends its text as `tool_input.command` (P3-08).
- **Structured questions:** headless `codex exec` exposes `request_user_input_async`; it returned `{"accepted":true}` and no answer, so a headless run cannot obtain a person's choice. The interactive behaviour was not exercised: the TUI asks to save folder trust to the user's configuration, which was declined.
- **MCP:** TOML `mcp_servers.<name>.command/args` (here through `-c` overrides); `get_marker` returned the marker. Custom agents inherit every configured server (P4-01).
- **Headless:** `codex exec --json`, exit 0, JSONL items including `mcp_tool_call` and `collab_tool_call`.

Not run: interactive questions, Linux.

## 2026-10-19 · Custom agent contract boundary

- Current official custom-agent documentation states that sandbox/approval settings are inherited from the parent and cannot be lowered through a custom-agent file. Generated TOML emits supported feature reductions and checked read-only parent/headless guidance; it does not emit a fake sandbox override.
- Local features list confirms shell_tool, apps, plugins, memories and request_permissions_tool keys exist. This is a configuration/availability probe, not a custom-agent execution or permission-enforcement pass.
- Golden TOML, launcher and packaged-root fixtures passed. Native discovery, actual read-only behavior and model execution remain unverified.

## Guard transport implementation (2026-10-19)

The generated Codex artifact declares the explicit Git fallback. A Codex-shaped SDK normalization fixture is authored and synthetic; it is not a captured CLI hook. No unsupported CLI hooks configuration is emitted. Real hook capture, timeout/managed-policy behavior and Linux remain manual checks.
