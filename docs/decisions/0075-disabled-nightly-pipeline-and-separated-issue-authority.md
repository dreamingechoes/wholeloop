# 0075 — Disabled nightly pipeline and separated issue authority

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

Version resolution, collection, matrix projection and issue delivery exist as
separate components. Wiring them into CI must preserve exact core/source/channel
identities without implicitly enabling model spending or issue notifications.
Raw native homes and model-visible credentials cannot become workflow artifacts.

## Decision

- Add a schedule/manual-only default-branch workflow behind an explicit owner
  variable, disabled by default. Keep separate native and issue environments and
  a second independent issue-delivery activation variable. Do not activate either
  variable, configure secrets, dispatch CI or send an actual issue in this change.
- Build/check the core once before native credentials exist. Transfer its immutable
  artifact ID and independently passed SHA-256 to every later job. Check artifact
  transfer integrity and exact core bytes before acquisition/collection/aggregation
  or issue verification. Do not rebuild or install source dependencies afterward.
- Provision only the selected client's pinned/latest pair per native job. Limit
  parallel native jobs to two. Keep downloads/installers credential-free; inject
  only the selected native key in the observation step, then reconstruct each
  channel's environment from a minimal allowlist and fresh external HOME/config/
  state/data/cache/temp paths. Do not forward CI/GitHub/other model credentials.
- Use documented native environment transports, non-secret private authentication
  mode settings for Gemini/Antigravity, and an explicit OpenAI model identifier
  for OpenCode. Missing credentials/model selection remain unconfigured with no
  scenario launch and UNRUN rows. Do not seed plaintext account-session files,
  bypass native trust/permissions or claim these native transports are verified.
- Upload only bounded consumed structural result fields and a source/core/run/
  attempt/client/result-digest receipt. Replace imported limitations with a fixed
  evidence boundary. Keep native prefixes, homes, journals, drafts and raw logs
  outside the upload directory. Reject extra/missing/linked artifact entries,
  mismatched identities/digests, wrong clients and reused channels before delivery.
- Aggregate all seven same-run/attempt artifacts with the exact core into original-
  date matrices, issue drafts and a regenerated owned page in an external artifact
  tree. Never mutate/push the source page automatically. Context/hashes establish
  pipeline consistency, not independently authenticated native report provenance.
- Give only the separate serialized issue job issues:write, with no model secret
  or native execution. Transfer the exact core/aggregate IDs and independently
  passed result digest, verify bytes before service access and use the explicit
  delivery host's complete inventory/currentness/partial-outcome safeguards.
  An acquisition/pipeline failure stops aggregation/delivery instead of inventing
  a missing client's success. Preserve owner protection and retry decisions.

## Alternatives rejected

A secret-bearing build/install step would expose model credentials to unnecessary
code. One job with model and issue-write authority would give native workers a
notification token. Shared native HOME/channel binaries would weaken version and
configuration isolation. Rebuilding before issue delivery would lose the exact
observed core. A pull-request trigger or default-enabled schedule would silently
authorize model execution. Automatically committing the matrix would introduce
remote source mutations and runtime observation persistence without owner review.

## Verification

Test selected provisioning/options, exact transferred core/context rejection,
seven native environment maps, fresh per-channel homes, non-secret settings,
unconfigured UNRUN behavior, structural field omission, actual compiled projection
and complete seven-client aggregation/page preservation. Mutate source/core/digests,
artifact membership/types, channels and run attempts and require refusal. Parse the
workflow and enforce triggers, operator switches, pinned actions, immutable core
transfer, credential-step scope, native parallelism, separate serialized issue
permissions and absence of publication/push steps. All native/GitHub transports
remain synthetic; Actions semantics, Linux, actual authentication/model settings
and issue delivery still need owner execution.

## Sources

- [Antigravity authentication](https://www.antigravity.google/docs/install?tab=cli)
- [OpenCode CLI environment](https://opencode.ai/docs/cli/)
- [Codex non-interactive authentication](https://developers.openai.com/codex/noninteractive/)
- [Cursor headless mode](https://docs.cursor.com/en/cli/headless)

[◀ Decisions index](./README.md)
