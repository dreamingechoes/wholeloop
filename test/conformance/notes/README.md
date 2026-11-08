# Conformance spike — results

The four tier-A clients were exercised on 2026-11-08, macOS arm64: Claude Code 2.1.319, Codex 0.166.0, OpenCode 2.2.5 and Copilot CLI 1.0.83. Each ran in a disposable repository with one marker skill per discovery directory, a read-only reader subagent in its own format, logging hooks, and a local MCP server that returns a fixed marker. Each client's note records the invocation and the observed result; the [platform matrix](../../../docs/platforms/README.md#capability-matrix) summarises them. Codex's interactive question and every Linux run were not exercised.

The read-only boundary and the framing scenario also run with one command per client: `npm run native:check -- <client> --live` (see [V1 acceptance](../../../docs/v1-acceptance.md#4-let-the-automatic-runner-cover-the-other-clients)).

## Manual checklist (repeat for each CLI)

1. Create a throwaway git repository outside the wholeloop checkout and record OS, architecture and exact CLI version. Do not reuse personal MCP configurations or credentials in fixtures.
2. Add a skill with a unique marker; test each discovery directory separately. Record the discovered marker, not merely the absence of an error.
3. Add a read-only subagent and attempt a write to a disposable sentinel. Record both the native permission outcome and the sentinel diff. Exercise two independent agents to establish parallelism.
4. Register a logging hook in the isolated fixture. Exercise each event and retain a redacted payload showing its shape. Specifically test Copilot loading Claude hooks.
5. Ask one multiple-choice question interactively and headlessly. For Codex, record the collaboration mode and request_user_input availability.
6. Attach a local test MCP server without credentials; call one tool and retain its response and configuration dialect.
7. Run the headless entry point with structured output. Record flags, exit status and redacted output.
8. Test plugin loading, including Claude discovery of .agents/skills and Agent Plugins manifests. Compare findings against ADR-0005 and ADR-0006.

Record each result in the CLI-specific note with the exact invocation and observable evidence. Repeat on Linux before claiming cross-platform conformance. Never convert an untested feature into a checkmark.
