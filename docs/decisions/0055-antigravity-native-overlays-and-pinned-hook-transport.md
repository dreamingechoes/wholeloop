# 0055 — Antigravity native overlays and pinned hook transport

- **Status:** Accepted
- **Date:** 2026-10-19

## Context

Antigravity has its own agents, hook protocol and MCP dialect. Copying Gemini configuration would produce misleading output. Project skills also share .agents with Codex, so identical filenames would make owned multi-client installation impossible. The installed agy 1.4.2 reports version/help locally, but its agent listing could not bind a local port under this execution sandbox. That failure establishes neither native schema rejection nor successful discovery.

## Decision

- Render a closed plugin.json with name/description only. Keep package version, capabilities and integrity in wholeloop-artifacts.json. Use wl-agy- native names to coexist with Codex. Preserve canonical commands and source entrypoint markers.
- Use explicit documented tool lists, inherited models, mainAgent false and subagent true. Observers have no shell/write/memory/MCP/delegation tool and use commandExecutionPolicy off. Writable roles use sandbox. Extra role work returns to the main session sequentially; unavailable structured questions become exact plain-text options awaiting human answers.
- Install user overlays in the documented CLI plugin root under .gemini/antigravity-cli/plugins/wholeloop; keep the core/resources and ownership in the external store. Project overlays use .agents/skills, agents and hooks.json. Treat project hooks.json as a shared file: refuse existing unowned or edited bytes instead of merging another person's hook policy. Standalone plugin output remains independently available for native installation.
- Emit the native named hook map and camelCase toolCall/workspacePaths protocol. The shell-quoted inline bootstrap embeds the core hash and validates the bounded artifact manifest and core before invoking guard before-tool. User overlays bind the exact external root; project hooks resolve workspace-local distribution, while standalone plugins can resolve the documented native user plugin root. Missing/ambiguous context or changed core fails closed. Never interpolate an untrusted native plugin-root variable into shell text or guess a core on PATH.
- Keep policy in the deterministic guard. Native allow delegates to subsequent hooks/default policy; never emit permissionOverrides. Preserve bounded stdin, process deadlines, redacted failures and no raw payload persistence.
- Render unapplied MCP mcpServers entries with serverUrl for HTTP and command/args for stdio. Delegate OAuth discovery to the client. Reject header recipes because native environment expansion has not been established; never embed credentials.
- Extend fresh standalone conformance using agy and a documented stream-json user event on stdin. Keep simulation distinct from live process/journal evidence. Version/help checks and authored payload tests do not prove native activation, protocol semantics, permissions, model execution or authenticated MCP tools.

## Rejected alternatives

- Reusing Gemini schemas or literal extension-root shell substitutions: wrong native contracts or unsafe paths. Resolve a pinned core independently instead.
- Sharing wl-prefixed filenames with Codex: different owners would collide.
- Editing a preexisting project hook map: policy merging needs a separate explicit ownership design; refusing it preserves existing configuration.
- Broad shell access for observers or eager execution for writers: native policy remains meaningful alongside the wholeloop guard.

## Sources

Official [plugins](https://www.antigravity.google/docs/plugins?tab=cli), [subagents](https://www.antigravity.google/docs/subagents), [hooks](https://www.antigravity.google/docs/hooks), [MCP](https://www.antigravity.google/docs/mcp) and [headless JSONL](https://www.antigravity.google/docs/cli/headless/) documentation, checked 2026-10-19. Actual native activation remains owner verification.
