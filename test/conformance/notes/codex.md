# codex — conformance spike

Observed on macOS arm64, 2026-10-18.

- Installed version: `0.163.0` (`codex --version`, exit 0).
- `codex --help` exits 0. This checks availability only.
- Skill discovery and plugin manifests: **unverified**.
- Subagent format, parallelism and read-only enforcement: **unverified**.
- Hook events and payloads (including compatibility): **unverified**.
- Structured questions in interactive and headless modes: **unverified**.
- MCP configuration and tool invocation: **unverified**.
- Headless structured output: **unverified**; help is not a successful run.

Run the checklist in [README](./README.md) before promoting any capability.

## 2026-10-19 · Custom agent contract boundary

- Current official custom-agent documentation states that sandbox/approval settings are inherited from the parent and cannot be lowered through a custom-agent file. Generated TOML emits supported feature reductions and checked read-only parent/headless guidance; it does not emit a fake sandbox override.
- Local features list confirms shell_tool, apps, plugins, memories and request_permissions_tool keys exist. This is a configuration/availability probe, not a custom-agent execution or permission-enforcement pass.
- Golden TOML, launcher and packaged-root fixtures passed. Native discovery, actual read-only behavior and model execution remain unverified.
