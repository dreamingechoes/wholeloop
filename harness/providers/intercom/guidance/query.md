# Intercom evidence

- Confirm workspace region support and authenticate using the host-managed official MCP connection.
- Use search with object_type:conversations and explicit timestamps/filter DSL; fetch returned conversation IDs.
- Preserve the search query and starting_after cursor. A result page is not the full conversation population.
- Cite conversation links and distinguish customer reports from independently established product facts.
- Keep only necessary excerpts and omit unrelated personal data.
- Query/fetch only; do not create/update articles, send replies or change conversation state.
- Unsupported regions, missing permissions or incomplete conversation bodies become owner-assigned open questions.
- [Official MCP reference](https://developers.intercom.com/docs/guides/mcp)
- Mapping checked: 2026-10-18. Live regional/workspace conformance remains pending.
