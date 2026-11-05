# 0213 — Complete bodyless CI feedback

- **Status:** Accepted
- **Date:** 2026-11-05

## Context

A retained CI failure proves an original code-test result, not the absence of current PR feedback. A missing read, a partial page or a moved head cannot become an empty comment set. A correction preflight also needs cancellation of its own in-flight code-host read without trusting a retained process identifier.

## Decision

Add an optional fixed feedback reader to the installed code-host adapter, with its own closed `wholeloop/delivery-ci-feedback@1` identity. Keep existing public declarations unchanged. The GitHub implementation uses only fixed relative GET endpoints for issue comments, inline review comments and reviews. Read the exact open PR/head/base before and after pagination. Bound each source to three pages of one hundred entries; a full final page, duplicate identity, malformed response, denied read or cancellation refuses completeness. This conservative cap may refuse a large PR; it never certifies a truncated set as complete.

Project responses in memory into hashed identities, source, revision and adoption flags. Raw bodies, authors and instruction text never leave the adapter. Commit-bound inline comments and reviews retain their host commit; issue comments and missing commit associations bind conservatively to the currently observed head. Deleted authors remain unadopted. Empty positive or neutral reviews contain no message; a changes-requested review remains feedback even without text. Every retained item is unadopted. The adapter neither interprets instructions nor approves work.

Forward the caller's abort signal to the original shell-free command executor. Refuse an already aborted invocation before spawning, stop only the original in-memory child group, and wait for closed stdio before rejecting. Keep the existing finite command timeout, output cap and CLI credential-store behavior. Never signal a stored PID or retain raw command output.

This increment supplies a read capability, not an automatic CI repair route. A future fixed correction preflight must bind the complete observation to its exact owned PR and current grant, and publication must independently recheck current facts. Existing unsupported adapters remain unsupported; there is no empty-feedback fallback.

## Alternatives rejected

An empty default would hide unreadable feedback. Retaining raw bodies would expose private discussion to state exports and invite treating comments as commands. Guessing issue-comment commit associations could silently ignore current feedback. Unlimited pagination would remove a deterministic bound. Reusing a historical feedback digest would supply no current host observation.

## Verification

Fixture controls cover complete pagination, truncation, duplicates, malformed and denied responses, deleted authors, commit associations, moved head/base, privacy and fixed GET paths. Actual local child-process controls verify zero launch after pre-cancellation and closed-process cancellation; these prove no native client/model account or hosted GitHub route. Current CI-origin execution and hosted acceptance remain open in P6-29 and P6-27.

The endpoint shapes follow GitHub's official [issue-comment](https://docs.github.com/en/rest/issues/comments#list-issue-comments), [review-comment](https://docs.github.com/en/rest/pulls/comments#list-review-comments-on-a-pull-request) and [review](https://docs.github.com/en/rest/pulls/reviews#list-reviews-for-a-pull-request) documentation. No authenticated API request is needed for these fixture checks.

[◀ Decisions index](./README.md)
