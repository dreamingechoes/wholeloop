# GitHub Issues

- Use the official GitHub MCP issues toolset; confirm the connected account/repository.
- Require explicit owner and repo. For updates include issue_number; do not infer it from a title.
- issue_write uses method create or update; issue_read uses method get.
- Keep the wholeloop ID in the body and adopt its existing link before creating another issue.
- Preserve labels, assignees and unrelated text on update. Transition only to the requested issue state.
- Record the returned html_url as the tracker link. A tool error is not publication.
- OAuth and permissions belong to the host client; do not copy credentials.
- Unsupported relationship operations remain explicit local links, not guessed MCP calls.
- Reference: [Official documentation](https://github.com/github/github-mcp-server)
- Mapping checked: 2026-10-18. Live account conformance remains pending.
