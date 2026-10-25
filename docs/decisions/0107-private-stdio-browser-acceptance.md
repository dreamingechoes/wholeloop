# 0107 — Private stdio browser acceptance and grounded observations

- **Status:** Accepted
- **Date:** 2026-10-25

## Context

A screenshot can look correct while the application never writes to its backend. Browser actions require a real reviewed tool host, current page context and objective assertions. A browser MCP listening on the application network would expose a control endpoint to the untrusted application: a controller-side tool whitelist cannot prevent a second client from opening its own session and invoking a broader server tool. Host and origin filters do not authenticate that control channel.

## Decision

1. Reuse the official MCP SDK and a digest-pinned Playwright MCP image. Fix the selected native tool constraint schemas and observed engine version. Negotiate every selected tool before actions; a tool-list notification permits bounded schema rediscovery, never replay of an action already dispatched. Treat missing or changed constraints, incomplete inventories and unstable negotiation as unavailable. Ignore descriptive prose when hashing schemas while preserving actual properties named title or description.
2. Start the owned browser container with only a loopback liveness probe. Give it no workspace, credentials, persistent user profile or public MCP listener. Open the actual MCP server through an exact-owned registered Docker exec private stdio pipe. The application can reach neither that pipe nor the controller's Docker socket. Keep the existing nonroot, read-only, dropped-capability container policy and isolated application network. Chromium uses the container reference's no-sandbox flag; the Docker boundary remains required and is not equivalent to Chromium's internal sandbox.
3. Add exec-only operation version 2 without changing version 1. Register the actual native wrapper before any bootstrap or protocol bytes. Preserve its real PID, argv, working directory, timestamps and exit independently of the browser application's unobserved process metadata. Release a serial environment exec lease only after the private child finished successfully, the wrapper group is absent and the exact owned daemon container has no active exec. Unknown actions remain unresolved; use private live cancellation and existing permanent lifecycle fencing, never signals to stored PIDs.
4. Pin closed finite journeys inside the existing acceptance plan. Ground control names in selected hashed source/design inputs and unique fresh native accessibility references. Require a single current owned tab and exact expected URL after every action. Support explicit navigation, fill, click, finite keys, reload, fresh contexts, owned app restart, native text checks and labelled PNG captures. Expose no arbitrary browser script, selector, API state injection, remote URL or user profile import.
5. Keep complete native tool errors, bounded output and cancellation separate from objective mismatches. Require each state assertion to have one actual native check. Backend persistence requires an actual restart, fresh browser context, subsequent UI check and a separately observed owned backend JSON assertion. Never infer persistence from a screenshot or an in-memory UI. Capture at most four complete labelled PNGs and twenty MiB per case through existing verified artifact accounting; screenshots remain supporting evidence.
6. Reuse the P6-15 effect/authority/candidate/deadline host for API, CLI and browser execution. Keep existing acceptance ordering and stable-key reuse. The private controller, source functions and external store remain trusted. This increment establishes neither independent private evaluation, arbitrary semantic truth, coding-client certification nor universal browser security.

## Alternatives considered

| Option | Why rejected |
| --- | --- |
| HTTP MCP on the shared application network | The untrusted app could create its own control session and bypass the controller whitelist |
| Reimplement a browser automation framework | Duplicates an available reviewed MCP capability and creates another protocol to maintain |
| Allow evaluate or arbitrary browser code | Can manufacture UI/backend state instead of exercising the declared public interaction |
| Reuse a person's browser or authenticated profile | Crosses the owned application and credential boundary |
| Accept a screenshot or model statement as persistence proof | Cannot distinguish cosmetic state from durable backend behavior |
| Retry uncertain UI actions after reconnect | Can repeat writes whose first outcome is unknown |
| Change the old operation schema in place | Breaks existing closed receipts and recovery contracts |

## Verification and limits

Unit tests cover schema binding, absent tools, inventory changes without action replay, original cancellation/deadlines, foreign/stale contexts, ambiguous references, literal empty input, complete bounded captures and native duplex process closure. The opt-in evaluator uses actual isolated Chromium, a cosmetic task app, a corrected durable app, real form interaction, restart, fresh context and backend reads. Report the controller, daemon and retained failures separately. No model, vendor account, hosted mutation, publication or actual project merge is required.

[◀ Decisions index](./README.md)
