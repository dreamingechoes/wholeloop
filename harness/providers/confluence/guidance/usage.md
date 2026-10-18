# Confluence

- Confirm cloudId, space and parent content identity through the connected Rovo MCP schema.
- Create page content only in the requested location; retain the wholeloop ID and returned link.
- Every update uses the core read-modify-write helper: getConfluenceContent first in the same operation.
- Preserve unrelated sections and macros; transform the fetched representation, not a guessed blank page.
- Carry the fetched version into the update where the live schema supports optimistic concurrency.
- A version conflict requires another read and review; never retry a blind overwrite.
- Normalize a complete read to ref/body/revision; truncated or permission-redacted reads block writes.
- Record the returned page URL only after a successful synchronous result.
- Reference: [Official documentation](https://developer.atlassian.com/cloud/rovo-mcp/guides/supported-tools/)
- Mapping checked: 2026-10-18. Live page-format conformance remains pending.
