# 0260 — Network for supervised project setup

- **Status:** Proposed
- **Date:** 2026-11-22

## Context

Supervised verification and building now run project code in a warm container per slice ([0257](./0257-where-project-code-runs.md)). That container has no network, so it cannot install dependencies. A repository whose packages must be installed for Linux, such as one with native Node modules developed on macOS, fails inside the container unless the person chooses host execution, which removes isolation entirely.

The autonomous runner solves the same need with pinned setup origins and a setup phase whose network is declared in the environment recipe ([0102](./0102-inert-environment-recipes-and-pinned-setup-origins.md)). The supervised container has no recipe.

## Decision (proposed)

- A person may declare one setup command per repository, for example `npm ci`, remembered at project scope and shown before the first command of a slice.
- The setup command runs once when the slice's container is created, attached to a bridge network, with dependency output written to container-owned volumes rather than the bind-mounted worktree, so host dependency folders are never replaced.
- The container is detached from every network before any other project command runs, and the result records that setup used the network.
- Setup is never inferred from the repository; detection may only propose it.

## Alternatives rejected

- **Keep supervised containers offline with no setup.** Leaves host execution as the only option for many real repositories, which is worse for isolation than a bounded online setup.
- **Allow network for every command.** Gives model-written code network access throughout the build loop.
- **Reuse the runner's recipe machinery unchanged.** It requires delivery grants and acceptance plans that a supervised step does not have.

## Consequences

Network access during setup widens containment: dependency installation runs package scripts from the registry with network. That is why this record waits for the maintainer's decision instead of being applied conservatively.

## Verification

When accepted: a fixture repository whose setup installs a dependency inside the container while later commands observe no network, a check that host dependency folders are unchanged, and a Docker rehearsal on macOS and Linux.

[◀ Decisions index](./README.md)
