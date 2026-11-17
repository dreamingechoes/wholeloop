# Getting started — install once, run a first skill

> **TL;DR** — Install the `wl` CLI from npm, install wholeloop into one coding client, restart that client in your application repository and ask for the framing skill. Everything is stored on your machine to start with; no service account is needed. If you have no client or model account yet, the local core tour works without either.

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

Keep in mind that wholeloop has **two parts**:

- **Skills** run inside your coding client and do the model-backed work: asking questions, drafting, editing code.
- **The `wl` core** is a plain command-line program that stores your work and enforces the rules.

A command that succeeds in the terminal does not mean the client has run a skill. The two are checked separately below.

## Install the CLI

| You need | Why |
| --- | --- |
| **Node.js 20** or newer | Runs the `wl` core |
| **Git 2.36** or newer | Isolated worktrees; 2.36 is the first version that lists them unambiguously |
| **Docker 28** or newer, with a local daemon | Only for steps that run your project's code, which never runs directly on your machine ([execution isolation](./architecture/execution-isolation.md)) |

Your coding client has its own requirements.

```console
$ npm install --global wholeloop
added 1 package in 597ms
$ wl --version
1.1.0
```

The package has no runtime dependencies and installs two equivalent commands, `wl` and `wholeloop`. To work from a source checkout instead, follow the [development guide](./contributing/development.md).

## Install for one client

Pick the client you already use. This example uses Claude Code; the other targets are `codex`, `opencode`, `copilot`, `gemini`, `antigravity` and `cursor`.

**1. Preview.** `--dry-run` writes nothing:

```console
$ wl install --target claude --scope user --dry-run
Dry run for claude at user scope: nothing was written.
  188 files to write
Run the same command without --dry-run to apply it.
…
```

**2. Install:**

```console
$ wl install --target claude --scope user
Installed claude at user scope.
Receipt: ~/.local/state/wholeloop/installations/22d5c1ca…/receipt.json
Restart the client and check that the skills appear.
Git guards are installed per repository: node ~/.local/state/wholeloop/distributions/22d5c1ca…/claude/bin/wl.mjs guard hooks install --repo '<repository>' --store ~/.local/state/wholeloop --json
Add --json for the full result.
```

| Flag | What it does |
| --- | --- |
| `--target claude` | The client to install for |
| `--scope user` | Where the skills go; see the table below |
| `--dry-run` | Shows what would change, without writing |

The **install scope** decides where the files go:

| Scope | Run it from | What it writes |
| --- | --- | --- |
| `user` | Any directory | The client's user-level directories, so every project sees the skills |
| `project` | The application repository that should get them | That repository's client directories and `.wholeloop/distribution/<target>` |

