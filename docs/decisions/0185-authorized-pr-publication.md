# 0185 — Authorized pull request publication

- **Status:** Accepted
- **Date:** 2026-11-01

## Context

A `to-pr` route ends `acceptance → publication → handoff`, but nothing could publish. The legacy `open-pr` workflow publishes a draft only after a person records testing of the exact plan, and that must not change. An unattended run needs to publish from delegated acceptance without pretending that a person tested anything, and without overwriting remote work it does not own. The effect ledger already records one intent per effect, issues it once and resolves a lost response by reading, never by writing again.

## Decision

Add a fixed publication adapter, `RunnerPublicationStages`, for the `publication` stage and the `to-pr` route's `handoff`, registered with the dispatcher.

- **Acceptance union.** Publication reads the current accepted product through the same proof as the local handoff: delegated machine acceptance under the run's grant, or a person's recorded acceptance where intervention is permitted. The PR text says which one it is; machine acceptance is stated as not human testing. Old `pr.tested` events keep their meaning, and the legacy workflow is unchanged.
- **Targets.** Each repository publishes the accepted candidate's exact head on its owned `wl/` topic branch, against the plan's target branch, through the grant's named remote. A target branch, an unknown repository, a missing remote or an abbreviated head is refused.
- **Effects.** Per repository, in order: `git.push`, `pr.create` and, only when granted, `pr.ready`. Each step is one ledger effect with its own intent and observation. Before each step the adapter reads the remote completely. A remote tip other than absent or the exact head, an open PR it does not own, two owned PRs or an owned PR at another head stops publication without a write. Pushes pin the object and never force. Ownership is a run and repository marker in the body; another PR is never edited.
- **Lost writes.** A lost response is reconciled by reading the remote tip or the PR set. An interrupted publication is never continued; once its effects are observed, the stage ends honestly.
- **Endpoint.** The handoff records the current publication, and the endpoint is `ready-pr` when the ready transition was granted and observed, else `draft-pr`.
- **Merge.** `to-merge` routes stay refused before dispatch (`dispatcher-merge-unavailable`) until revision-bound CI and eligibility exist (P6-21–P6-24).

A fixed `RunnerCodeHost` interface carries the reads and writes. `GithubCliCodeHost` implements it with the installed `git` and `gh` clients and their own credential stores; other hosts stay unsupported until a reviewed client offers the same semantics. The public host still composes no adapter.

## Alternatives rejected

Writing `pr.tested` from a machine decision would make old receipts claim human testing. Force-with-lease would turn a competing writer into an overwrite. Updating an existing PR's title or body would silently replace external edits. Retrying a write after a lost response could create a duplicate PR.

## Verification

- Table-driven publisher cases on a stub code host and the real effect ledger cover a draft and a ready publication with one write each, refusal of a competing writer, a foreign PR, two owned PRs, a changed snapshot and an unreadable remote, and reconciliation of a lost push, create and ready response without a second write. Readying is refused after someone moves the PR, and nothing is written without authority or after revocation.
- Stub-executor cases check that the GitHub CLI host pushes the pinned object without force, reads complete PR sets, creates only drafts, readies only its own repository's PR and refuses other hosts.
- The Docker-backed runner evaluation in `--publication` mode joins real product QA and delegated acceptance to one owned ready PR and a current `ready-pr` endpoint on the stub host. Re-inspection repeats no write.
- The legacy `open-pr` cases still require a person's exact-plan testing.

No hosted code host was used; GitHub semantics remain unverified.
