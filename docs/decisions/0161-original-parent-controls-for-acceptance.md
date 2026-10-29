# 0161 — Original parent controls for acceptance

- **Status:** Accepted
- **Date:** 2026-10-29

## Context

An owned Docker transport bounds its native operations, but an API case also executes HTTP requests outside those operations. A case-local timeout alone can outlive the runner stage that authorized it. Propagating only the Docker deadline would leave that request and late artifact capture outside the original parent control.

## Decision

Allow the fixed acceptance controller to capture an optional original parent deadline, abort signal and live-ownership predicate. Copy and freeze those bindings so reuse of caller options cannot renew the window. Preserve the ordinary unconfigured domain API.

Require current parent control at existing authority checks, after asynchronous boundary observation before budget mutation, and immediately before host dispatch. Set each original case deadline to the narrower existing case/run/attempt limit and captured parent deadline. Propagate parent cancellation into the case signal, retain the existing bounded host-stop path, and poll live ownership with the existing authority watcher. Late capture and passing results must satisfy the same parent control. Retain original interrupted/unknown receipts instead of retrying them.

The integrated verifier passes this captured control to its fixed acceptance host. It rechecks it before and after boundary reads and before retaining an aggregate report. An already fenced parent is refused before starting boundary observation or dispatching another case. Native Docker calls still require their original owned environment scope; this option does not replace that scope. Original case/report metadata readers remain independent of dispatch authority, so cancellation does not erase history. This plumbing does not establish original native scope ownership, current whole-product QA or a complete public runner route; those still require composition.

## Alternatives rejected

Bounding only Docker operations misses HTTP execution. Renewing the deadline per case expands the original controller allowance. Keeping a mutable caller options object permits later work to replace that allowance. Relying only on a polling interval misses post-await accounting and dispatch races. Disabling metadata recovery when the parent expires makes safe paused inspection impossible.

## Verification

Exercise cancelled, expired, fenced and malformed controls before dispatch; repeat parent loss after asynchronous observation and require no budget/journal mutation. Check the original narrower deadline despite caller mutation, active cancellation/expiration/fencing, late capture refusal and an actual in-flight loopback HTTP request. Preserve the existing acceptance regression and original integrated Docker cases. The combined evaluation uses captured parent control, refuses a fenced parent's new execution without Docker reads or journal changes, then reopens original history and retires its exact environments. Record actual results before committing; keep authenticated-client and independent Linux application-host acceptance separate.

All thirteen directed controls pass on macOS Node 24, including actual HTTP cancellation and active expiration. All twelve actual combined Docker controls pass and retire both exact environments. Complete isolated Linux checks pass 3359 tests in 177 files and all remaining checks. These observations establish the parent-control plumbing; original native-scope/current root-QA composition remains separate.
