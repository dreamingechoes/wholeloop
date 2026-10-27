# Getting started — install once, run a first skill

> **TL;DR** — Build the source checkout, install for one named client, restart that client in your application repository and request the framing skill. Start with local storage; remote service accounts are optional. The core-only tour works without a model account.

> [!NOTE]
> **Status: 🚧 partial.** Source installation, all seven artifact targets and local workflows are implemented. Public npm/marketplace distribution is not released. Native discovery, authentication and permissions remain scoped to the observations in [V1 acceptance](./v1-acceptance.md).

## Contents

- [Choose a starting path](#choose-a-starting-path)
- [Build the source checkout](#build-the-source-checkout)
- [Install for one client](#install-for-one-client)
- [Check the installation](#check-the-installation)
- [Run framing in your project](#run-framing-in-your-project)
- [Verify the receipt and recover](#verify-the-receipt-and-recover)
- [Optional configuration](#optional-configuration)
- [Update or uninstall](#update-or-uninstall)
- [Where to go next](#where-to-go-next)

## Choose a starting path

| You have | Follow | Successful stopping point |
| --- | --- | --- |
| An installed client with working model access | This page, then [first framing](./tutorials/first-framing.md) | A framing conversation, final decision and recoverable receipt |
| Node and Git, but no client/model account | [Local core tour](./tutorials/local-core.md) | Configuration, preflight questions, stored state and context recovery |
| A working installation and a small change | [Small-change walkthrough](./tutorials/small-change.md) | Criteria, worktree, verification/review and the human testing handoff |
| An issue, document or local request to pin before delivery planning | [Delivery request intake](./tutorials/delivery-intake.md) | An immutable source revision; no worker starts |
| A failed command or missing skill | [Troubleshooting](./troubleshooting.md) | A specific diagnosis rather than another blind installation attempt |

The core manages state and deterministic rules. Skills in your coding client perform the model-backed work. A successful terminal command alone does not prove native discovery, review or isolation.

## Build the source checkout

Development requires Node 22 or newer and npm. Node 22.23.1 and 24.22.0 are checked development versions; use one of those rather than an early minor that cannot satisfy the installed tools' engine requirements. The built bundle supports Node 20 or newer. Use Git 2.36 or newer; individual coding clients have their own requirements. The Git minimum preserves unambiguous worktree ownership, including paths containing newlines; see [ADR-0138](decisions/0138-unambiguous-git-worktree-runtime.md).

```bash
git clone https://github.com/dreamingechoes/wholeloop.git
cd wholeloop
npm ci
npm run build
node ./dist/wl.mjs --version
export WHOLELOOP_CLI="$PWD/dist/wl.mjs"
```

Skip cloning if you already have the checkout. Access is required while the repository is private. The current version is 0.0.0: this is a source build, not an instruction to install an already published 1.0 package.

Keep `WHOLELOOP_CLI` as an absolute path when changing directories. In a new terminal, export it again from the wholeloop checkout. You can always invoke `node /absolute/path/to/wholeloop/dist/wl.mjs ...` directly. Source installation does not create a global `wl` command.

## Install for one client

Choose a named target. This example uses Claude Code:

```bash
node "$WHOLELOOP_CLI" install --target claude --scope user --dry-run --json
node "$WHOLELOOP_CLI" install --target claude --scope user --json
```

Targets are `claude`, `codex`, `opencode`, `copilot`, `gemini`, `antigravity` and `cursor`. Start with the client you already use. [Local client setup](./platforms/local-onboarding.md) covers native directories, namespace differences, version-specific behavior and activation.

| Scope | Run it from | What it writes |
| --- | --- | --- |
| `user` | The source checkout or an intended project | Owned native files in that client's user directories, with packaged resources and receipts in the external store |
| `project` | The application repository that should receive it | Selected native project directories and `.wholeloop/distribution/<target>`; runtime state/receipts/backups stay external |

For project scope, change into the application first and replace `--scope user` with `--scope project`. Avoid installing project scope into the wholeloop implementation checkout when you mean another application.

Installation does not install or log in to the client, select a model, rewrite general/MCP settings or call services. It creates owned files and reports native activation as unverified. Trust, actual role permissions and separately returned Git fallback commands remain explicit setup. [Installation boundaries](./platforms/README.md#installing).

## Check the installation

Select the same explicit target:

```bash
node "$WHOLELOOP_CLI" doctor --target claude --json
```

| Observation | Next action |
| --- | --- |
| Required checks pass | Restart the client and verify skill discovery; doctor has not run a model |
| Missing native executable | Install the intended client through its own setup, then repeat doctor |
| Changed/stale/pending managed files | Inspect ownership and retained backups before updating or removing |
| Optional provider or standalone artifact is unknown | Decide whether you need it; unknown is not authenticated support |
| Exit 3 | Read the failed required check and suggested diagnostic/remedy |

Doctor probes versions and external-store write/rename access and checks owned files. It does not repair automatically or certify native hooks, read-only isolation or service access. [Troubleshooting](./troubleshooting.md) gives concrete remedies.

## Run framing in your project

Open or restart your coding client from the actual application repository. Select/request `wl-frame-problem`; Antigravity uses `wl-agy-frame-problem`.

```text
Use wl-frame-problem for this idea: "Find tasks by title."
I am the owner. This hypothesis is not validated yet.
Frame the problem only, preserve unknowns and stop before specification.
```

Provide your actual owner name and application context when asked. For a complete practice exercise, use [your first framing](./tutorials/first-framing.md): it defines fictional context, the eight questions, valid no-go outcomes, final review and the receipt.

Expect a preflight before drafting, eight questions plus ownership, explicit `TBD: ...; who: ...` gaps, challenger feedback and your outcome. Approval applies to the exact final revision; edits after review need another review. A structural pass alone is not semantic review.

Managed Claude loose skills use `/wl-frame-problem`. A separately installed generated Claude plugin uses `/wholeloop:frame-problem`. Codex uses `$wl-frame-problem` in its skill picker. These are client entrypoints, not shell commands. [Choose your client](./platforms/local-onboarding.md).

## Verify the receipt and recover

Save the returned initiative ID. Request `wl-status` for it without advancing the flow. Close the client, open a new session in the project and request status for the same ID again.

For direct core inspection, replace the variable's example value with the actual receipt ID:

```bash
export INITIATIVE_ID="paste-the-returned-init-ID"
node "$WHOLELOOP_CLI" status "$INITIATIVE_ID" --json
node "$WHOLELOOP_CLI" resume "$INITIATIVE_ID" --json
```

State normally lives under `$XDG_STATE_HOME/wholeloop` or `$HOME/.local/state/wholeloop`; use the same store environment in each session. Status and resume inspect state. `next` can begin the next available contract, so do not use it merely to look around.

An on-hold/dropped framing has `status: closed` and no next step. The exact outcome, reason and reopening condition remain in its completion receipt and stored record. A fresh session does not reopen it. [Recovery checks](./tutorials/first-framing.md#recover-in-a-new-session).

## Optional configuration

No Jira, Notion, analytics or flag account is required for local work. To persist local destinations and a communication preset:

```bash
node "$WHOLELOOP_CLI" setup --profile pair --docs local-docs --tracker local-tracker --scope user --json
node "$WHOLELOOP_CLI" profile show --json
```

Use `mentor` for more explanation, `pair` for ordinary work, `sparring` for stronger challenge or `autopilot` for terser parallel work. Presets do not remove approval requirements or coverage. [Profiles](./configuration/profile.md).

When a workflow needs external tools, configure the client's MCP connection through its native setup and select the provider. Existing connections are preferred; exact tool contracts are discovered, not guessed. Remote integrations remain **experimental · fixture-tested · service-unverified**. Explicit HTTP alternatives have no automatic fallback. [Providers](./configuration/providers.md) · [MCP transport](./extending/providers.md#client-owned-mcp-transport).

## Update or uninstall

After updating source and rebuilding, inspect the same target/scope's install dry run. Matching files report `already-correct`; owned upgrades retain external backups. Edited/unowned files and unsafe links are preserved and refused. There is no force/adoption shortcut. Inspect pending receipts after an interruption before choosing another operation.

To retire the same installation:

```bash
node "$WHOLELOOP_CLI" uninstall --target claude --scope user --dry-run --json
node "$WHOLELOOP_CLI" uninstall --target claude --scope user --json
```

Keep the same target, scope and external store. Removal retires unchanged owned files; work history/backups remain. Separately activated Git fallbacks have their own uninstall command. Restart the client to verify removal. [Client-specific removal](./platforms/local-onboarding.md#verify-a-first-step-and-retire-the-same-installation).

## Where to go next

- [First framing](./tutorials/first-framing.md): a guided native exercise with an explicit stopping point.
- [Local core tour](./tutorials/local-core.md): reproducible terminal behavior without model access.
- [Small change](./tutorials/small-change.md): implementation, verification, review and human testing.
- [All thirteen steps](./flow/README.md): per-step inputs, outputs and constraints.
- [Troubleshooting](./troubleshooting.md): commands, discovery, permissions, state and exit codes.
- [V1 acceptance](./v1-acceptance.md): remaining client/workflow/CI/release checks, separate from deferred service certification.

<!-- docnav -->
[◀ Philosophy](philosophy.md)  ·  [📖 Docs index](README.md)  ·  [🧭 Concepts](concepts.md)  ·  [First framing ▶](tutorials/first-framing.md)
