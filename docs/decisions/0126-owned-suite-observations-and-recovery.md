# 0126 — Owned suite observations and recovery

- **Status:** Accepted
- **Date:** 2026-10-26

## Context

An owned application process is not a passing repository suite. The existing suite journal prevents a repeated command after an uncertain write, but a root controller also needs the original fixed-host observations and private process closures to recover a lost result. Model output, the newest case or a fixture result cannot supply those facts.

## Decision

Share the exact original Docker suite observation reader between the existing executor and a new internal RunnerSuiteStages component. Select immutable case definitions and explicit declared command references in the controller. Preserve the original round-derived case key, command mapping, exit semantics and exact captured output hashes. Reading the original case never executes it. Fixtures retain fixture provenance and cannot satisfy positive owned suite execution.

Bind the exact root request, plan, unit, invocation, stage deadline, current committed candidate, latest verify round, suite selection and environment before execution. Retain a consumed invocation before its private locator. Missing original bindings and preexisting unowned suite intents refuse another execution. Run the fixed Docker executor inside the original environment operation scope, including its separately owned metadata clients. Every application observation must refer to the original candidate/environment/recipe and complete within the root deadline; every original invoker must be positively closed.

Recover a missing suite result from only the original observed command prefix, ending at the first failure or including all selected commands. Compare an existing result and gate submission instead of overwriting it. Recover metadata while paused without repeating a command, resuming a route or resetting any budget. Changed candidates, missing processes, conflicting results and fixture evidence stay unavailable. Cancellation addresses original private owners even after authority is revoked. Return only fixed redacted error categories; arbitrary tool output must not escape as diagnostic prose.

A suite result supplies the suite unit of verification. It is not criterion verification, adversarial review, sensitivity analysis, whole-feature acceptance, human approval or publication. Complete verification/repair/integration/acceptance and the public full-route entrypoint remain technical P6-10 work.

## Alternatives rejected

Reexecuting after a lost metadata write can duplicate application effects. Importing a model's execution claim is not an observation. Selecting a newer successful case changes the original round. Inferring process closure from a deadline misses live clients. Treating a zero exit as complete acceptance discards criterion and behavioral gates. Resuming a route implicitly from read-only recovery grants new execution authority.

## Verification

Exercise exact Unicode/newline output and exits zero/seven, wrong command/round/host, altered captured artifacts, current authority/plan/gate/mapping fences, consumed locator loss and cancellation after revocation. Execute a separate finite model-free Docker evaluation for actual root-owned suite commands, lost result writes, paused fresh-controller recovery, stable repeated inspection and exact disposable-resource retirement. Keep normalized fixtures, macOS Docker observations, independent Linux controls, native-model certification and whole-route acceptance separate.

Actual macOS arm64/Node 24.22.0 Docker observations pass both exits and fresh paused metadata recovery. Removing the original command operation from its root binding makes the cached result unknown even when all remaining metadata clients are closed; restoring that binding restores the exact original observation. Both disposable environments are observed retired. Preserve the initial waiting-external fixture failures and the later unchanged-deadline cancellation; these observations establish neither native-model nor independent Linux-host acceptance.

Complete checks pass 3172 tests in 156 files on macOS arm64 and isolated Linux arm64 with Node 24.22.0. Fourteen model-free runner controls pass on macOS Node 24 and Linux Node 20.0.0, with exact inert schema parity. No tests are skipped and no deadlines are increased. The journal records exact candidate identities, timings and retained failures.
