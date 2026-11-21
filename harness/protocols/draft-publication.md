# Draft publication

- ⛔ `pr-tested-before-publication` — No host call that can push or create a PR before the exact current plan has explicit human test evidence and approval.
- ⛔ `pr-draft-only` — Accept only a complete matching open draft observation: same repository, source branch/SHA and target. Never mark ready or merge.
- ⛔ `pr-once-request` — Journal intent before the external call. A pending intent requires remote reconciliation, not another push/create attempt.
- ⛔ `pr-repository-convention` — Load the selected repository convention and require nonempty template sections; keep the pinned binding/content digest.
- ⛔ `pr-no-tool-attribution` — Apply the same authorship policy to PR text as commit messages; never append an assistant credit or generated-with footer.

Use gh/glab's existing credential store and stdin for JSON request bodies. Never copy a token to a config, temporary file, journal or argv. Preserve remote state on errors. Confirm actual access, server permissions and the current remote state before publication.
