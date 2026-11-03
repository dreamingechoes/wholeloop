# 0203 — Contained Claude Code boundary

- **Status:** Accepted
- **Date:** 2026-11-03

## Context

A native launch is admitted only with a trusted runtime observation of the exact recipe ([ADR-0101](./0101-dedicated-native-delivery-hosts-and-runtime-proof.md)). Codex had one: its own permission profile contains tool commands, and `codex sandbox` lets the controller run a probe under that profile without a model ([ADR-0120](./0120-observed-native-boundaries-and-asynchronous-admission.md)). Claude Code had none, so no Claude stage could ever be admitted.

Two facts observed on the reference client, Claude Code 2.1.316 on macOS, shaped the design:

- **Authentication needs the real home.** Claude Code keeps its login in the macOS login Keychain and reads it through `security(1)`. With the substituted per-assignment home that every launch used, the client reported `loggedIn: false`. It also needs `USER`. Setting `CLAUDE_CONFIG_DIR` selects a different Keychain entry, one per client home.
- **The client offers no policy-only probe.** Its file tools follow the client's permission engine, which runs only when a model calls a tool. A model-driven canary would spend the owner's quota on every launch, and its denials would come from model behavior rather than an observed mechanism.

## Decision

- **The operating system contains the client.** On macOS, a Claude launch runs as `/usr/bin/sandbox-exec -p <profile> <canonical client> <recipe>`. The profile denies every file read and write first, then allows only:
  - system paths;
  - the canonical client binary;
  - the encrypted login Keychain, which the client's own `security` lookup reads;
  - the assignment directory, read only;
  - the workspace, read only, or writable for a builder;
  - writes to the assignment's outputs (file output only), its `home/` and `tmp/`, the dedicated client home and `/dev`.

  Network and process creation stay open: the client needs its API, and the recipe's `--restricted` mode removes every tool that runs commands. Since the profile is in argv, it is part of the recipe's policy digest. An observation of one profile therefore cannot admit a launch under another.
- **A dedicated client home.** The client runs with `CLAUDE_CONFIG_DIR` set to a home that the owner signed in to once, outside the wholeloop store and outside every repository. `HOME` and `USER` are the owner's, taken from trusted controller configuration. The profile, not a substituted home, keeps the run away from the rest of the home directory. Neither the owner's personal configuration nor their default login is used. A containment whose client home differs from the native-store reference is refused before any attempt is prepared.
- **The observer probes the real mechanism.** `ClaudeBoundaryHost` runs before admission, on macOS only, and invokes no model. It refuses a recipe that does not regenerate exactly, and a client home that holds a credential file. It then runs these controls, all under `sandbox-exec`:
  1. The client's `--version` under the launch profile.
  2. The controller's boundary program under the same profile, plus read access to the controller's Node runtime. Under this profile the program must:
     - read its input witness;
     - be denied a private store witness and a credential witness;
     - write the workspace only for a builder;
     - write outputs only for file output.
  3. Owned cancellation of that program.
  4. The client's own `auth status`.

  Only hashes and status enter the proof. A signed-out client is observed as unauthenticated, so admission refuses it.
- **macOS only.** Off macOS the observer returns no observation, so Claude stages are unavailable there until a reviewed Linux containment exists. Codex keeps its own sandbox on both platforms.

## Alternatives rejected

- A substituted home with a copied credential would put a credential value into a file the controller manages.
- A model-driven canary per launch spends quota and observes model behavior, not containment.
- A deny-list profile, for example denying only the store, would miss repositories and credentials anywhere else on disk, such as other volumes.
- Relying on `--restricted` alone would make containment a claim of the client, never observed.

## Verification

- Ten unit cases with a synthetic process runner cover the profile order and quoting, the policy binding, three roles, each refused proof, a signed-out client, a non-macOS host, a credential file, and a changed recipe.
- A launch case shows that a contained run goes through `sandbox-exec` with the owner's home, the user and the client home, and that a mispaired client home is refused first.
- On the owner's machine, `npm run eval:claude-boundary` passes six real controls on Claude Code 2.1.316: planner, builder and verifier, each with both output modes. Each control is authenticated through the dedicated client home, with the workspace unchanged and no model invoked.
- Re-running that eval without the profile's leading deny makes the observer refuse.

## Owned closure of the sandbox process

A contained launch's command is `/usr/bin/sandbox-exec`, not `claude`. The runner's stage scope managed only bare client names, so it ran `sandbox-exec` unmanaged and reported its ownership as unknown. The observer then refused every contained launch, correctly. `sandbox-exec` is now one of the reference native commands, so its process group gets the same owned, recorded closure as a bare client. The first live EVAL-10 attempt found this before any model call.

## Findings from the first model turn

The owner approved one model turn under the launch profile (2026-11-03). Its first attempt failed at startup: the client creates `/tmp/claude-<uid>` whatever `TMPDIR` says, and the profile denies it. Allowing it would expose the temporary files of every other session of the same user. Contained launches and their observer therefore set `CLAUDE_CODE_TMPDIR` to the assignment's own `tmp/`.

They also set `DISABLE_AUTOUPDATER=1`. During the session the native installer moved `~/.local/bin/claude` from 2.1.316 to 2.1.317, although the owner's configuration disables auto-update; the trigger was not identified. The observer refused the new version, as intended. The runtime document should name the exact version binary rather than the symlink the installer moves.

The retried turn completed in 5.1 s on `claude-opus-5-5` with only `Glob`, `Grep` and `Read` and no MCP server. It read the allowed witness, and the client's restricted mode denied the read outside the working directories (`permission_denials`). The client reported 277 output tokens. That turn ran on 2.1.317, so it is not evidence for the pinned 2.1.316. With the exact 2.1.316 binary and both variables, the six model-free controls pass again. The owner kept the 2.1.316 pin, and the same turn repeated on that exact binary also completed: client 2.1.316, 5.3 s, 278 output tokens, the allowed read returned and the outside read denied.
