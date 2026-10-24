# Capture a delivery request — keep its exact revision

> **TL;DR** — Capture a file, inline request, existing item or complete remote observation before planning work. The result is an immutable source ID in an external store. Intake requires no model and starts no worker.

> [!NOTE]
> **Status: ✅ implemented.** Local and imported source intake, explicit extraction maps and the programmatic existing-provider host path are implemented and fixture-tested. Remote service certification remains experimental. Plans, grants and the unattended runner are subsequent Phase 6 increments.

## Before you start

Build the checkout following [getting started](../getting-started.md#build-the-source-checkout), keeping WHOLELOOP_CLI set to the absolute dist/wl.mjs path. Run the following Bash commands from any directory. They create a disposable working directory and a separate external store; they do not change your project or personal store.

## Capture a local request

```bash
set -euo pipefail
workspace_dir="$(mktemp -d "${TMPDIR:-/tmp}/wholeloop-intake.XXXXXX")"
mkdir -p "$workspace_dir/work"
cat > "$workspace_dir/work/request.md" <<'EOF'
Find tasks by title.
Match titles without searching descriptions.
EOF
cat > "$workspace_dir/work/input.json" <<'EOF'
{
  "schema": "wholeloop/delivery-source-request@1",
  "kind": "file",
  "ref": "request.md",
  "mapping": [
    { "id": "title-search", "role": "criterion", "startLine": 1, "endLine": 2 }
  ]
}
EOF
node "$WHOLELOOP_CLI" delivery source \
  --file "$workspace_dir/work/input.json" \
  --root "$workspace_dir/work" \
  --store "$workspace_dir/state" --json
printf 'Retained tutorial files: %s\n' "$workspace_dir"
```

Expect status stored, a source.id SHA-256 identity, a content revision and workers: not-started. The receipt omits raw body text. The private snapshot lives at state/delivery/sources/ID.json under the retained directory. Repeat the same command in a fresh terminal with the saved paths: identical content and mapping return the same ID and first fetch time. Changing request.md creates another ID while retaining the old bytes. There is no execution, approval or publication implied by this receipt.

Ranges are inclusive, one-based lines of the exact text. Duplicate IDs, overlaps, blank selections and absent lines are refused. mapping: [] keeps the whole document as context without generating criteria. Unsupported formats must be explicitly converted to bounded UTF-8 text first. The core does not interpret PDF, office formats or embedded commands.

For inline text, select kind: inline, a stable simple ref such as title-search, and a body field in the JSON file. For existing state, select kind: item and ref: init-XXXXXXXX, using the item's existing store. Item text includes its title and body; a recorded repository must match the selected root. Inspect the closed shape with:

```bash
node "$WHOLELOOP_CLI" delivery source-schema --json
```

## Remote sources and provenance

Select kind: tracker or document, a canonical credential-free HTTPS ref, an existing provider ID, and the expected repository or tenant scope. For example, a GitHub issue uses provider github-issues and scope example/tasks. An imported observation has this explicit shape:

```json
{
  "schema": "wholeloop/delivery-source-request@1",
  "kind": "tracker",
  "ref": "https://github.com/example/tasks/issues/42",
  "provider": "github-issues",
  "scope": "example/tasks",
  "mapping": [],
  "observation": {
    "schema": "wholeloop/delivery-source-observation@1",
    "provider": "github-issues",
    "scope": "example/tasks",
    "status": "succeeded",
    "ref": "https://github.com/example/tasks/issues/42",
    "complete": true,
    "body": "Find tasks by title.",
    "revision": "observed-issue-revision",
    "attachments": []
  }
}
```

This is a format example, not an actual fetched issue. The CLI labels it origin: import; caller JSON does not establish authentication or observed server truth. A supplied programmatic SourceProviderHost can use DeliverySources.captureFromHost to invoke the existing tracker.read-item/docs.read operation and obtain host provenance. Its client normalizer must report actual scope, full pagination, revision and relevant attachment digests. No service-specific HTTP fetcher or automatic fallback is added. See [provider boundaries](../configuration/providers.md#delivery-source-observations).

## Refusals and stopping point

Missing observations, partial reads, missing revisions, provider/scope/reference mismatches and unsafe input return status missing-input, a fixed problem category, workers: not-started and exit 3. The command does not ask a question or launch a worker. Malformed command arguments retain normal CLI errors.

Content is limited to 1 MiB of UTF-8 bytes. The request JSON wrapper is limited to 8 MiB so escaping does not reduce the text bound. Files must be regular and resolve inside the explicitly selected root; final symlinks and escaped directory links are refused. Keep credentials out of source text: recognizable credential patterns are rejected, and the detector cannot establish that arbitrary prose contains no secret.

You have reached the stopping point when the same ID survives another invocation and changed text produces a new ID. Retain the temporary directory if you want to inspect the snapshots. The [expanded roadmap](../../roadmap/phase-6-autonomous-delivery.md) tracks planning, authorization and execution separately; the original [small-change route](./small-change.md) remains available.

<!-- docnav -->
[◀ Small change](small-change.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Troubleshooting ▶](../troubleshooting.md)
