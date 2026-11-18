# 0257 — Project code execution in supervised verification

- **Status:** Proposed
- **Date:** 2026-11-18

## Context

[ADR-0245](./0245-require-docker-for-project-code-execution.md) makes Docker required for every step that executes project code and rules out a host fallback; the README and the execution isolation page say project code never runs on the person's machine. The supervised `verify-works` path does not follow it: `wl verify suite` calls `runSuite` without an executor, and the default executor spawns the suite on the host with the caller's whole environment. Only the autonomous runner injects the Docker executor.

On 2026-11-18 a fixture application whose test reports its platform ran through `wl verify suite` with Docker 29.9.3 available: the test reported `platform=darwin` with the caller's home directory and user, wrote a file outside the worktree, and no container was created.

## Decision (proposed)

Choose one:

- **A. Docker for the supervised path too (recommended).** `wl verify suite` uses the same observed Docker preflight and executor as the runner, and refuses with a clear message when Docker is unavailable. Statements in the README, ADR-0245 and execution isolation stay true. This is the conservative option under AGENTS.md: it widens no authority.
- **B. Host execution for the supervised path, stated plainly.** ADR-0245 is amended to cover only the runner; the README and execution isolation say that supervised verification runs the suite on the host, with the person's environment, as the person's own `npm test` would.

Either way, a test pins where the supervised suite runs.

## Alternatives rejected

- **Leave the code and the claim as they are.** A stated containment guarantee that does not hold is worse than either option.
- **Host execution with a filtered environment presented as isolation.** It would still expose the home directory and network, so it cannot be described as contained.

## Consequences

Option A makes Docker a requirement for supervised verification, which adds setup for people who only build and verify locally, and keeps one meaning for a verify verdict. Option B keeps the supervised path light and weakens the public claim.

## Verification

A fixture suite that reports its platform and environment, run through `wl verify suite`; with option A, a Docker rehearsal and a refusal test without a reachable daemon.

[◀ Decisions index](./README.md)
