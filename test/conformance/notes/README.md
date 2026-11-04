# Conformance spike — evidence still required

Version/help probes and authorized actual model trials ran on macOS arm64. Codex 0.163.0 passed the structural standalone framing scenario; Claude loose-skill framing and recovery across sessions were observed by hand. Other automatic trials failed; see [actual results and blockers](../../../roadmap/manual-verification.md#automatic-native-client-trials-2026-10-22). P0-03's full permissions/hooks/questions/MCP spike and dependent aggregate adapter acceptance remain open. These observations do not establish the complete platform matrix.

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
