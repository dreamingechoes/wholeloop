# 0035 — Tested draft plans and once-only publication

- **Status:** Accepted
- **Date:** 2026-10-19

## Context

A machine PASS does not mean a person tried the change. A generic approval can also outlive a new commit, target or PR body. Publishing crosses a remote boundary: a lost response after pushing or creating a draft is not evidence that nothing happened. GitHub and GitLab also expose different draft and response shapes.

## Decision

- Prepare a concrete publication plan locally before asking for human testing. Pin clean checked-out named branch, commit, comparison target, snapshot, remote, provider, title/body and actual convention digest. Require repository template sections. Recognize GitLab MR templates as well as GitHub PR templates. Missing standalone ownership/base/title/body/provider becomes a question before mutation.
- Planned build items require current verify and review PASS; standalone publication reports that those gates were not run. Do not commit or switch branches implicitly. Authorized commits belong before final gates and testing, because gate snapshots deliberately include HEAD and index. Reject an empty branch or its own target.
- Record pr.tested with person, test note, exact snapshot and plan, plus the matching test-it decision. Neither opening an environment nor a bare generic approval is evidence of testing. Revised plans and code invalidate the old approval.
- Journal one pr.requested intent before calling the selected host. Completed calls reuse the observed PR; a pending request cannot be replaced/retried silently. Reconcile with a complete read of an observed URL. Accept only the same source SHA/branch, target and repository as an open draft. Preserve ambiguous/mismatched outcomes and never mark ready, request reviewers, close branches or merge.
- Built-in gh/glab hosts push the exact SHA to the named branch without force, then send API JSON through stdin using each CLI's credential store. GitHub uses draft true; GitLab uses its Draft title convention and verifies the returned draft flag. Do not fork or infer another remote. Require one credential-free HTTPS/SSH push destination; self-managed hosts and group paths remain explicit.
- Bound process time/output, terminate POSIX process groups, discard raw error payloads and normalize complete identities. Comments use a stable round marker and bounded read-before-post reconciliation; this is not a concurrent exactly-once guarantee. API hosts have no merge/ready/send operation.
- Record PR links locally and on a part's parent slice. Carry stored tracker and known sibling references into the body. Keep unavailable remote tracker writes and later sibling back-links explicit handoffs. Report the retained workspace; environment ledger integration follows in P3-09.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Reuse any old test-it decision | It can approve different bytes or a different draft plan |
| Push during preparation or worktree open | Crosses the publication boundary before human testing |
| Retry a failed create automatically | Can duplicate a remote write after a lost response |
| Pass bodies as CLI arguments or temporary files | Exposes content in process listings or durable files |
| Let CLI creation infer/fork/push | Hides remote/branch choices outside the pinned plan |
| Treat incomplete provider success as publication | Cannot establish draft status or the tested commit identity |

## Consequences

Plans and receipts remain outside repositories; source files and index stay intact. The state store cannot atomically commit a network operation, so physical interruption requires inspection. A failed request with no remote PR needs explicit owner recovery; there is no blind reset command. Custom hosts still own authentication and tool policy. Fork heads, nonstandard SSH ports and unbounded comment histories require an explicit host extension. Automated tests use real local Git/processes and synthetic HTTP-shaped responses; no authenticated push, PR, comment or tracker write ran.

## Links

- [GitHub CLI API and stdin](https://cli.github.com/manual/gh_api)
- [GitLab CLI API and stdin](https://docs.gitlab.com/cli/api/)
- [GitHub pull request API](https://docs.github.com/en/rest/pulls/pulls)
- [GitLab merge request API](https://docs.gitlab.com/api/merge_requests/)
- [GitHub issue comments](https://docs.github.com/en/rest/issues/comments)
- [GitLab notes](https://docs.gitlab.com/api/notes/)
- [Open PR](../flow/build/open-pr.md)
- [P3-07](../../roadmap/phase-3-build.md#p3-07--open-pr-and-code-host-providers)

[◀ Decisions index](./README.md)
