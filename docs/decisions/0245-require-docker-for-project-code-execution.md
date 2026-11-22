# 0245 — Require Docker for project code execution

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

**Amended 2026-11-22 (P9-16).** The supervised suite and worker commands now run in a warm per-slice container, and host execution is an explicit run or repository choice recorded with the round; [ADR-0257](./0257-where-project-code-runs.md) lists the conservative refinements.

**Amended 2026-11-21 ([ADR-0257](./0257-where-project-code-runs.md)).** The supervised path did not follow this record: `wl verify suite` ran the suite on the host, and builder and verifier workers ran project commands through the client's own shell. Project code now runs in Docker on every route, including the commands workers run, and a person may choose host execution explicitly for a supervised step; the autonomous runner never allows it.

The runner exists so that a person can trust its verdicts, whether they call one step or let it chain the whole route. Verdicts about behaviour need the runner to execute the project's suite, services and acceptance checks itself, and that code was usually just written by a model. Executing it on the host would expose the person's home directory, shell environment, credentials and network, and would leave no owned record of what ran. Docker environments already provide containment, pinned inputs, owned resources and recovery ([ADR-0102](./0102-inert-environment-recipes-and-pinned-setup-origins.md), [ADR-0104](./0104-owned-environment-lifecycle-and-private-cancellation.md)), but nothing stated that they are the only way project code may run.

## Decision

- Docker is a required external dependency for every step that executes project code, supervised or autonomous: suite verification, integration QA, acceptance and the project commands builder and verifier workers run. Steps that only read and write documents, the store and Git worktrees never use it or check for it.
- There is no host-execution fallback. Without a reachable local Linux daemon that passes the observed preflight, those steps refuse and report why, unless the person has explicitly chosen host execution for that supervised run or repository; that choice is shown before the step starts, recorded in the result and displayed as not isolated. The autonomous runner refuses it.
- The requirement, its reasons and the secret-handling guarantees are documented for users in [Execution isolation](../architecture/execution-isolation.md) and the README requirements, not only here.
- `wl` never reads Docker's configuration or credential files; the daemon endpoint comes from Docker's own context resolution, observed during preflight.

## Alternatives rejected

A host backend for trusted repositories, selected by a setting, would make the same verdict mean different things depending on that setting and would hand model-written code the person's environment; the explicit per-run or per-repository choice of ADR-0257 differs because it is never the default, is visible before the step and is recorded in the verdict. Optional Docker with silent fallback would remove containment exactly when the person did not notice. Other container runtimes may be added later behind the same observed preflight; none is verified now.

## Consequences

Users must install Docker and keep the pinned helper image cached to run verification-bearing steps. In exchange every behavioural check runs without host mounts, host environment, credentials or network unless a recipe declares an internal network.

[◀ Decisions index](./README.md)
