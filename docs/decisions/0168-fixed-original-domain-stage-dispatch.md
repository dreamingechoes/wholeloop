# 0168 — Fixed original domain-stage dispatch

- **Status:** Accepted
- **Date:** 2026-10-29

## Context

The runner's domain adapters now execute and recover individual stages, but composing them still requires controller-specific dispatch code. Dispatch must not trust a caller's stage kind, accept a structurally compatible worker host or send historical cancellation through a newly selected plan. Registration coverage also says nothing about native runtime availability or complete-route acceptance.

## Decision

Add one internal dispatcher with a closed registry of existing fixed domain adapter classes from the same external store. Copy registrations and host identity at construction. Resolve each issued stage from its authoritative invocation and original immutable plan revision; compare the complete current context before execution. Workspace and commit share the fixed Git adapter. Research and publication remain unsupported instead of falling back to implementation or local handoff.

Keep original execution context, signal, deadline and ownership predicate. Require an explicit controller-selected product request only for integration; reject it for other stages. The integration adapter remains responsible for current product proof, original consumption and owned effects. Dispatch adds no arbitrary stage callback, executable import, model-result-file option or runtime-selected adapter.

Route inspection and cancellation through the original revision without selecting new work. Preserve each adapter's private nonce-bound cancellation after revocation. Abort an observation if its captured signal is cancelled before or after the asynchronous read. Local endpoint observation delegates only to the fixed handoff reader. Report registration coverage separately from runtime preflight: this component does not advertise an executable public route, prepare product environments, select models or establish acceptance by itself.

## Alternatives rejected

A generic structural host registry admits a worker-supplied implementation with the same method names. Selecting from caller-provided kinds can dispatch a different domain under an existing invocation. Rebuilding the registry from source instructions or loading an executable/module from request text changes the trust boundary. Treating registered methods as available native capabilities hides authentication, containment and interactivity prerequisites. Requiring current authority for original cancellation strands owned work after revocation.

## Verification

Exercise actual exact-plan core execution and identical paused recovery, copied registration identity, cancellation, expiration, fencing, malformed deadlines, altered kinds/plans, foreign host/invocation/store, structural adapters, inherited registry names, missing adapters and misplaced product requests. Compose actual disposable Git/Docker QA, independent synthetic acceptance and local handoff through the fixed dispatcher while retaining the original assertions, failures, limits and retirement controls. All 25 directed dispatcher/plan cases pass on macOS Node 24.22.0. Complete isolated Linux arm64/Node 24.22.0 checks pass 3429 tests in 182 files and every remaining check on the frozen source recorded in the journal. All 791 production/unit files remain byte-identical after the later evaluation-only ordering correction. The resumed actual trial passes all eleven controls with frozen bundle 692a604a8caa8f6235de08b43722166a9035aaf42b37e6a625a80904f29a550b: original product QA, independent synthetic acceptance, current local code-ready, lost/changed proof refusals and identical restoration, paused recovery and exact retirement of both environments. Earlier deadline refusals and the owner-interrupted trial remain historical; no original invocation is renewed. Full runtime configuration/preflight, environment preparation, supervised acceptance, repair continuation, research, hosted endpoints and public foreground composition remain technical work. Synthetic workers do not certify authenticated models or independent Linux application-host acceptance.
