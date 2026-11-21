# 0257 — Where project code runs

- **Status:** Accepted
- **Date:** 2026-11-21

## Context

[ADR-0245](./0245-require-docker-for-project-code-execution.md) makes Docker required for every step that executes project code and rules out a host fallback; steps that only read and write documents, the store and Git worktrees do not use it. The README and the execution isolation page say project code never runs on the person's machine. The supervised path does not follow it:

- `wl verify suite` calls `runSuite` without an executor, and the default executor spawns the suite on the host with the caller's whole environment. Only the autonomous runner injects the Docker executor.
- Builder and verifier workers have a command tool in the client, so the tests and scripts they run while building or checking a criterion run on the host through the client's own shell, outside anything `wl` controls.

On 2026-11-18 a fixture application whose test reports its platform ran through `wl verify suite` with Docker 29.9.3 available: the test reported `platform=darwin` with the caller's home directory and user, wrote a file outside the worktree, and no container was created.

## Decision

- **Every execution of project code runs in Docker by default, supervised or autonomous.** That covers the suite, integration QA, acceptance, and the commands builder and verifier workers run against the project (tests, builds, scripts). Workers run those commands through a `wl` command that executes them in the slice's environment, which is kept for the life of the slice so the build loop does not pay a container start per command.
- **Steps that do not execute project code never need Docker:** research, framing, specification, scopes, slicing, review, launch preparation, ramp, measurement and decision. They read code, documents and the web; research never runs repository code (P9-06). Docker is checked only when a step that executes code is about to start, never before.
- **The person may choose host execution explicitly** for supervised steps, per run or per repository, never through the profile and never by default. A host run records where it ran, the result and its display say "ran on this machine, not isolated", and the choice is shown before the step starts. The autonomous runner keeps Docker without exception, because nobody watches the code it runs.
- **Without Docker and without that choice,** a step that executes code refuses before doing anything and names both remedies: start Docker, or choose host execution for this run.
- ADR-0245 is amended accordingly: the explicit, recorded choice is not a fallback, which stays rejected.

## Alternatives rejected

- **Leave the code and the claim as they are.** A stated containment guarantee that does not hold is worse than any option.
- **Docker for the runner only, host for supervised steps, stated plainly.** It keeps the supervised path light but makes the same verdict mean different things by route, and model-written code would run on the person's machine by default.
- **Docker for every step, including those that only read.** It would slow research, framing and planning for no protection: they execute nothing.
- **Silent fallback to the host when Docker is missing.** Containment would disappear exactly when the person did not notice (already rejected in ADR-0245).
- **Host execution with a filtered environment presented as isolation.** It would still expose the home directory and network, so it cannot be described as contained.

## Consequences

Supervised verification and building need Docker unless the person opts out, which adds setup for people who only build locally; the opt-out keeps that path open without hiding what it gives up. Workers need a `wl` command for project commands and a per-slice environment that stays warm. Steps that only read get faster, since they never touch Docker. The README, execution isolation and ADR-0245 say where code runs, by default and by choice.

## Verification

A fixture suite that reports its platform and environment, run through `wl verify suite` and through the worker command, must report the container; a Docker rehearsal; a refusal test without a reachable daemon; a host-choice test that records and displays where it ran; a test that the runner rejects host execution; and a test that research, framing and slicing never check for Docker.

[◀ Decisions index](./README.md)
