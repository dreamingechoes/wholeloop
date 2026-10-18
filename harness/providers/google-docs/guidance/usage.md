# Google Docs

- Use the optional Google Workspace CLI gws and its own encrypted credential store.
- The core declares operations; the host invokes gws with argv, --params JSON and --json request JSON.
- Create returns an empty document ID; insert content using read-modify-write before reporting publication.
- Get the full document (including tabs) and revisionId before every batchUpdate operation.
- Preserve structural elements and unrelated tabs; do not flatten a rich document into guessed plain text.
- Transform the fetched document into batch requests and carry writeControl.requiredRevisionId.
- A stale revision fails; re-read and review before retrying. Never suppress writeControl on conflict.
- Normalize the complete document JSON to ref/body/revision; body is the fetched JSON representation.
- Use the returned documentId to record `https://docs.google.com/document/d/<id>/edit`.
- Native Docs MCP currently exposes read/update only, so creation uses the optional CLI.
- References: [Official documentation](https://github.com/googleworkspace/cli)
- [API reference](https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/batchUpdate)
- Mapping checked: 2026-10-18. No CLI was installed; live auth/conformance remains pending.
