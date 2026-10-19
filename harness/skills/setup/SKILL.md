---
name: setup
description: Choose a wholeloop interaction profile and docs or tracker providers at an explicit scope. Use to inspect or change local harness preferences.
---
# Set preferences

Read the shared ask-never-guess, output-contract and installation protocols.

1. Call `wl setup --json` to obtain profile, provider and remember-scope choices.
   Present the returned questions together; preserve free-text choices.
2. Apply only explicit choices with `wl setup --profile <id> --docs <id>
   --tracker <id> --scope user|project|run --json`. Any subset is valid. Run
   scope returns a transient override; user/project scope writes configuration.
3. Show what was saved, its file/scope and effective values. Personal user
   preferences can still override the team's suggested profile.
4. Inspect integrations through `wl provider list --json` and `wl provider test
   <id> --json`. Detection is not authentication. For a requested MCP client,
   `wl mcp add <id> --target <cli> --json` prints a snippet to review and merge.

For local setup failures, call `wl doctor --json`; with a known generated artifact,
pass its single --target and --artifact. Inspect its repair/diagnostic commands
without running installation or permission changes automatically.
⛔ `diagnostics-observed-availability` — versions/declarations are observations,
not authentication, actual client discovery or model/permission conformance.

For an explicit installation request, use install/uninstall with exact targets and
scope; report ownership, retained backups and pending activation from the core.

Zero integrations is supported through `local-docs` and `local-tracker`.
Setup does not install adapters, modify MCP configuration, authenticate or make
external provider calls. Report those pending actions explicitly.
