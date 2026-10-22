# copilot — conformance spike

Observed on macOS arm64, 2026-10-18.

- Installed version: `1.0.83` (`copilot --version`, exit 0).
- `copilot --help` exits 0. This checks availability only.
- Skill discovery and plugin manifests: **unverified**.
- Subagent format, parallelism and read-only enforcement: **unverified**.
- Hook events and payloads (including compatibility): **unverified**.
- Structured questions in interactive and headless modes: **unverified**.
- MCP configuration and tool invocation: **unverified**.
- Headless structured output: **unverified**; help is not a successful run.

Run the checklist in [README](./README.md) before promoting any capability.

## 2026-10-19 · Generated portable package probe

- Rechecked Copilot CLI 1.0.83 on macOS arm64. Mount the generated portable artifact with --plugin-dir under a temporary COPILOT_HOME and run plugin list. Exit 0 lists wholeloop under External Plugins with no reported error.
- This proves a local package is recognized, not that every component was discovered or that a role obeys its tool restrictions. No plugin was installed into personal configuration and no model/session, source query or message ran.
- Actual skill/agent invocation, read-only sentinels, hook behavior and Linux remain unverified.

## Guard transport implementation (2026-10-19)

The generated copilot native guard transport is implemented and executed with authored payloads against the copied core. This is synthetic transport evidence; it does not prove actual client registration, captured payloads or permissions. Real hook capture, timeout/managed-policy behavior and Linux remain owner checks.
