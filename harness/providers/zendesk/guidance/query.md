# Zendesk evidence

- This provider maps the official Search REST API through a host-managed curl invocation, not an invented MCP server.
- Require the actual Zendesk subdomain and a host-managed OAuth credential; never put a token in argv/config.
- Send GET /api/v2/search.json with a URL-encoded query constrained to type:ticket and explicit date filters.
- The host supplies authentication through stdin or its credential store and never echoes credentials.
- Follow pagination; split date ranges when the search cap is reached and preserve count/next-page metadata.
- Keep ticket IDs/URLs and distinguish customer statements from verified product behavior.
- Redact unnecessary personal data from evidence. Never reply to or modify a ticket during research.
- Search indexing can lag; missing records and permission failures become explicit owner-assigned questions.
- [Search API](https://developer.zendesk.com/api-reference/ticketing/ticket-management/search/)
- Mapping checked: 2026-10-18. Live subdomain/auth normalization remains pending.
