# Jira

- Use the Atlassian Rovo MCP Jira tools and confirm cloudId/project before writes.
- Discover required issue fields and allowed transitions in the current site's tool schema.
- Carry the wholeloop ID and existing tracker key; an edit uses the existing key, never a new issue.
- Preserve unrelated description sections and field values; use the site's supported rich-text format.
- Resolve actual issue/transition/link type IDs rather than deriving them from names.
- Record the returned issue URL. Missing create/edit permission becomes a local handoff.
- OAuth belongs to the host. Never persist an API token in a manifest or fixture.
- Reference: [Official documentation](https://developer.atlassian.com/cloud/rovo-mcp/guides/supported-tools/)
- Mapping checked: 2026-10-18. Live site conformance remains pending.
