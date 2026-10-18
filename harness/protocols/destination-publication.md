# Destination publication

- ⛔ `docs-same-operation-read` — docs.update is unavailable through generic
  invocation. Fetch a complete body and revision for that exact reference inside
  the update operation, transform that snapshot and pass its revision to the host.
- ⛔ `repo-docs-contained-output` — repository publication creates Markdown only
  under docs/, refuses traversal/symlink escapes, and detects observed revision
  conflicts before replacement. Coordination state remains external.

Read provider guidance and the live tool schema. The host supplies credentials
and normalizes actual results. A queued operation is pending, not published.
Record external references only after successful completion. Preserve unrelated
content and stop on unreadable sections or unsupported formats.
