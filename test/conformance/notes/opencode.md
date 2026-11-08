# opencode — conformance spike

First observed on macOS arm64, 2026-10-18 (1.17.9). The spike results below are from 2026-11-08, macOS arm64, OpenCode `2.2.5`, in disposable repositories outside the checkout, with an isolated `XDG_CONFIG_HOME` and `--model opencode-go/kimi-k2.7-code` (the default model is unavailable in this region).

- **Skill discovery:** reads `.opencode/skills`, `.claude/skills` and `.agents/skills`; not `.github/skills` or `.codex/skills`.
- **Subagents:** `.opencode/agents/*.md` with `mode: subagent` and a `permission` map, listed by `opencode debug agents`. Two `probe-reader` subagents overlapped (19:44:47.3–19:44:50.9 and 19:44:47.8–19:44:51.1 UTC) and each returned its file.
- **Read-only enforcement:** V2 translates the V1 `permission` map into ordered rules; the generated reviewer under `--auto` had no write or shell tool, and `.env` reads are denied after the P1-11 fix.
- **Hooks:** JS plugins in `.opencode/plugins/`; V2 uses `setup(ctx)` with `ctx.tool.hook('execute.before')`. Redacted read, write and shell payloads are fixtures (P3-08).
- **Structured questions:** the `question` tool showed options A and B in the TUI and returned the chosen answer. In `opencode run` it is cancelled: "This non-interactive run cannot ask the user questions".
- **MCP:** a V1 `mcp.<name>` entry (`type: local`, `command` array) in `opencode.json` is migrated to V2 `mcp.servers.<name>`; the model called it through the `execute` code tool, and it returned the marker.
- **Headless:** `opencode run --standalone --format json`, exit 0, JSON events with `tool_use` parts and their timings.

Not run: Linux.

## 2026-10-19 · Generated layout probe

- Rechecked OpenCode 1.17.9 on macOS arm64. Generate the native tree, create an explicit temporary config directory and inspect each wl-prefixed agent with opencode --pure debug agent. All eight commands exit 0 and name the requested role.
- Full list/debug output captured through pipes ends at exactly 8192 bytes mid-object; the full permission JSON cannot be parsed. A PTY diagnostic was unavailable in the sandbox. These observations do not validate effective permissions or a complete listing. An initial probe without the explicit config directory exited 1; rerunning after creating it succeeded.
- XDG/config overrides still expose ambient compatible skill directories in the client's permission metadata. This is not a hermetic client-isolation proof. No model or source/provider query ran, and no raw native diagnostic output was saved in the repository.
- Read-only sentinel attempts, actual skills, tool execution, hooks and cross-platform conformance remain unverified.

## Guard transport implementation (2026-10-19)

The generated opencode native guard transport is implemented and executed with authored payloads against the copied core. This is synthetic transport evidence; it does not prove actual client registration, captured payloads or permissions. Real hook capture, timeout/managed-policy behavior and Linux remain manual checks.
