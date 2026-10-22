# Nightly conformance — activate evidence collection deliberately

> **TL;DR** — The checked-in workflow resolves pinned/latest clients, runs fresh standalone framing scenarios, and produces a structural matrix, issue drafts and an owned documentation-page projection. It is disabled until the owner configures the activation variables and native credentials. Issue delivery has its own switch and permission boundary.

> [!NOTE]
> **Status: 🚧 partial.** Local provisioning/collection/aggregation/delivery and synthetic transport tests are implemented. No actual scheduled workflow, authenticated issue or native model run is established by those tests.

---

## Activation

Review .github/workflows/conformance.yml and test/conformance/pins.json on the
intended default-branch commit. The workflow accepts only schedule/manual events;
it has no pull-request trigger. The schedule is daily at 03:23 UTC. All jobs stay
skipped until the repository variable WHOLELOOP_CONFORMANCE_ENABLED is exactly
true. Leave it unset while reviewing the code and credentials.

Create the conformance environment with your intended access/protection policy.
Store only the intended native credential in each named GitHub environment secret:

| Client | Environment secret | Native environment variable |
| --- | --- | --- |
| Claude Code | WL_CONFORMANCE_CLAUDE_KEY | ANTHROPIC_API_KEY |
| Codex | WL_CONFORMANCE_CODEX_KEY | CODEX_API_KEY |
| OpenCode | WL_CONFORMANCE_OPENCODE_KEY | OPENAI_API_KEY |
| Copilot CLI | WL_CONFORMANCE_COPILOT_TOKEN | COPILOT_GITHUB_TOKEN |
| Gemini CLI | WL_CONFORMANCE_GEMINI_KEY | GEMINI_API_KEY |
| Antigravity | WL_CONFORMANCE_ANTIGRAVITY_KEY | GEMINI_API_KEY |
| Cursor | WL_CONFORMANCE_CURSOR_KEY | CURSOR_API_KEY |

For OpenCode, explicitly select an available openai/model identifier through the
WHOLELOOP_CONFORMANCE_OPENCODE_MODEL variable. The host carries only that non-secret
identifier in WL_CONFORMANCE_OPENCODE_MODEL; the collector validates it before
native startup and supplies the documented --model flag for both V1 and V2.
No configuration file or legacy config injection is needed. The API key stays
only in the selected child's environment. Other clients retain their native
model selection. Check account access, model choice and costs before activation.
Missing keys, or the missing OpenCode model, produce an unconfigured receipt and
UNRUN rows without launching a native scenario.

An ordinary local trial without this explicit nightly host value keeps its
existing account/model selection. This is not automatic model substitution;
see [ADR-0090](../decisions/0090-explicit-nightly-native-model-selection.md).

The host creates non-secret authentication-mode settings only inside each fresh
Gemini/Antigravity HOME: Gemini's gemini-api-key selected type and Antigravity's
modelProvider=gemini. It never writes an API key, seeds an account-session file or
changes personal settings. Actual acceptance of these settings and model access
on each selected version remain owner verification.

Enable collection, then dispatch the exact reviewed default-branch version. Native
trust/permission failures remain failures; the host grants no approval bypass.
Do not interpret imported environment context or locally generated synthetic
reports as authorization or actual native acceptance.

## What each job can do

The core job runs the complete local checks and exports one exact bundled core
with an independently passed SHA-256. Every later job uses that immutable artifact
ID, checks transfer integrity and verifies the same core bytes. Native jobs do not
install source dependencies or rebuild the core after receiving credentials.

Seven client jobs run at most two at once. Each resolves/installs only its selected
pinned/latest pair into separate external private prefixes, before the secret-bearing
step. Acquisition refuses a changed transferred core before network/installation.
Each channel then gets a fresh HOME/config/state/data/cache/temp environment and
only its selected native key. No GitHub token or another client's key is forwarded.
These are configuration/process boundaries, not an OS sandbox against vendor code.
Native/transitive postinstall downloads and self-updates are not fully frozen.

