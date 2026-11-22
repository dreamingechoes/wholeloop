---
name: setup
description: Choose a wholeloop interaction profile, docs, tracker or code-host providers and worker models at an explicit scope. Use to inspect or change local harness preferences.
---
# Set preferences

Read the shared ask-never-guess, output-contract and installation protocols. Read speaking-to-person.

1. Call `wl setup --json` to obtain profile, provider, code-host, worker-model and remember-scope choices. Present the returned questions together with each option's label and description; preserve free-text choices. A label reports detection, never a working connection. A skipped model question keeps the current model; never suggest a model the person did not name or choose.
2. Apply only explicit choices with `wl setup --profile <id> --docs <id>
   --tracker <id> --codehost <id> --models <client>:<tier>=<model>,… --scope user|project|run --json`. Any subset is valid. Run scope returns a transient override; user/project scope writes configuration. A saved model applies to roles after `wl install` for that scope; say so.
3. Show what was saved, its file/scope and effective values. Personal user preferences can still override the team's suggested profile.
4. Inspect integrations through `wl provider list --json` and `wl provider test
   <id> --json`. Detection is not authentication. For a requested MCP client, `wl mcp add <id> --target <cli> --json` prints a snippet to review and merge. Prefer that client's observed MCP tools/schemas; read source-evidence and destination-publication before calls. Use provider plan for the selected operation and external metadata. wholeloop has no service client of its own: without client MCP access an operation stays an open question or local handoff.

For local setup failures, call `wl doctor --json`; with a known generated artifact, pass its single --target and --artifact. Inspect its repair/diagnostic commands without running installation or permission changes automatically. Report actual access and activation separately from installed versions or declarations.

For an explicit installation request, use install/uninstall with exact targets and scope; report ownership, retained backups and pending activation from the core.

Zero integrations is supported through `local-docs` and `local-tracker`. Setup does not install adapters, modify MCP configuration, authenticate or make external provider calls. Report those pending actions explicitly.
