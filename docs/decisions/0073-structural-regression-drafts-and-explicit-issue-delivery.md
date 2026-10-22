# 0073 — Structural regression drafts and explicit issue delivery

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

The matrix identifies comparable pinned/latest regressions, but an issue still needs reviewable prose, a stable identity and a delivery boundary. Copying raw native output or fixture paths would disclose unnecessary information. Treating an incomplete issue inventory as empty would create duplicate notifications.

## Decision

- Add a pure issue projection over the existing bounded matrix. Keep only fresh comparable successful native processes with pinned PASS/latest FAIL, matching source/core/scenario and named failing assertions. Preserve original observation dates. Project version/hash/assertion/run metadata, not private fields, journal paths, draft contents or raw process output.
- Give each draft the matrix's stable candidate key and an exact body marker. Keep title/body bounded and include both versions, observation/run identities, hashes, assertions and the evidence boundary. Require an explicit as-of time in the read-only CLI. Exit 4 for candidates and zero for none; send no message. Drafts authenticate no report and grant no delivery permission.
- Add a maintainer host defaulting to preview. Before proposing delivery, require the unchanged observation artifact and exact currently built core. Inventory repository issues in creation order, including open/closed issues and excluding pull requests. Project only matching marker keys/numbers through gh's JSON query; retain no raw API issue bodies. Stop before writes if the complete bounded scan exceeds one hundred pages of one hundred records or any API/shape check fails.
- Delivery requires explicit --write and the selected default-branch GitHub.com schedule/manual CI context. Observe actual repository/default-branch metadata. Context checks are not an authentication mechanism: the selected trusted workflow, operator activation and existing native GitHub credential permissions remain the authority. Do not create labels, change configuration or write credentials.
- Recheck the unchanged artifact's freshness at actual delivery time rather than refreshing observation dates. Skip an intact matching marker in any existing issue. Send the exact prepared body through stdin with body-file -, preserving newlines and keeping prose out of shell interpolation. Never put tokens in argv or files; do not forward GitHub tokens to the pure core subprocess.
- Return explicit per-key outcomes and retain completed outcomes after a partial failure. Do not automatically retry, close/delete issues or imply an atomic transaction. Serialize writers in the eventual workflow; GitHub has no atomic marker-based uniqueness across independent callers. Owner edits/removal of the marker and unrelated concurrent issue mutations remain outside that guarantee.
- Leave scheduled collectors, version resolution/acquisition and actual service activation to subsequent P5-04 components. Keep actual native and GitHub writes unverified while testing all host operations through local synthetic executables.

## Alternatives rejected

Sending on any FAIL would turn authentication/launch problems and simulations into version regressions. Searching only recent/open issues would miss prior closed reports. A partial inventory cannot establish absence; search results can also be incomplete. Copying full API bodies or native output is unnecessary for marker deduplication. Reusing old-core evidence after a rebuild would misbind the issue. Automatic rollback/retry could conceal an already created external issue.

## Verification

Test stable keys/dates, named failures, absent private fields, simulation/stale/ crashed exclusion and compiled explicit-time/regular-file/HOME boundaries. Preserve the existing matrix's malformed-code rejection instead of expecting a later layer to reject it. Exercise preview, complete pagination, closed-marker reuse, repeat delivery, wrong context/core, changed artifact, incomplete/failed inventory and partial outcomes through a local fake GitHub executable. Validate the actual query with local jq against closed issues and pull requests; it omits raw bodies. No real GitHub API request/message or native model is required by these checks.

## Sources

- [GitHub repository issues API](https://docs.github.com/en/rest/issues/issues#list-repository-issues)
- [GitHub issue creation](https://cli.github.com/manual/gh_issue_create)
- [GitHub CLI JSON formatting](https://cli.github.com/manual/gh_help_formatting)

[◀ Decisions index](./README.md)
