# 0114 — Private group-bound foreground bootstrap

- **Status:** Accepted
- **Date:** 2026-10-26

## Context

A durable stage journal does not own the terminal process that drives it. Losing that terminal must preserve the same controller, while a copied request or late old consumer must not admit a second one. An original parent can also die before spawning any native wrapper. Dispatch release and final stdout/stderr drain are different moments.

## Decision

Launch only the controller-selected installed core through the existing owned native wrapper, with the exact private lease supplied on bounded stdin. Retain a private invocation binding the original controller generation, store, nonce, executable path/hash, parent and original grant/run deadline. Publish the original parent/core record before the journaled claim becomes visible, so an interrupted pre-start claim remains attributable; orphan metadata grants nothing. Register the wrapper before sending input. The child verifies the unchanged private invocation/core, its actual membership in the registered process group and one-shot consumption before selecting any fixed host. Neither source text nor worker JSON supplies a program, host implementation or result import.

Fixed host selection is synchronous code construction; actual runtime preflight and stage operations remain bounded by their existing contracts. Unknown processes and domain effects keep their reservations. A failed controller setup ends none-policy honestly without a human question; it cannot leave a successful endpoint or silently start another attempt. Read final state from the authoritative journal rather than parsing the child's output as authority.

Keep the already registered group alive long enough to drain after dispatch release, while retaining original grants, budgets and generation checks. Fresh recovery requests cancellation through private nonce-bound files. Only the original live wrapper signals its own group. A missing native intent establishes not-started only after the exact original parent is positively absent; a live/reused/inaccessible parent or partial native registration remains unknown. Recover a prepared root even if the parent died before its journaled runtime registration.

The internal foreground transport accepts only a trusted caller's installed core. Public complete-route run/reconcile and fixed domain-host wiring remain P6-10 implementation work. The model-free evaluation deliberately refuses native application admission and cannot certify a model, real QA, publication or merge.

## Alternatives rejected

Loading a program or host module from request JSON would turn inert input into controller code. Accepting a nonce without actual process-group membership would admit a copied bootstrap outside its owned wrapper. Reusing a consumed input could create two live controllers. Treating a missing intent as termination while the original parent is alive races its first spawn. Cancelling immediately on dispatch release can truncate the final drain. Assuming no process exists after a partial registration loses potentially issued work.

## Verification

Exercise separate actual controller processes, one-shot/foreign-nonce rejection, changed core bytes, cancelled/pre-launch failures, private-owner/journal/cache publication failures, original parent loss before and after native intent, fresh private cancellation and same-run deadline retention. Repeat the model-free control on the minimum runtime and keep native/service acceptance separate. Twelve dedicated cases and complete checks pass: 2935 tests in 139 files on macOS arm64 and isolated Debian Linux arm64 with Node 24.22.0, plus all remaining checks. Three standalone model-free controls pass on macOS Node 24 and Linux Node 20.0.0/Git 2.39.5, including exact original-deadline retention; inert public schema output matches. None of these observations certifies native models or a complete implementation route.
