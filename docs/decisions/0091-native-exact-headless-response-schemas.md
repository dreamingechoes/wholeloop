# 0091 — Native exact headless response schemas

- **Status:** Accepted
- **Date:** 2026-10-22

**Amended 2026-11-14.** The native generation subset dropped a string's `pattern` without trace, while the core still enforces it on readback. A live Codex 0.166.0 builder on `gpt-6.1-sol` returned an artifact ref outside `artifacts/`, and the proposal was refused at `proposal.artifacts[].ref` after 138 seconds. The generation schema now carries each dropped pattern as a `description` naming the regular expression. Codex accepts that keyword in structured output and followed it in a one-call probe. The core validator is unchanged. Rejected: passing `pattern` itself, which this subset never relied on and no client was observed to enforce.

## Context

Two actual Codex six-lens attempts each return five invalid replies and one accepted reply, with no repository edits. A bounded observer confirms valid JSON without the required envelope identity in five responses. The host correctly refuses them. Asking for JSON in prose does not ensure a model retains the outer assignment/run/round envelope instead of returning only an inner result.

## Decision

Derive a closed native output schema for each inspection/refutation, binding exact assignment digest, run, round and unit or finding/verifier. Codex receives it through its documented --output-schema flag. Stage only the small non-secret schema in its unique external worker directory, through the existing complete batch preflight. Keep credentials and private prompt/review contents off disk.

The native generation subset requires every object property and forbids extras. Derive it from copies of the existing gate schemas; retain enums, omit metadata and generation-unsupported semantic constraints, and require a reason for both completed and unavailable inspections. Read-only workers cannot emit a suite execution status. The unchanged core validators still enforce nonempty observed evidence, meaningful findings, exact identity and refutation semantics. Native schema compliance is not semantic truth or authorization.

Clarify the existing prompt's complete envelope requirement for every client. Other native recipes keep their transport behavior. No public gate, command or worker receipt declaration changes; the staged schema is an internal per-assignment generation constraint, not a replacement public contract.

## Alternatives rejected

Accepting a bare result and adding missing identity afterwards removes the cross-assignment boundary. Searching arbitrary prose for JSON or retrying models until one fits hides failures. Copying the public schema without adapting optional properties does not satisfy the native strict-generation subset. A separate API client or SDK would duplicate native authentication and increase dependencies.

## Verification

Pure cases cover exact inspect/refute identities, strict object shapes, unmodified public schemas, stale/bare/extra/wrong-unit replies and continued semantic rejection by the core. Compiled PATH fixtures require the exact staged schema and native flag. Existing-file/link refusal preserves sentinels. Actual Codex 0.163.0 help exposes the flag. A fresh actual six-lens review through the compiled CLI on core 9ea3a298 passes in Codex 0.163.0: gate-35be1f516f42cb8c has six successful workers, no missing coverage and an unchanged repository. The first compiled trial used an unsupported --store option in the external probe and launched no worker; correct only that probe and use a fresh fixture. Earlier failed rounds remain failed. Real refutation/verification quality, adversarial tool isolation, other clients and Linux native models remain separate acceptance checks.

Primary sources checked 2026-10-22: [Codex structured outputs](https://learn.chatgpt.com/docs/non-interactive-mode#create-structured-outputs-with-a-schema) and [the native JSON Schema subset](https://developers.openai.com/api/docs/guides/structured-outputs#supported-schemas).

[◀ Decisions index](./README.md)
