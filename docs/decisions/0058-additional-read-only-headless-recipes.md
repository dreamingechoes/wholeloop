# 0058 — Additional read-only headless recipes

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

The bounded process host already owns concurrency, stdin, cancellation, response identity and gate aggregation. OpenCode and Copilot have headless interfaces, but their permissions and final outputs differ from Claude and Codex. Reusing another client's flags or accepting any JSON found in stdout would conceal those differences.

## Decision

- Reuse the process host and aggregator. Add small native recipe modules with no independent retry, quorum or gate state. Continue to execute outside the project, with one fresh invocation per assignment and no resume, trust or bypass flags.
- OpenCode uses run --pure with JSON events and an inline primary inspector named from the unique worker directory digest. Set deny-default global and agent permissions, permit read/glob/grep, retain native dotenv read denials and permit external-directory access only to the named repository. Refuse wildcard-bearing repository paths because native permission patterns have no documented literal escape. Override inherited inline permissions/config selectors; keep native credentials in their own store. Disable sharing, snapshots, LSP and updates.
- Require OpenCode's final step to finish with stop. Collect completed text parts only from that step's message and session, including text arriving after the finish event. Reject error events, incomplete turns, mixed sessions and malformed JSONL. Do not interpret tool output or an earlier assistant message as the result.
- Copilot exposes only view/glob/grep and grants read explicitly. Deny shell, write, URL and memory operations; disable built-in MCP, automatic updates, custom instructions, experimental features, remote export and implicit temporary directory access. Force ambient allow-all and prompt-extension opt-ins false.
- Use Copilot silent text output: the shared host must parse exactly one JSON envelope with the existing assignment identity and gate schema. Native JSONL progress has a different contract; do not guess a final event or extract JSON from diagnostics. Authentication remains native and is never copied to files.
- These are tool boundaries, not hermetic client startup. OpenCode merges native user/managed config; Copilot can load already-trusted folder hooks and custom MCP configuration. Disabling model access to a tool does not prove that a server never starts. Actual policy, startup effects, logging and read-only sentinels remain owner conformance checks, separate from synthetic process coverage.

## Alternatives rejected

Broad allow-all flags would remove permission prompts but unnecessarily authorize more than inspection. A global OpenCode built-in agent can inherit unrelated role policy, so use a separate per-worker primary agent. Empty merged MCP objects do not remove inherited servers; do not describe them as isolation. Replacing HOME would break native authentication and invite plaintext token copying. Parsing the last JSON-looking substring could count a tool's text as model evidence.

## Verification

Installed OpenCode 1.17.9 and Copilot 1.0.83 help/environment metadata were inspected without invoking models. Synthetic PATH clients execute all four compiled recipes; parser tests cover message/session selection, missing completion, error, malformed, mixed and truncated output. Existing process failure, identity, cancellation and gate parity tests still apply. No actual model or authenticated service ran.

Native contracts: [OpenCode CLI](https://opencode.ai/docs/cli/), [config precedence](https://opencode.ai/docs/config/), [permissions](https://opencode.ai/docs/permissions/), [pinned event producer](https://github.com/anomalyco/opencode/blob/v1.17.9/packages/opencode/src/cli/cmd/run.ts) and [Copilot programmatic reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-programmatic-reference).

[◀ Decisions index](./README.md)
