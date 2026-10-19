# opencode — conformance spike

Observed on macOS arm64, 2026-10-18.

- Installed version: `1.17.9` (`opencode --version`, exit 0).
- `opencode --help` exits 0. This checks availability only.
- Skill discovery and plugin manifests: **unverified**.
- Subagent format, parallelism and read-only enforcement: **unverified**.
- Hook events and payloads (including compatibility): **unverified**.
- Structured questions in interactive and headless modes: **unverified**.
- MCP configuration and tool invocation: **unverified**.
- Headless structured output: **unverified**; help is not a successful run.

Run the checklist in [README](./README.md) before promoting any capability.

## 2026-10-19 · Generated layout probe

- Rechecked OpenCode 1.17.9 on macOS arm64. Generate the native tree, create an explicit temporary config directory and inspect each wl-prefixed agent with opencode --pure debug agent. All eight commands exit 0 and name the requested role.
- Full list/debug output captured through pipes ends at exactly 8192 bytes mid-object; the full permission JSON cannot be parsed. A PTY diagnostic was unavailable in the sandbox. These observations do not validate effective permissions or a complete listing. An initial probe without the explicit config directory exited 1; rerunning after creating it succeeded.
- XDG/config overrides still expose ambient compatible skill directories in the client's permission metadata. This is not a hermetic client-isolation proof. No model or source/provider query ran, and no raw native diagnostic output was saved in the repository.
- Read-only sentinel attempts, actual skills, tool execution, hooks and cross-platform conformance remain unverified.
