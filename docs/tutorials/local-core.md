# Local core tour — try wholeloop without a model

> **TL;DR** — Create a disposable project and an isolated configuration/store, begin framing, inspect its preflight and recover its context. No coding client, model account or remote service is required. This exercises the core, not an AI-generated framing or native permission boundary.

> [!NOTE]
> **Status: ✅ implemented.** These commands exercise configuration, missing-input handling, initiative reuse, status and resume. Loading the skills in a client is covered in [first framing](./first-framing.md).

## Before you start

You need the `wl` CLI ([getting started](../getting-started.md#install-the-cli)) and Git. No coding client, model or account is needed.

## Run the tour

Paste the following into a Bash or zsh terminal. The subshell keeps its configuration/state overrides local to the exercise. Every run gets a new temporary directory; nothing is deleted or published. Keep the final printed path if you want to inspect the demo again.

```bash
(
  set -euo pipefail
  demo_dir="$(mktemp -d "${TMPDIR:-/tmp}/wholeloop-core.XXXXXX")"
  mkdir "$demo_dir/project"
  git -c init.templateDir= init --quiet --initial-branch main "$demo_dir/project"
  export XDG_CONFIG_HOME="$demo_dir/config"
  export XDG_STATE_HOME="$demo_dir/state"
  unset WL_WORKSPACE WL_SUBJECT
  cd "$demo_dir/project"

  wl setup --profile pair --docs local-docs --tracker local-tracker --scope user --json

  input_exit=0
  wl next "Find tasks by title in a fictional task app" --json > "$demo_dir/questions.json" || input_exit=$?
  test "$input_exit" -eq 2
  cat "$demo_dir/questions.json"

  wl next "Find tasks by title in a fictional task app" --owner "Demo Owner" --json > "$demo_dir/start.json"
  cat "$demo_dir/start.json"
  initiative_id="$(node -p "JSON.parse(require('node:fs').readFileSync(process.argv[1], 'utf8')).contract.subject.id" "$demo_dir/start.json")"

  wl status "$initiative_id" --json
  wl resume "$initiative_id" --json
  wl next "$initiative_id" --json
  printf 'Demo retained at %s\nInitiative: %s\n' "$demo_dir" "$initiative_id"
)
```

The missing-owner call deliberately returns exit 2; the script checks for that result. It is not an unexpected failure. The subsequent call supplies the owner and creates the initiative.

## What to look for

| Output | Expected observation | What it proves |
| --- | --- | --- |
| Setup | `schema: wholeloop/setup@1`, `applied: true`, local providers | Settings were written only under the demo config root |
| First next call | Exit 2 and an owner question | Missing ownership is requested before an initiative is created |
| Start | `contract.subject.id`, `run`, the framing template and preflight | The core began a framing contract; it did not draft the artifact |
| Status | The same initiative, `status: open`, no completed framing | State is available independently of a conversation |
| Resume | A bounded context pack identifying the same work | A client can retrieve context in another session |
| Next by ID | The same subject, still at framing | Continuing does not invent a completed artifact or a second initiative |

The framing contract has nine headings: eight questions plus Owner. A returned `questions: []` in the successful core preflight means its structural inputs are present. It does not mean the eight human framing questions were answered; the skill still asks them.

## Inspect it from another terminal

Set the following variables to the directory and initiative printed by your tour:

```bash
export DEMO_DIR="paste-the-printed-demo-directory"
export INITIATIVE_ID="paste-the-printed-initiative-ID"
XDG_CONFIG_HOME="$DEMO_DIR/config" XDG_STATE_HOME="$DEMO_DIR/state" wl status "$INITIATIVE_ID" --json
```

The store is `$DEMO_DIR/state/wholeloop`, not the demo Git repository. Without the same state override, a new terminal reads your usual store instead. The core has no terminal session memory to recover implicitly.

## What this tour does not complete

No model drafted or challenged a framing, no human approved a final revision, no native role ran and no service was contacted. Leave the initiative open, or continue a separate native exercise through [first framing](./first-framing.md). Do not invent a reviewer or mark the tour's preflight as a completed framing.

For everyday work, use your normal store and request the appropriate skill in your coding client. For the underlying commands and exit codes, read [the core reference](../architecture/core-cli.md) and [troubleshooting](../troubleshooting.md#understand-exit-codes).

<!-- docnav -->
[◀ First framing](first-framing.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Small change ▶](small-change.md)
