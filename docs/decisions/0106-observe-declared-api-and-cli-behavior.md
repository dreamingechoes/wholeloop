# 0106 — Observe declared API and CLI behavior in owned applications

- **Status:** Accepted
- **Date:** 2026-10-25

## Context

Passing unit tests do not establish that a feature works through its public entrypoint. A task application can pass a suite while losing every task on restart. Importing a worker's response, following an arbitrary URL or guessing a command would make the acceptance evidence unreliable and widen execution authority.

## Decision

1. Interpret an explicit closed behavior-input contract inside the pinned acceptance case. Select exact phase-test recipe commands or a declared service's actually observed loopback publication. No prompt output supplies host code, an arbitrary executable or a new destination.
2. Journal each invocation as a scoped test.run effect within the original grant, effect count and finite execution budgets. Keep case intents and original deadlines; an interrupted invocation is never blindly replayed. The acceptance authority watcher permits only its own exact current pending test effect, without relaxing revocation, basis or budget checks. Resume the queue only after an exact observed completion.
3. Use owned Docker jobs, bounded actual stdout/stderr and observed container exits for CLI assertions. Preserve the real controller invoker's PID, argv, working directory, timestamps and exit separately from the application's declared argv, working directory and daemon-observed start/end/exit. Do not claim the application's PID or signal when they were not observed. Verify the private client's finished close against the actual application exit and let the wrapper drain both output streams before exiting. Preserve its normalized wrapper exit separately from that client close. A deliberate exit seven can satisfy a negative case; a timeout, cancellation, missing exit or overflowing output cannot.
4. Verify daemon, resource identity, service IP, fixed proxy target and actual loopback publication. Consume a complete bounded HTTP response, disable redirects and ambient credentials, and refuse foreign locations, unsupported encoding and truncated bodies. Never retry an HTTP action automatically, including GET. Treat excluded sensitive response headers as unobserved, never as proof of absence. Preserve invalid JSON and missing values separately from zero, null and empty strings. Evaluate only supported objective assertions; semantic judgments remain a separate capability.
5. Restart only the exact owned service and observe fixed TCP readiness again in its namespace. Preserve its data volumes and compare the proxy target after restart. Reserve app/proxy compute capacity even while temporarily stopped, charge uncertain jobs and reserve history capacity for cleanup. An uncertain action may stop and fence the whole owned environment; this cannot establish that a timed-out HTTP write did not occur.
6. Reuse the existing once-per-round suite journal through a trusted executor function. Require an explicit command-reference to pinned-case mapping, exact argv/cwd and the exact observed candidate. Preserve cached successes and failures, interrupted intents, gate policies and round budgets. Repairing a candidate invalidates execution evidence; it cannot silently clear a gate run.

## Alternatives considered

| Option | Why rejected |
| --- | --- |
| Treat a green unit suite as acceptance | Misses real persistence and user-visible failures |
| Accept worker-supplied process or response JSON | Confuses claims with observed facts |
| Invoke a guessed command on the controller | Bypasses the reviewed recipe and application boundary |
| Follow redirects or trust a caller's localhost URL | Can send acceptance traffic outside the exact owned application |
| Retry an interrupted request | Can duplicate a write whose outcome is unknown |
| Reuse the lifecycle stop operation for a test restart | Permanently fences startup and prevents the intended restart |
| Give each new suite executor its own cache | Resets the existing once-per-round contract and gate budget |

## Verification and limits

Unit tests exercise assertions, literal/missing values, complete actual loopback HTTP reads, cancellation, truncation, output bounds, foreign redirects, capacity/history admission and the exact pending-effect authority watch. The opt-in evaluator runs actual disposable Docker API and CLI applications, deliberately broken persistence behind a green unit suite, real service restart, a repaired candidate, nonzero exit assertions and suite reuse. Report the controller and daemon separately. These observations certify neither independent Linux-controller execution nor native-model, browser, private-evaluator, vendor-account or publication behavior. Private controller source and the external store remain trusted.

[◀ Decisions index](./README.md)
