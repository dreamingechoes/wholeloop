# 0072 — Antigravity startup-gated observer workers

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

Antigravity's documented headless policy permits writes inside its active workspace by default. Shell-off or sandbox flags alone cannot establish an observer boundary. It accepts JSONL user input and reports an init record with workspace, tool names and permission mode, followed by step updates and a terminal result. Actual native startup/agent/hook activation still needs manual verification.

## Decision

- Add a private uniquely named primary observer with view_file/grep_search only, inherited model, no subagent role, shell execution off and no declared MCP, skills or plugins. Keep the worker outside the inspected repository, select that agent explicitly and enable the native terminal sandbox. Change no personal settings, HOME, authentication, model, trust or permission-bypass option.
- Add a private non-granting PreToolUse hook allowing only scoped reads/search. Validate native context and canonical read targets; deny writes, shell, web, MCP, delegation, permission requests, unknown tools and malformed input. Bound stdin/waiting and fail closed if Node is missing. An allow decision delegates to remaining native policy; emit no auto-approval or permission overrides.
- Extend the process transport with optional first-line readiness. Hold assignment input until a complete header, at most 64 KiB, passes the adapter callback. Keep the overall timeout/output/cancellation/process-group bounds. Missing, malformed, oversized or refused initialization cannot receive the assignment. Other recipes retain immediate input. Bound both logical and encoded assignment sizes.
- Require a single reported init for the exact external worker cwd, non-empty unique read-only tools and request-review/strict mode. Native startup must emit this record before receiving an assignment. Clients that wait for a prompt first time out without input; do not weaken the condition or send a bootstrap prompt. This is a reported native contract, not a cryptographic or hermetic attestation.
- Share the JSONL user-event encoder with framing conformance, preserving that existing input byte shape. For gate workers require one matching fresh SUCCESS result, one turn, no error, consistent conversation IDs and only documented intermediate step updates. Never accept an earlier result from a failed stream.
- Extend the closed policy path set with named hooks and a fixed observer-prefix/ sixteen-hex agent filename. Preflight every ancestor before creating directories or files; preserve private modes and existing output. Generic role policy may live on disk, while actual assignments and credentials stay off disk.
- Declare a local conditional headless recipe without claiming native acceptance. Keep startup hooks/logs, policy merging, agent discovery, pre-prompt init ordering, authentication/models, update behavior and external effects as manual checks. Missing readiness is an unavailable worker, never evidence against a finding.

## Alternatives rejected

Default native workspace permission or shell-off alone would still permit writes. Sending an assignment and validating init only after process completion would detect a bad tool surface too late. A probe prompt could already invoke tools. Replacing native HOME/settings or adding broad grants would change the policy being measured. Treating result text or a successful exit alone as a gate answer would ignore mixed sessions, errors and incomplete turns. Silent readiness fallback would reintroduce the unsafe native default.

## Verification

Test private agent/hook generation, namespace/path limits, scoped reads and denied mutation/MCP/delegation tools through actual hook commands. Exercise strict init and final-result decoding, malformed/mixed sessions and preserved old framing input. Run actual bounded processes with split UTF-8 readiness, refusals, absent/oversized headers, cancellation and deadlines; prove no assignment reaches refused processes. Exercise compiled fanout through a synthetic AGY client, a writer-init sentinel and an encoded-budget sentinel. Only the additive capability changes in the native golden tree. These are synthetic transport tests, not actual native activation or proof that installed AGY 1.4.2 emits init before input; that remains unverified.

## Sources

- [Antigravity headless protocol and permissions](https://www.antigravity.google/docs/cli/headless/)
- [Custom agent configuration](https://antigravity.google/docs/subagents?tab=cli)
- [Native hook contract](https://antigravity.google/docs/hooks)

[◀ Decisions index](./README.md)
