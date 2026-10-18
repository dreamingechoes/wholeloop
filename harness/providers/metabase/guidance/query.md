# Metabase evidence

- Override the example endpoint with the actual instance before connecting; the admin must enable MCP.
- Authenticate as a read-only user and inspect permitted databases, tables and saved questions.
- Use query for read-only table/metric results; construct_query/execute_query can supply the query handle.
- Preserve database/question IDs, native query or MBQL, parameters, timezone and date boundaries.
- Follow continuation tokens and report the server's result cap rather than treating a page as all rows.
- Do not edit a saved question or create a dashboard during evidence collection.
- Cite the question/query reference and keep unavailable permissions/data as owner-assigned open questions.
- [Official reference](https://www.metabase.com/docs/latest/ai/mcp)
- Mapping checked: 2026-10-18. Instance endpoint and live permission checks remain pending.
