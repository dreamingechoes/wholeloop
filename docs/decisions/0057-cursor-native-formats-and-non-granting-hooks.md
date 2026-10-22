# 0057 — Cursor native formats and non-granting hooks

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

Cursor accepts its own plugin format and the portable Agent Plugins format, with different component coverage. Its native role flag and hook responses also differ from the existing adapters. Sharing a command string containing a substituted plugin-root path would repeat the unsafe shell binding rejected for Gemini.

## Decision

- Generate the full .cursor-plugin/plugin.json manifest for skills, agents, rules and hooks, plus a separate root Agent Plugins manifest with its required canonical schema identifier. Keep portable metadata within the closed standard. The native manifest remains authoritative for Cursor-specific components; the portable manifest does not claim portable agents, rules or hooks.
- Add optional deterministic adapter artifacts for that extra manifest and the opt-in invocation rule. Include every emitted file in the integrity manifest. Keep native skill names within 64 characters, use checked relative launchers and preserve entrypoint routing markers.
- Render model inherit, is_background false and native readonly true for observers. Writable builder/conductor roles set readonly false. Retain canonical tier hints, observed provider evidence from the main session, sequential role handoffs and plain-text questions when a structured ask tool is unavailable. The native flag is not proof of actual provider/MCP isolation or model execution.
- Install owned .cursor skills, agents, one prefixed rule and hooks.json at user or project scope. Keep rules directories shared and preserve unrelated rules. Refuse an existing unowned/edited hooks.json before any selected target writes; do not merge another person's native policy. Reuse external ownership/backups.
- Bound receipt reads and writes at 4 MiB. A seven-client replacement can retain current, previous and replacement catalogs together; its legitimate recovery metadata exceeds the former 1 MiB cap. Preserve all catalogs rather than dropping recovery data. Oversized writes leave the last valid receipt unchanged.
- Emit preToolUse with failClosed true and a fifteen-second native deadline. Reuse bounded exact target/core validation. User overlays bind their exact external artifact; project overlays resolve their documented distribution from the native CURSOR_PROJECT_DIR environment. Standalone plugins require an explicit absolute CURSOR_PLUGIN_ROOT environment value. Never interpolate either root into shell text or infer a standalone plugin from a default directory.
- Return an empty native response when the deterministic guard allows a tool, so this hook does not grant native permission. Denials return permission deny and fixed user/agent messages. Preserve other clients' existing response formats. Honor Cursor Shell working_directory and protect reserved runtime paths from native Delete as well as Write.
- Add unapplied .cursor/mcp.json recipes using url for HTTP, explicit stdio and environment-reference headers. OAuth stays native; detection observes declaration metadata only. Map the cursor target to the actual agent executable for doctor and fresh framing. Send prompts on stdin, enable the native sandbox, retain normal trust/permissions and never add force, trust or MCP auto-approval flags.

## Evidence and limits

Native 2026.07.16-899851b version/help and its installed pure hook validators accept empty/deny responses and the native config shape without starting a client/model. Its installed prompt builder reads piped input when no positional prompt is given. Authored hook tests invoke actual copied cores; calendar pins and stdin transport also run through a synthetic agent process. Those checks do not establish native role discovery, readonly enforcement, plugin activation, authentication or model quality. Full owner conformance remains open.

## Rejected alternatives

- Only a portable manifest: the standard does not carry Cursor roles/rules/hooks.
- An allow permission response: a successful wholeloop policy check should not become a native permission grant. The observed validator accepts omission.
- Native root substitution in command text: safe root transport must remain data.
- Copying or merging shared native settings/authentication: ownership and activation remain explicit, separate from preparing usable files.

## Sources

Official [plugin reference](https://cursor.com/docs/reference/plugins), [subagents](https://cursor.com/docs/subagents), [hooks](https://cursor.com/docs/hooks), [MCP](https://cursor.com/docs/mcp), [CLI parameters](https://cursor.com/docs/cli/reference/parameters) and the [Agent Plugins manifest](https://agent-plugins.org/plugin-authors/manifest), checked 2026-10-20. Native contracts were inspected in the installed CLI; no third-party implementation is copied into wholeloop.
