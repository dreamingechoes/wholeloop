# 0090 — Explicit nightly native model selection

- **Status:** Accepted
- **Date:** 2026-10-22

## Context

The nightly host passes a reviewed OpenAI model through OPENCODE_CONFIG_CONTENT,
a V1 configuration mechanism. V2 has a different configuration surface; an
unverified legacy injection must not silently choose a different model. Both
documented CLI dialects support run --model. Actual installed OpenCode 2.1.1
help confirms the flag; help initialization itself needs an isolated home.

## Decision

Carry the non-secret model identifier from the nightly host through the scoped
WL_CONFORMANCE_OPENCODE_MODEL environment value. Before any native probe, validate
the closed OpenAI identifier grammar and supply it as a separate --model argument
to the OpenCode recipe. Preserve V2 standalone and all existing permissions.
No identifier means no selection: local trials keep their current model/account.
Other clients ignore this OpenCode-specific host input.

Keep the selected native credential only in the child environment, never in argv,
configuration files, results or receipts. The nightly host still starts with a
clean environment and one selected key. No personal native configuration changes,
arbitrary config injection, automatic account switch or fallback model is added.

## Alternatives rejected

Writing a new native config for a single value adds ownership and merge concerns
without benefit over a documented flag. Relying on a V1 environment mechanism
leaves V2 selection unverified. Choosing an available model automatically changes
the owner's intended cost/access policy. Passing credential data in argv exposes
it unnecessarily; the model identifier and authentication are separate inputs.

## Verification

Synthetic V1/V2 processes verify the exact model argv and environment-only key,
unchanged default recipes and V2 standalone selection. Invalid identifiers refuse
before even the version binary launches and never appear in retained failures.
Nightly transport fixtures check both channels and absent config injection.
Actual --help is observed; this does not establish authenticated nightly model
access, billing, service semantics or Actions activation.

Primary sources checked 2026-10-22: [V1 run flags](https://opencode.ai/docs/cli/#run)
and [V2 run/CI usage](https://opencode.ai/v2/docs/cli/commands#run).

[◀ Decisions index](./README.md)
