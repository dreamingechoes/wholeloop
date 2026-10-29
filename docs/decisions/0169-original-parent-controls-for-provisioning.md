# 0169 — Original parent controls for provisioning

- **Status:** Accepted
- **Date:** 2026-10-29

## Context

An environment's grant, setup limit and readiness limit do not establish that its enclosing runner stage is still allowed to prepare resources. Preflight also awaits native observations before reserving an effect. A cancelled or replaced controller must not turn those late observations into a new reservation, resource or positive result. Resource lifetime remains separate: a successfully prepared service may be needed by later authorized QA stages.

## Decision

Allow the existing provisioning API to capture an optional original parent deadline, signal and ownership predicate. Copy those fields and retain the original predicate, including its receiver, rather than observing later property replacements. Refuse cancelled, expired, malformed or fenced parents before selecting inputs and again after asynchronous preflight, before reservation and resource admission, at effect eligibility/invocation and before returning a result.

Bound every configured provisioning transport call by the narrower original parent and caller limits. Relay both captured cancellation signals, poll live ownership, preserve native registration/process callbacks and recheck after the call. A failed observation cannot start another backend operation or become a positive late result. Persist the narrower setup deadline; preserve the independently bounded resource lifetime and original operation outcomes for later inspection and explicit lifecycle control.

Keep the unconfigured transport and standalone behavior unchanged. The control is controller-internal and adds no CLI input, grant, recipe permission or semantic acceptance. Root producer ownership and complete-route environment composition still need their own original scope audit. Read-only recovery and retirement remain separate APIs; a new parent cannot renew an existing resource's original setup window.

## Alternatives rejected

Checking only at entry allows a late preflight to prepare an effect. Relying only on setup limits ignores a narrower parent deadline or pause. Following a caller's replacement signal/predicate silently changes the controller being enforced. Replacing resource lifetime with the stage deadline confuses preparation authority with later service use. Cancelling a remembered PID bypasses the existing native invoker and its original process group. Changing the default standalone transport makes an internal composition prerequisite an unrelated public behavior change.

## Verification

Exercise unchanged default transport, narrower deadlines, pre-admission and post-await refusals, replacement signals/predicates and journal/effect preservation. Run actual independent native clients to prove original cancellation, fencing and deadline enforcement without stopping the peer. Extend the existing disposable Docker evaluation with an opt-in original parent: retain every application, isolation, failed setup, reinspection, collision and crash-recovery assertion, add real preflight refusals and bound both successful environments without shortening their service lifetime. All 68 directed provisioning/backend/lifecycle cases pass on macOS Node 24.22.0, including actual original-client closure with its independent peer left running until its own teardown. The Docker parent-control mode passes all twenty checks and observes exact owned absence after retirement, including every original isolation, failure, collision and crash-recovery control. Complete isolated Linux arm64/Node 24.22.0 checks pass 3440 tests in 183 files (245.18 seconds) and all remaining checks on source archive e07be613dc9d31d7aafd8774e920cbaea63ef908ab04b81bc38283e06e8bfce5. The journal records the actual bundle identity; this does not certify root orchestration, native models or independent Linux application-host acceptance.
