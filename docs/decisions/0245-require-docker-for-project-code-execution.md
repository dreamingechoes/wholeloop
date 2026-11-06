# 0245 — Require Docker for project code execution

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

The runner exists so that a person can trust its verdicts, whether they call one step or let it chain the whole route. Verdicts about behaviour need the runner to execute the project's suite, services and acceptance checks itself, and that code was usually just written by a model. Executing it on the host would expose the person's home directory, shell environment, credentials and network, and would leave no owned record of what ran. Docker environments already provide containment, pinned inputs, owned resources and recovery ([ADR-0102](./0102-inert-environment-recipes-and-pinned-setup-origins.md), [ADR-0104](./0104-owned-environment-lifecycle-and-private-cancellation.md)), but nothing stated that they are the only way project code may run.

## Decision

- Docker is a required external dependency for every step that executes project code: suite verification, integration QA and acceptance. Steps that only read and write documents, the store and Git worktrees do not use it.
- There is no host-execution fallback. Without a reachable local Linux daemon that passes the observed preflight, those steps refuse and report why.
- The requirement, its reasons and the secret-handling guarantees are documented for users in [Execution isolation](../architecture/execution-isolation.md) and the README requirements, not only here.
- `wl` never reads Docker's configuration or credential files; the daemon endpoint comes from Docker's own context resolution, observed during preflight.

## Alternatives rejected

A host backend for trusted repositories would make the same verdict mean different things depending on a setting and would hand model-written code the person's environment. Optional Docker with silent fallback would remove containment exactly when the person did not notice. Other container runtimes may be added later behind the same observed preflight; none is verified now.

## Consequences

Users must install Docker and keep the pinned helper image cached to run verification-bearing steps. In exchange every behavioural check runs without host mounts, host environment, credentials or network unless a recipe declares an internal network.

[◀ Decisions index](./README.md)