Each collector writes only results.json and receipt.json to its upload directory.
Native homes, downloads, stores, journals, drafts and raw logs stay outside it and
are never uploaded. Authentication/launch failures cannot become comparable version
regressions. Acquisition or malformed pipeline failures stop aggregation/delivery;
inspect the failed job rather than presenting missing artifacts as passes.

The aggregation job checks all seven same-run/attempt/source/core receipts, exact
result hashes, client/channel membership and structural reports. It produces:

- results.json, matrix.json and matrix.md with original observation dates;
- issues.json with only current comparable structural drafts;
- docs/platforms/README.md with only the owned observation section regenerated;
- receipt.json with source/core/run bindings and configured/unconfigured clients.

The page is an **external artifact projection**. Review and explicitly apply its
owned section to source; the workflow neither commits nor pushes it. Initial
checked-in rows remain UNRUN until actual evidence is reviewed. Artifact retention
is seven days. Hash/context bindings establish pipeline consistency, not independent
authentication of imported native reports or complete native permission coverage.

## Issue activation

Review the matrix and draft artifact first. Configure the conformance-issues
environment/protection policy, then set WHOLELOOP_CONFORMANCE_ISSUES to true only
when you intend delivery. This job alone has issues:write and receives its token
only in the delivery step. It downloads the exact core/aggregate artifact IDs and
verifies the independently passed result digest before service access; it neither
rebuilds nor executes a native model.

Writers serialize through conformance-issues concurrency. The delivery host checks
actual repository/default-branch metadata, inventories intact markers in open and
closed issues, refuses incomplete scans, and rechecks unchanged current evidence
before sending each exact body through stdin. Completed external outcomes survive
partial failure; no automatic close/delete/retry occurs. Inspect actual GitHub
outcomes before another dispatch. Owner edits to markers or independent writers
remain outside atomic deduplication guarantees.

## Verification boundaries

Local tests use tiny synthetic archives, fake npm/native/GitHub transports and
supplied structural reports. Production archive preflight and public metadata
reads are separate model-free checks. Actual Linux/native installation, native
settings/trust/models, Actions execution and authenticated issue delivery remain
in [manual verification](../../roadmap/manual-verification.md).

See [ADR-0074](../decisions/0074-exact-native-acquisition-and-private-prefixes.md),
[ADR-0075](../decisions/0075-disabled-nightly-pipeline-and-separated-issue-authority.md)
and [the platform guide](../platforms/README.md).

## Diagnose native failures without retaining private output

Use `wl conformance diagnose <run> --store <external-store> --json` after a
fresh live run. The runner stores only closed error categories, recognized event
names and byte/error counts, bound to the exact core/run/client. Fixed next-step
text distinguishes account, permission, invocation, connection and model signals.
Raw native errors, transcript prose, tool arguments and paths are discarded.
Oversized logical lines are dropped; partial UTF-8 is decoded before classification.

Successful metadata mentioning permissions and ordinary stdout prose do not count
as errors. Signals suggest investigation; they do not authenticate a root cause
or authorize changes. No matching signal means unknown, rather than a fabricated
explanation. The scenario report remains authoritative for journal acceptance;
exit zero and a ready response do not establish a framing pass. Old/simulation runs
have unavailable native diagnostics and must not be relabelled as observed.

OpenCode 2 conformance uses a private standalone server; pinned V1 keeps its
existing invocation. Antigravity receives a JSONL user event in stream-only mode.
Copilot keeps its prompt on stdin: its documented explicit prompt flag would ignore
piped data. Native configuration, trust and credentials stay owned by the client.
See [ADR-0087](../decisions/0087-redacted-native-diagnostics-and-explicit-invocations.md).

<!-- docnav -->
[◀ Release preparation](releasing.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Docs style ▶](docs-style.md)
