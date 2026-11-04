# 0053 — Gemini extension overlays and safe hook boundary

- **Status:** Accepted
- **Date:** 2026-10-19

## Context

Gemini has an extension format, project/user native overlays and preview local agents. Treating it as another portable plugin would lose its actual manifest, tool names, inheritance and delegation limits. Current documentation and installed 0.27.0 also differ: the installed registry uses search_file_content, and its MCP client needs explicit OAuth enablement where newer documentation allows discovery.

## Decision

- Add a dedicated Gemini renderer with gemini-extension.json, namespaced skills and local agents, the bundled core/resources and checked relative launchers. Reuse ownership and installation machinery for .gemini/skills and agents at explicit user/project scope. GEMINI_CLI_HOME overrides the home containing .gemini; require an absolute override. Never rewrite shared settings or auth.
- Include Gemini in install --target all. Keep default doctor selection on tier A; Gemini remains available through an explicit --target gemini, including managed ownership/artifact diagnosis. Expose the same fresh framing scenario and explicit simulation/live evidence boundary for Gemini without changing tier-A criteria.
- Emit strict local-agent fields and explicit tool lists. Inherit the session model with the canonical tier retained as guidance. Observers get read tools and declared web reads, with no shell/write/memory/MCP/delegation channel. Main sessions supply observed command/provider evidence and perform sequential role handoffs; Gemini subagents cannot nest delegation. Missing structured questions return plain-text options and wait, preserving explicit human decisions.
- Match the installed 0.27.0 registry for tool names and record static loader validation separately from real execution. Preview/native policy changes and newer aliases still require version-specific verification.
- Use the explicit per-repository Git fallback. Do not emit a Gemini native hook command containing extensionPath: 0.27.0 hydrates that value into shell text before execution, without a root value we can safely quote for arbitrary paths. A future native binding needs a verified safe transport, not permission bypass or a guessed extension root. Other clients keep their existing bindings.
- Render unapplied mcpServers snippets with httpUrl for streamable HTTP or explicit command/args for stdio. Preserve bearer environment placeholders, explicitly enable requested OAuth and leave credentials with the native client. Detect project/user declarations plus allowed/excluded metadata without network calls or exposing configuration values. Availability remains unauthenticated metadata.

## Consequences

Gemini can use generated extensions, owned native overlays and the local framing runner now. File installation does not enable experimental subagents, approve trust or authenticate models. Native discovery, read-only behavior, questions, MCP/tool execution and real framing remain manual checks. Antigravity generation, its hook/MCP dialect and the broader P5-01 acceptance remain separate unfinished work. No Gemini headless gate recipe or native parallelism is implied.

## Rejected alternatives

- Reusing another client's manifest/tool names: similar Markdown is not the same native loader or capability boundary.
- Granting observers shell or wildcard MCP tools: either exposes mutation routes that cannot be reduced by a read-only instruction alone.
- Enabling preview settings or copying OAuth credentials during install: those belong to explicit native setup and the client's credential store.
- Emitting an unescaped shell root substitution: ordinary quoted/path relocation cases cannot establish safety for arbitrary installed paths.
