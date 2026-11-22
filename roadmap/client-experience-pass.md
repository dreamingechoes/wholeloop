# Client experience pass (P9-21)

> **TL;DR** — A written pass over what `wl install --scope user` renders for each of the seven clients, made on 2026-11-22 from a disposable home with the current build. It records, per client, which roles start, which tools they get, how the conductor waits, what the sandbox and store allow, how many launcher calls each step makes and how long each call looks. It is read from rendered files and adapter declarations, not from a signed-in client, so every row here still needs the native pass in [manual verification](./manual-verification.md#user-experience-phase-9-2026-11-18). One gap became a task: [P9-24](./phase-9-user-experience.md#p9-24--one-short-launcher-per-client).

## How the pass was made

`wl install --target all --scope user` ran from a scratch repository with `HOME`, `CODEX_HOME`, `XDG_CONFIG_HOME` and `XDG_STATE_HOME` pointing to a temporary directory. The installed skills, agents, hooks and launchers were then read; the adapter declarations in `src/adapters/` and the platform matrix in [docs/platforms](../docs/platforms/README.md#capability-matrix) supplied the declared boundaries. No client was started and no model was called.

## What every client shares

- **Skills:** all seventeen step skills are installed, each with its own launcher at `<skills>/<skill>/scripts/wl.mjs`, which imports the checked packaged core. Skills tell the model to run that launcher directly, never a `wl` found on `PATH`.
- **Launcher calls per step:** the skill names between one and ten distinct `wl` commands; the most are in build-slice (10), ramp-exposure (8) and cut-scopes, open-pr, setup, slice-work and write-spec (7 each). Each call is a shell command, so without an allow rule a client asks for approval each time. Install now shows the narrowest rule for each client that supports one, for review only.
- **Roles:** nine roles (analyst, builder, challenger, conductor, launcher, planner, researcher, reviewer, verifier); Codex omits the launcher drafter, which uses the checked headless route instead. Only the builder and the conductor can write or run commands; observers never receive a shell.
- **Waiting:** step skills start independent jobs together and join them through the client's native wait primitive, never fixed sleeps; clients without nested delegation hand further role work back to the main session in sequence.
- **Store:** the external store lives under the person's state directory, outside every repository, so a sandboxed client needs that directory to be writable.

## Per client

| Client | Roles and tools | Waiting | Sandbox and store | Launcher call as shown | Allow rule shown by install |
| --- | --- | --- | --- | --- | --- |
| Claude Code | Tool lists per role; observers in plan mode with write tools and MCP denied | Parallel subagents, native wait | Store outside the workspace needs `--add-dir`; writes approved as asked | About 55 characters of absolute path, then the command and `--json` | `Bash(<launcher>:*)` per skill in `settings.json` (user) or `settings.local.json` (project) |
| Codex | Agent files carry instructions only; roles inherit the parent's sandbox and approval policy | Parallel subagents, native wait | Workspace-write sandbox needs the store as a writable root; install already shows that snippet | About 55 characters | `prefix_rule` per launcher in `rules/wholeloop.rules` |
| OpenCode | Permission maps per role: everything denied, then reads, globs and greps; `.env` reads denied | Parallel subagents, native wait | Writer roles keep native external-directory asks for the store | About 64 characters | `permission.bash` pattern per launcher in `opencode.json` |
| Copilot | Tool lists per role; no inferred delegation | Parallel subagents, native wait | Store outside the workspace needs `--add-dir` | About 56 characters | `--allow-tool 'shell(<launcher>)'` flags when starting the client |
| Gemini | Tool lists per role; subagents cannot nest delegation | Sequential hand-back to the main session | Store needs `--include-directories` | About 55 characters | `run_shell_command` policy rule with `commandPrefix` per launcher |
| Antigravity | Tool lists per role; observers with command execution off; builder in a command sandbox | Sequential hand-back to the main session | Store writes approved in the client's permission settings | About 93 characters, the longest | None known; each call asks |
| Cursor | `readonly` flag per role | Sequential hand-back to the main session | Store needs `--add-dir` | About 55 characters | `Shell(<launcher>)` per launcher in `cli-config.json` (user) or `.cursor/cli.json` (project) |

Character counts are for a home directory such as `/Users/name`.

## Gaps

- **One rule per skill and long commands (new task P9-24).** Every skill carries its own launcher, so an allow rule needs seventeen entries per client and every approval prompt shows a long absolute path. One short, stable launcher per client would let a single entry cover every skill and make each prompt readable. Changing the launcher layout touches the checked launcher roots of [ADR-0048](../docs/decisions/0048-native-target-layouts-and-checked-launcher-roots.md), so it is its own task rather than part of this pass.
- **Antigravity has no known command-level allow rule.** Each launcher call asks. This is recorded for the native pass rather than as a task, because nothing in the repository can change it until the client offers such a rule.
- **Codex roles cannot narrow their own sandbox.** Already documented in the platform matrix and enforced by the checked headless route for gates; no new task.
- **Unchecked by this pass:** whether each client accepts the shown rule, still asks for every other command, starts the named role with only its assignment, and renders the display text verbatim. These stay in manual verification.

---

[◀ Phase 9](./phase-9-user-experience.md) · [Roadmap](./README.md) · [Journal](./journal.md)
