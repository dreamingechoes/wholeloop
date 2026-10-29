# 0164 — Owned browser product verification

- **Status:** Accepted
- **Date:** 2026-10-29

## Context

The fixed browser host uses private stdio MCP over an interactive Docker exec. It spawns a registered native wrapper directly because a request/response Docker call cannot carry a live MCP session. Wrapping only DockerTransport.call therefore misses that process. Treating a preprovisioned browser service as a new per-case container also loses the original execution identity.

## Decision

Expose an optional controller-only interactive registration capability on Docker transports. The original runner scope supplies the native CLI and claims an already registered exec through the same admission and PID checks used by ordinary registered calls. Claim before spawning; register the actual wrapper PID before sending bootstrap input. Preserve original scope deadlines, cancellation nonces, lost-owner refusals and all existing observation shapes. Escaped transports cannot claim work after their original scope ends. Fixture transports gain no native fallback.

Use an invocation-specific browser output directory for scoped sessions. Its exact command hash binds the exec to the original acceptance invocation even when multiple cases use the same browser service and origin. Standalone browser commands retain their existing shape. This namespace contains no secret and does not change the pinned MCP tools or expose a control endpoint to the application.

Extend root product recovery with browser-exec ownership only for browser/browser.journey. Reopen the pinned input, original browser service, invocation-specific command, actual PID completion and closed original scope claim. Require zero native client exit independently of the original objective verdict and screenshot artifacts. A screenshot or successful MCP exit cannot override a failed assertion. Keep the current unit/assembly vector and parent deadline checks. Historical inspection remains metadata-only after pause and retirement, without granting feature acceptance.

## Alternatives rejected

Adopting an exec after it finishes cannot prove who authorized or could cancel it. Inferring ownership from the browser container's provisioning attributes another stage's work to the runner. Replacing stdio with a network MCP server expands the application control surface. A global operation hook is unnecessary when the one private interactive transport can register explicitly. Using a shared command namespace allows one case's process receipt to be confused with another.

## Verification

Exercise pre-spawn cancellation, expiration, fencing and escaped-scope refusal, duplicate registration and original-client cancellation after revocation. Retain the existing call/read ownership controls. Run actual isolated Chromium success and objective failure through the assembled root candidate, retaining original screenshots and zero-exit client observations. Require paused/retired recovery, report/deadline substitution refusal and exact environment retirement. The three-file Mac regression passes 63 tests. Actual success and objective-failure modes each pass nine controls and retire both exact environments; the complete Linux snapshot passes 3382 tests and all repository checks. The journal records frozen scopes, exact bundles and the preserved capacity/deadline refusals. Authenticated models, independent Linux application-host certification, feature acceptance and public full-route composition remain separate boundaries.
