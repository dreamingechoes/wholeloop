# Core-owned destination publication rules

- ⛔ `docs-same-operation-read` — docs.update is unavailable through generic invocation. Fetch a complete body and revision for that exact reference inside the update operation, transform that snapshot and pass its revision to the host.
- ⛔ `repo-docs-contained-output` — repository publication creates Markdown only under docs/, refuses traversal/symlink escapes, and detects observed revision conflicts before replacement. Coordination state remains external.
- ⛔ `core-no-service-network` — wholeloop opens no connection to a third-party service. Reach services only through the client's MCP connection or a command-line client the person installed, such as gh or glab.
