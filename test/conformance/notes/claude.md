# claude — conformance spike

Observed on macOS arm64, 2026-10-18.

- Installed version: `2.1.299` (`claude --version`, exit 0).
- `claude --help` exits 0. This checks availability only.
- Static plugin manifest validation: **passed**, 2026-10-19, Claude 2.1.299. The generated self-contained artifact passed claude plugin validate --strict in an isolated temporary configuration, including after an owned upgrade with a retained backup.
- Skill discovery, local installation and actual invocation: **unverified**. Static validation is not a model/client conformance run.
- Subagent format, parallelism and read-only enforcement: **unverified**.
- Hook events and payloads (including compatibility): **unverified**.
- Structured questions in interactive and headless modes: **unverified**.
- MCP configuration and tool invocation: **unverified**.
- Headless structured output: **unverified**; help is not a successful run.

Run the checklist in [README](./README.md) before promoting any capability.

## Guard transport implementation (2026-10-19)

The generated claude native guard transport is implemented and executed with authored payloads against the copied core. This is synthetic transport evidence; it does not prove actual client registration, captured payloads or permissions. Real hook capture, timeout/managed-policy behavior and Linux remain owner checks.
