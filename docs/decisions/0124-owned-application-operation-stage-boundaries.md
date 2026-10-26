# 0124 — Owned application operation stage boundaries

- **Status:** Accepted
- **Date:** 2026-10-26

## Context

The existing behavioral hosts own their Docker resources and operation wrappers. A root delivery stage must join those original invokers without relaunching an uncertain test or treating closed client processes as passing application behavior. Read-only Docker queries also launch processes; overlooking them would let recovery claim a stage had stopped while one of its original clients remained active.

## Decision

Add an internal RunnerEnvironmentScope for verification, integration and acceptance stages. Bind the exact root invocation, original deadline, private grant, environment identity and candidate vector before dispatch. Consume the invocation before publishing its locator. Claim each original environment operation once across root stages, validate command hashes, nonces and private paths, and register the actual wrapper before input. Reject already issued or foreign operations instead of replaying them.

Preserve the existing effect wrapper's actual PID. A second native wrapper would make its recorded start disagree with the original environment outcome. Give inert Docker reads separate private native owners instead; retain every query, original deadline and cancellation channel. Allow only bounded metadata/read operations without an environment registration. Join caller and root cancellation without extending either allowance, and refuse late launches after the original scope closes.

Fresh observation reads only original private metadata and actual process closure. Missing descriptors, unresolved read invokers and damaged claims remain unknown. Fresh cancellation uses only exact original nonce channels and remains available after revocation; it neither fences an entire shared environment nor signals a stored PID. Fixtures retain their provenance. Process ownership never establishes application readiness, suite success, human testing, delegated acceptance or publication.

The complete domain-stage composition, acceptance-definition production, repair loop and public full-route entrypoint remain technical P6-10 work. This component supplies their application process boundary and does not close the roadmap task.

## Alternatives rejected

Wrapping an already owned effect again breaks its original process identity. Tracking effects alone misses metadata clients. Cancelling all operations in an environment can interrupt unrelated work. Treating elapsed deadlines as observed absence guesses at closure. Recreating a lost locator can buy another invocation. A normalized successful response cannot prove an actual process existed or stopped.

## Verification

Exercise actual synthetic Docker clients and existing operation wrappers, independent read ownership, paused recovery, live cancellation after revocation, one-shot claims, unrelated cancellation channels, missing descriptors, changed commands/plans and pre-dispatch refusals. Preserve fixture-only environmental metadata and lack of daemon/application certification. Keep the ordinary Git unit scenario focused on its real Git-to-QA boundary after a full-suite contention timeout; preserve the complete two-unit route in the independent finite runner evaluation without extending existing test deadlines or removing route coverage.

Complete checks pass 3138 tests in 152 files on macOS arm64/Node 24.22.0 and isolated Linux arm64/Node 24.22.0, with no skipped tests or increased deadlines. Thirteen runner controls pass on macOS Node 24 and Linux Node 20.0.0, including separate query/effect ownership and the complete two-unit route. The journal records exact candidate hashes, runtimes and remaining native/account/full-route limits.
