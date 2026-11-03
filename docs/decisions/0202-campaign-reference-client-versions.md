# 0202 — Campaign reference client versions

- **Status:** Accepted
- **Date:** 2026-11-03

## Context

Native delivery recipes admit exactly one version per reference client. The pinned pair was Claude Code 2.1.307 and Codex 0.163.0, the versions observed when the recipes and the Codex boundary observer were written ([ADR-0120](./0120-observed-native-boundaries-and-asynchronous-admission.md)). For P6-27 the owner fixed the campaign's clients at the versions installed and signed in on the development host: Claude Code 2.1.316 and Codex 0.166.0. A run that binds another version is refused, so the pin had to move before any live trial.

A newer client can change behavior without changing flags. Codex 0.166.0 lists several features enabled by default that the recipe did not name. One of them, `tool_call_mcp_elicitation`, lets an MCP tool ask the user for input during a turn.

## Decision

- **Move the pin.** `REFERENCE_NATIVE_VERSIONS` becomes Claude Code 2.1.316 and Codex 0.166.0. Every recipe flag was checked against the installed help output of both clients. Recipes, policy digests and bindings follow from the constant; nothing else admits a version.
- **Disable three more Codex features explicitly.** The recipe now sets `tool_call_mcp_elicitation`, `image_generation` and `tool_suggest` to false. Elicitation is an interactive entry point, which a none-policy run must not reach even when no MCP server is configured. The other two are tools no assignment needs. This follows ADR-0120's rule of disabling entry points explicitly rather than relying on a client default.
- **Re-observe before trusting.** The six model-free boundary controls, for planner, builder and verifier with both output modes, ran on the installed Codex 0.166.0 and passed. The observer refuses a requested feature the client does not report as disabled, so it also confirmed that the three new names exist and are off.

The conformance pins in `test/conformance/pins.json` are a separate nightly baseline for generated harness files and are unchanged.

## Alternatives rejected

- Admitting a version range would let a trial run on a client nobody observed, and make three trials of one scenario incomparable.
- Keeping the old pin and installing older clients would mean evaluating versions the owner does not use.
- Leaving the new defaults alone would trust that an interactive feature stays unreachable without a configured server, which is a client implementation detail.

## Verification

Delivery unit tests pass with the new pin. The real model-free Codex controls (`npm run eval:native-boundary`) return six host-observed observations with every boundary property true and the workspace unchanged; no model was invoked and no account was read. Claude Code still has no boundary observer; that is the next P6-27 increment.
