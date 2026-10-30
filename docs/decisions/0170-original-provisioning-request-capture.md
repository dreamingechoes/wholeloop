# 0170 — Original provisioning request capture

- **Status:** Accepted
- **Date:** 2026-10-30

## Context

Provisioning validates authority and the selected recipe before awaiting backend preflight. The caller still owns the request object during that observation. Reading it again after the await lets a replacement key, run, recipe or workspace describe a different operation from the one originally checked. A regression reproduces this with the key alone: the existing backend records the replacement instead of the issued key.

## Decision

Deep-copy the complete request synchronously before validation or any asynchronous observation. Use that captured request throughout authority checks, preflight, effect admission, resource identity and setup. Keep cloning within the existing invalid-request error boundary so unsupported inputs do not expose internal exceptions. Preserve the public schema, original parent bounds, operation outcomes and independent service lifetime.

This closes input aliasing in the existing backend. It grants no root producer ownership, runtime capability or semantic acceptance and does not complete runner environment preparation.

## Alternatives rejected

Revalidating the caller's later object changes the original operation and may select another authorized input silently. A shallow copy retains aliases to nested workspace records. Freezing the caller's object changes external behavior and leaves aliases elsewhere; capturing a private copy preserves the existing API.

## Verification

Reproduce the replacement-key failure before changing production code, then require the original resource key and effect intent after asynchronous fixture preflight. Retain all existing backend and lifecycle assertions. Extend the real Docker parent-control evaluation to mutate its caller-owned key after an actual backend observation and require the original key, while retaining every existing isolation, failure and retirement control. Record directed and complete verification results in the journal; fixture tests do not certify native accounts or independent Linux application-host acceptance.

The regression fails on the original backend and all 69 directed Mac cases pass after capture. The real Docker evaluation passes all 21 controls and retires its exact owned resources. Complete isolated Linux checks pass 3441 tests in 183 files and all remaining checks on archive 9b95c1fca9eb65772071a6816287187c97cd68be79868bf673c6c29d4b545550. Only final evidence prose follows that snapshot.
