# Notion

- Confirm the actual parent page/data source and writable properties from fetched schema.
- notion-create-pages creates content; use an existing page ID for notion-update-page.
- Every update first fetches the full page in the same read-modify-write operation.
- Preserve unrelated content and block references; prefer a targeted edit over replacing a whole page.
- Normalize complete fetched Markdown to ref/body/revision; truncation or hidden content blocks replacement.
- allow_async false requests a synchronous write. A returned async_task is still pending: poll it in the host.
- Record the page URL only on confirmed success. The core does not equate queued work with publication.
- Discover host aliases for fetch/search; OpenAI MCP clients can drop the notion- prefix.
- OAuth stays in the client store; do not create a plaintext integration-token config.
- Reference: [Official documentation](https://developers.notion.com/guides/mcp/mcp-supported-tools)
- Mapping checked: 2026-10-18. Live host/schema conformance remains pending.
