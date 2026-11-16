# Getting started — install once, run a first skill

> **TL;DR** — Install the `wl` CLI from npm, install wholeloop into one coding client, restart that client in your application repository and ask for the framing skill. Everything is stored locally to start with; no service account is needed. The local core tour works without a model account.

> [!NOTE]
> **Status: ✅ implemented.** Installation from npm, all seven client targets and the local workflows are tested. How far each client's discovery, sign-in and permissions were checked is recorded in [V1 acceptance](./v1-acceptance.md).

## Contents

- [Choose a starting path](#choose-a-starting-path)
- [Install the CLI](#install-the-cli)
- [Install for one client](#install-for-one-client)
- [Check the installation](#check-the-installation)
- [Run framing in your project](#run-framing-in-your-project)
- [Verify the receipt and recover](#verify-the-receipt-and-recover)
- [Optional configuration](#optional-configuration)
- [Update or uninstall](#update-or-uninstall)
- [What installation does not do](#what-installation-does-not-do)
- [Where to go next](#where-to-go-next)

## Choose a starting path

| You have | Follow | You are done when |
| --- | --- | --- |
| A coding client that already works with a model | This page, then [first framing](./tutorials/first-framing.md) | A framing conversation has ended in your decision, and a new session can find it |
| Node and Git, but no client or model account | [Local core tour](./tutorials/local-core.md) | You have stored an item, seen its questions and recovered it from a new terminal |
| A working installation and a small change to make | [Small-change walkthrough](./tutorials/small-change.md) | The change is built, verified and reviewed, and waiting for you to test it |
| A failed command or a missing skill | [Troubleshooting](./troubleshooting.md) | You know which part failed, before reinstalling anything |

Two pieces work together. Skills run inside your coding client and do the model-backed work: asking questions, drafting, editing code. The `wl` core is a plain command-line program that stores your work and enforces the rules. A command that succeeds in the terminal does not mean the client has run a skill.

## Install the CLI

You need Node 20 or newer and Git 2.36 or newer; that Git version is the first that lists worktrees unambiguously ([ADR-0138](decisions/0138-unambiguous-git-worktree-runtime.md)). Steps that run your project's code also need a local Docker daemon ([execution isolation](./architecture/execution-isolation.md)). Your coding client has its own requirements.

```bash
npm install --global wholeloop
wl --version
```

The package installs two equivalent commands, `wl` and `wholeloop`, and has no runtime dependencies. To work from a source checkout instead, follow the [development guide](./contributing/development.md).

## Install for one client

Pick the client you already use. This example uses Claude Code:

```bash
wl install --target claude --scope user --dry-run
wl install --target claude --scope user
```

The first command only lists the files it would write; the second writes them. Targets are `claude`, `codex`, `opencode`, `copilot`, `gemini`, `antigravity` and `cursor`. [Local client setup](./platforms/local-onboarding.md) covers each client's directories, skill names and version differences.

The [install scope](./glossary.md#terms) decides where the files go:

| Scope | Run it from | What it writes |
| --- | --- | --- |
| `user` | Any directory | The client's user-level directories, so every project sees the skills |
| `project` | The application repository that should get them | That repository's client directories and `.wholeloop/distribution/<target>` |

For project scope, change into the application first and replace `--scope user` with `--scope project`. In both cases your work history, receipts and backups stay in your personal [store](./glossary.md#terms), never in the repository.

## Check the installation

Use the same target:

```bash
wl doctor --target claude
```

Doctor checks the Node, Git and client versions, that it can write to your store, and that the installed files still match what wholeloop wrote. It reports; it never repairs anything itself. A healthy installation looks like this (abridged):

```text
Doctor: every required check passed.

  pass     node                  22.12.0
  pass     git                   2.49.0
  pass     cli.claude            2.1.325
  pass     store
  pass     installation.user
  unknown  installation.project
           No owned receipt at this scope; existing unmanaged native components remain unverified.
```

A check that is not a pass explains what was seen and, when there is a fix, prints the command to run. Add `--json` for the full versioned report, which is what scripts should read.

| What doctor says | What to do |
| --- | --- |
| Every required check passes | Restart the client and check that the skills appear |
| The client's executable is missing | Install the client through its own setup, then run doctor again |
| Installed files are changed, stale or pending | Read [installation problems](./troubleshooting.md#installation-reports-changed-unowned-or-pending-files) before reinstalling |
| A provider or an optional file is `unknown` | Nothing, unless you need that provider; unknown is not an error |
| It exits with code 3 | A required check failed; its message names the cause and the next step |

A passing doctor has not run a model, and it cannot see whether the client trusts and loads the skills. Only the client can show that. [Troubleshooting](./troubleshooting.md) has a fix for each failure.

## Run framing in your project

Open or restart your coding client in the application repository you want to work on, and ask for `wl-frame-problem` (on Antigravity, `wl-agy-frame-problem`):

```text
Use wl-frame-problem for this idea: "Find tasks by title."
I am the owner. This hypothesis is not validated yet.
Frame the problem only, preserve unknowns and stop before specification.
```

Give your real name as the owner and your application's context when asked. Expect:

1. A [preflight](./glossary.md#terms): what the run will do and what it will never do, before it drafts anything.
2. Eight framing questions, plus who owns the problem.
3. Gaps written as `TBD: ...; who: ...` instead of invented answers.
4. Feedback from a challenger role, then a request for your outcome.
5. The final draft for your approval. If you edit it after that review, it is reviewed again.

How you call a skill depends on the client. Claude Code's installed skills answer to `/wl-frame-problem`, its generated plugin to `/wholeloop:frame-problem`, and Codex's skill picker uses `$wl-frame-problem`. These are requests to the client, not shell commands. For a complete practice run with a fictional application, follow [your first framing](./tutorials/first-framing.md).

## Verify the receipt and recover

The run ends with a [receipt](./glossary.md#terms) that includes an initiative ID. Save it, then:

1. Ask the client for `wl-status` with that ID. Status only reads; it does not move the work forward.
2. Close the client, open a new session in the same project and ask for status again. The work is still there.

You can read the same state from a terminal. Replace the example value with your ID:

```bash
export INITIATIVE_ID="paste-the-returned-init-ID"
wl status "$INITIATIVE_ID"
wl resume "$INITIATIVE_ID" --json
```

State lives under `$XDG_STATE_HOME/wholeloop`, or `$HOME/.local/state/wholeloop` when that variable is unset. Every session must see the same store to find the same work. `status` and `resume` only read; `next` can start the next step, so do not use it just to look around.

If you decided to put the idea on hold or drop it, status shows `closed` with no next step. The outcome, the reason and what would reopen it are kept in the receipt and the stored record; a new session does not reopen it. [Recovery checks](./tutorials/first-framing.md#recover-in-a-new-session).

## Optional configuration

You do not need a Jira, Notion, analytics or feature-flag account for local work. To save local destinations and a conversation style:

```bash
wl setup --profile pair --docs local-docs --tracker local-tracker --scope user --json
wl profile show --json
```

Pick `mentor` for more explanation, `pair` for ordinary work, `sparring` for stronger pushback or `autopilot` for terse, parallel work. A preset changes how the harness talks to you, never which approvals it needs. [Profiles](./configuration/profile.md).

When a workflow needs an external service, connect it in your client's own MCP settings and choose the matching provider; wholeloop uses the connection you already have. Remote integrations are **experimental**: tested against fixtures, not certified against every service. [Providers](./configuration/providers.md) · [MCP transport](./extending/providers.md#client-owned-mcp-transport).

## Update or uninstall

To update, upgrade the package and repeat the install for the same target and scope, starting with the dry run:

```bash
npm install --global wholeloop@latest
wl install --target claude --scope user --dry-run
wl install --target claude --scope user
```

When nothing changed, install says the target is already installed. Files wholeloop wrote and you have not touched are replaced, with a backup in your store. A file you edited, or one wholeloop did not write, is left alone and reported; there is no option to force over it. If an earlier install was interrupted, read its pending receipt before running anything else.

To remove an installation, use the same target and scope:

```bash
wl uninstall --target claude --scope user --dry-run
wl uninstall --target claude --scope user
```

Removal deletes only the unchanged files wholeloop wrote; your work history and backups stay in the store. A separately activated Git hook fallback has its own uninstall command. Restart the client to confirm the skills are gone. [Client-specific removal](./platforms/local-onboarding.md#verify-a-first-step-and-retire-the-same-installation).

## What installation does not do

Installing wholeloop does not install or sign in to your client, choose a model, edit its general or MCP settings, or call any service. It writes its own files and leaves whether the client loads them, trusts them and grants their permissions to the client's own setup. [Installation boundaries](./platforms/README.md#installing).

## Where to go next

- [First framing](./tutorials/first-framing.md): a guided exercise with a clear stopping point.
- [Local core tour](./tutorials/local-core.md): what the terminal core does without a model.
- [Small change](./tutorials/small-change.md): build, verify and review one change, then test it yourself.
- [All thirteen steps](./flow/README.md): inputs, outputs and limits of each step.
- [Troubleshooting](./troubleshooting.md): commands, discovery, permissions, state and exit codes.
- [Discussions](https://github.com/dreamingechoes/wholeloop/discussions): questions and ideas; bugs go to [issues](https://github.com/dreamingechoes/wholeloop/issues).

<!-- docnav -->
[◀ Philosophy](philosophy.md)  ·  [📖 Docs index](README.md)  ·  [🧭 Concepts](concepts.md)  ·  [First framing ▶](tutorials/first-framing.md)
