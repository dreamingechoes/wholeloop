# 0260 — Network for supervised project setup

- **Status:** Accepted
- **Date:** 2026-11-22

## Context

Supervised verification and building run project code in a warm container per slice ([0257](./0257-where-project-code-runs.md)). That container has no network, so it cannot install dependencies. A repository whose packages must be installed for Linux, such as one with native Node modules developed on macOS, fails inside the container unless the person chooses host execution, which removes isolation entirely.

The autonomous runner solves the same need with pinned setup origins and a setup phase whose network is declared in the environment recipe ([0102](./0102-inert-environment-recipes-and-pinned-setup-origins.md)). The supervised container has no recipe.

The maintainer accepted this record on 2026-11-22. Its implementation is task P9-25.

## Decision

- **One declared setup per repository.** A person declares it with `wl setup --project-setup "<command>" --scope project`, stored as `answers.execution:setup` in the committed project file and read only from there, like a host choice. A user-level answer would give every repository network during setup, so it is refused.
- **Only installers with one known output folder.** The command is one plain argv, run without a shell, starting with `npm`, `pnpm`, `bun` (output in `node_modules`), `uv` (`.venv`) or `composer` (`vendor`). Other installers write elsewhere in the repository or the home directory, so they are refused rather than guessed; a prepared image or host execution covers them.
- **Dependencies stay out of the worktree.** That folder is mounted from a directory the person owns in the store (`<store>/execution/<container>/`), so the worktree on the host gains at most an empty mount point and host dependency folders are never replaced. Removing the container removes the directory, and the next container runs setup again.
- **Network once, then offline.** A container with a declared setup starts on the default bridge network, runs the setup in the workspace, is detached from that network and must then report no network at all; a failed setup or a container that cannot prove it is offline is removed with a reason. A reused container is checked offline again, and one made for another image or setup is replaced. A container without a declared setup never joins a network.
- **Shown and recorded.** `verify begin` shows the setup before anything runs; each suite round records a `verify.suite-setup` event (`wholeloop/suite-setup@1`) with the command, the network and whether it ran for that round or earlier; results and `wl exec` say which setup ran with network.
- **Detection only proposes.** `wl setup` offers the matching command when it finds a lock file (`package-lock.json`, `pnpm-lock.yaml`, `bun.lock`, `uv.lock`, `composer.lock`); nothing is saved unless the person chooses it.

## Alternatives rejected

- **Keep supervised containers offline with no setup.** Leaves host execution as the only option for many real repositories, which is worse for isolation than a bounded online setup.
- **Allow network for every command.** Gives model-written code network access throughout the build loop.
- **Reuse the runner's recipe machinery unchanged.** It requires delivery grants and acceptance plans that a supervised step does not have.
- **Named Docker volumes for dependencies.** A new volume is owned by root, while project commands run as the person's user ID, so installs would fail without an extra privileged step; a store directory the person owns avoids it.
- **Any command as setup.** An arbitrary command could write anywhere in the worktree with network, which the folder rule exists to prevent.

## Consequences

Network access during setup widens containment: dependency installation runs package scripts from the registry with network, once per workspace. Later commands, including tests and builder commands, still run without network. Yarn and other installers outside the list need a prepared image or host execution.

## Verification

`test/unit/execution/execution.test.ts` covers the command rule, the project-file-only reading, setup on a network followed by detachment and an offline check, reuse without a second setup, replacement of a container found on a network or made for another setup, removal after a failed setup or a failed detachment, the store-side dependency folder, the recorded event and the proposal from a lock file. Its gated rehearsal ran on Docker Desktop 29.9.3 on macOS arm64 with `node:22-bookworm` on 2026-11-22: `npm ci` installed a dependency with network, the suite used it with the network blocked, and the worktree on the host gained no dependency. A Linux rehearsal remains in manual verification.

[◀ Decisions index](./README.md)
