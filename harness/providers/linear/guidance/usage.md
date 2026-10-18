# Linear

- Use the official read-write Linear MCP endpoint and confirm the authenticated workspace/team.
- save_issue creates without an id and updates with the existing id; do not use retired create_issue aliases.
- Supply the real team identifier for creation and preserve the wholeloop ID in the description.
- Fetch the existing issue before editing. Preserve unrelated description and metadata.
- Resolve workflow states in the actual team before setting state; do not guess a status ID.
- Record the returned issue URL. Permissions or unavailable tools leave publication pending.
- Unsupported relationship mappings remain local; do not invent a tool name.
- References: [Official documentation](https://linear.app/docs/mcp) and [Official documentation](https://linear.app/integrations/slack)
- Mapping checked: 2026-10-18. Live account conformance remains pending.