For project scope, change into the application first and use `--scope project`. Either way, your work history, receipts and backups stay in your personal [store](./glossary.md#terms), never in the repository.

**About the last line: Git guards.** Guards are Git hooks that check commits and pushes made during a step: for example, that no runtime state is committed and that only a tested change is pushed. Install never adds them by itself, because they belong to one repository:

- After a **user-scope** install, the command shows `<repository>`. Run it once for each application repository you want guarded, with that repository's path.
- After a **project-scope** install, the command already names the repository.

[Client setup](./platforms/local-onboarding.md) covers each client's directories, skill names and version differences.

## Check the installation

```console
$ wl doctor --target claude
Doctor: every required check passed.

  pass     node                  24.22.0
  pass     git                   2.49.0
  pass     cli.claude            2.1.326
  pass     store
  pass     providers
  unknown  artifacts
           No explicit standalone artifact directory was checked; see managed scope checks when available. Native discovery remains unverified.
           …
  pass     installation.user
  unknown  installation.project
           No owned receipt at this scope; existing unmanaged native components remain unverified.

Doctor cannot see whether the client loads the skills, is signed in or grants permissions.
Add --json for the full report.
```

**Doctor** checks the Node, Git and client versions, that it can write to your store, and that the installed files still match what wholeloop wrote. It reports; it never repairs anything.

> [!TIP]
> `unknown` is not a failure. Here it means doctor was not given a generated artifact directory to compare, and that there is no project-scope install, which is expected after a user-scope one. Only `fail` needs action.

| What doctor says | What to do |
| --- | --- |
| Every required check passes | Restart the client and check that the skills appear |
| The client's executable is missing | Install the client through its own setup, then run doctor again |
| Installed files are changed, stale or pending | Read [installation problems](./troubleshooting.md#installation-reports-changed-unowned-or-pending-files) before reinstalling |
| A provider or an optional file is `unknown` | Nothing, unless you need it |
| It exits with code 3 | A required check failed; its message names the cause and the next step |

Add `--json` for the full versioned report, which is what scripts should read. A passing doctor has not run a model and cannot see whether the client trusts and loads the skills; only the client can show that.

## Run framing in your project

Open or restart your coding client **in the application repository** you want to work on, and ask for `wl-frame-problem` (on Antigravity, `wl-agy-frame-problem`). This is a request to the client, not a shell command:

```text
Use wl-frame-problem for this idea: "Find tasks by title."
I am the owner. This hypothesis is not validated yet.
Frame the problem only, preserve unknowns and stop before specification.
```

How you call a skill depends on the client:

| Client | How to call it |
| --- | --- |
| Claude Code | `/wl-frame-problem`, or `/wholeloop:frame-problem` with the plugin |
| Codex | `$wl-frame-problem` from the skill picker |
| Other clients | Ask for `wl-frame-problem` by name |

Give your real name as the owner and your application's context when asked. Expect:

1. A [preflight](./glossary.md#terms): what the run will do and what it will never do, before it drafts anything.
2. Eight framing questions, plus who owns the problem.
3. Gaps written as `TBD: ...; who: ...` instead of invented answers.
4. Feedback from a **challenger**, a reviewer role that questions the draft, then a request for your outcome.
5. The final draft for your approval. If you edit it after that review, it is reviewed again.

The wording varies with the model. For a complete practice run with a fictional application, follow [your first framing](./tutorials/first-framing.md).

## Verify the receipt and recover

The run ends with a [receipt](./glossary.md#terms) that includes an **initiative ID**, such as `init-3cf1140a`. Save it, then:

1. Ask the client for `wl-status` with that ID. Status only reads; it does not move the work forward.
2. Close the client, open a new session in the same project and ask again. The work is still there.

You can read the same state from a terminal:

```console
$ wl status init-3cf1140a
init-3cf1140a  initiative  open  Find tasks by title in a fictional task app
  owner Demo Owner · updated 2026-11-17
  next: frame-problem

0 unread messages. Add --json for the full status.
```

| Command | What it does |
| --- | --- |
| `wl status <id>` | Shows the item, its owner and the next step. Only reads |
| `wl resume <id>` | Prints the compact context a new conversation needs. Only reads |
| `wl next <id>` | Begins the next step. It changes state, so do not use it just to look around |

State lives under `~/.local/state/wholeloop`, or `$XDG_STATE_HOME/wholeloop` when that variable is set. Every session must see **the same store** to find the same work.

If you put the idea on hold or dropped it, status shows `closed` with no next step. The outcome, the reason and what would reopen it are kept; a new session does not reopen it on its own. [Recovery checks](./tutorials/first-framing.md#recover-in-a-new-session).

## Optional configuration

You do not need a Jira, Notion, analytics or feature-flag account for local work. To save local destinations and a conversation style:

```console
$ wl setup --profile pair --docs local-docs --tracker local-tracker --scope user
{
  "schema": "wholeloop/setup@1",
  "scope": "user",
  "applied": true,
  …
}
$ wl profile show
{
  "preset": "pair",
  "verbosity": "standard",
  …
}

Style for this run:
- Give enough reasoning and context to assess each action.
…
```

The **profile** changes how the harness talks to you, never which approvals it needs:

| Preset | For |
| --- | --- |
| `mentor` | More explanation, for learning |
| `pair` | Ordinary work |
| `sparring` | Stronger pushback on your assumptions |
| `autopilot` | Terse output and parallel work |

[Profiles](./configuration/profile.md) lists every dial.

When a workflow needs an external service, connect it in your client's own MCP settings and choose the matching provider; wholeloop uses the connection you already have. Remote integrations are **experimental**: tested against fixtures, not certified against every service. [Providers](./configuration/providers.md) · [MCP transport](./extending/providers.md#client-owned-mcp-transport).

## Update or uninstall

**To update**, upgrade the package and repeat the install for the same target and scope, starting with the dry run:

```console
$ npm install --global wholeloop@latest
changed 1 package in 870ms
$ wl install --target claude --scope user --dry-run
…
$ wl install --target claude --scope user
…
```

The output is the same as a first install. When the installed files already match the new version, install says so instead:

```console
$ wl install --target claude --scope user
Already installed: claude at user scope matches this version.
…
```

- Files wholeloop wrote and you have not touched are replaced, with a backup in your store.
- A file you edited, or one wholeloop did not write, is left alone and reported. There is no option to force over it.
- If an earlier install was interrupted, read its pending receipt before running anything else.

**To remove** an installation, use the same target and scope:

```console
$ wl uninstall --target claude --scope user --dry-run
Dry run for claude at user scope: nothing was written.
  188 files to remove
…
$ wl uninstall --target claude --scope user
Removed claude at user scope.
Backups: ~/.local/state/wholeloop/installations/22d5c1ca…/backups/57cc2413…
…
Restart the client to confirm the skills are gone.
Git guards are removed per repository: …
```

Removal deletes only the unchanged files wholeloop wrote; your work history and backups stay in the store. Git guards you added to a repository have their own uninstall command, printed on the last line. [Client-specific removal](./platforms/local-onboarding.md#verify-a-first-step-and-retire-the-same-installation).

## What installation does not do

Installing wholeloop **does not**:

- install your client or sign you in;
- choose a model;
- edit the client's general or MCP settings;
- call any service.

It writes its own files and leaves loading, trusting and granting permissions to the client's own setup. [Installation boundaries](./platforms/README.md#installing).

## Where to go next

- [First framing](./tutorials/first-framing.md): a guided exercise with a clear stopping point.
- [Local core tour](./tutorials/local-core.md): what the terminal core does without a model.
- [Small change](./tutorials/small-change.md): build, verify and review one change, then test it yourself.
- [All thirteen steps](./flow/README.md): inputs, outputs and limits of each step.
- [Troubleshooting](./troubleshooting.md): commands, discovery, permissions, state and exit codes.
- [Discussions](https://github.com/dreamingechoes/wholeloop/discussions): questions and ideas; bugs go to [issues](https://github.com/dreamingechoes/wholeloop/issues).

<!-- docnav -->
[◀ Philosophy](philosophy.md)  ·  [📖 Docs index](README.md)  ·  [🧭 Concepts](concepts.md)  ·  [First framing ▶](tutorials/first-framing.md)
