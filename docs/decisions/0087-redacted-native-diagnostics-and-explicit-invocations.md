# 0087 — Redacted native diagnostics and explicit invocations

- **Status:** Accepted
- **Date:** 2026-10-22

## Context

Several native framing trials ended without the required journal events. The
process transport discarded diagnostics to avoid persisting private provider
messages. Exit status alone could not distinguish an invocation problem from
account or permission failures. A preliminary hypothesis about Copilot's missing
prompt flag was contradicted by official documentation and actual stdin probes.

## Decision

Inspect bounded stdout/stderr bytes in memory through an optional process observer.
Retain only closed event names, byte/error counts and recognized error categories;
never retain native text, paths, prompts or tool payloads. Ignore ordinary stdout
prose and successful metadata for classification. Bound logical lines, decode split
UTF-8 and resynchronize after oversized lines. A failed observer fails the process.

Persist a separate versioned diagnostics file bound to run ID, target, core, phase
and live mode. Old/simulation runs have explicitly unavailable native diagnostics.
The additive conformance diagnose command validates stored identity and shows only
fixed recommendations. Categories are observed signals, not authenticated root
causes, permission grants or scenario passes. Preserve the existing report format
and strict journal judge. A zero exit cannot satisfy missing scenario events.

Use documented stream-only Antigravity input without an extra print prompt. Use
an explicit private server for OpenCode 2 conformance, while retaining pinned V1
arguments. Copilot's piped input stays intact; adding a prompt flag would discard
it. Do not guess a fix from an empty journal or add blanket permissions to obtain
a pass. Actual native authentication, permissions and complete framing still need
fresh acceptance. Record any automatic approval rejection separately from a client
failure: a rejected host invocation is not a failed native trial.

## Alternatives rejected

Saving raw stderr/transcripts can persist credentials and private tool payloads.
Matching words anywhere in successful native output mistakes permission metadata
for denial. Replacing a provider, model, account or permission policy automatically
changes the thing being tested. Replacing the journal judge with an exit-code
check would hide the original failure.

## Verification

Fixtures exercise split errors, UTF-8, bounded lines, private-field omission,
metadata false positives, error categories, observer failure and stored run/core
mismatch. A real child process proves failed stderr is classified before discard;
a synthetic native client proves failure verdicts remain failures. Initial actual
no-tool probes observed model responses on OpenCode 2.1.1, Copilot 1.0.83 and
Antigravity 1.4.4, including piped Copilot and stream-only AGY. They prove neither
framing execution nor permission/hook isolation.

Subsequent explicitly authorized full trials observed Copilot permission denial
and Antigravity soft-denied tools despite a SUCCESS turn and zero exit. Classify
the latter's structured ERROR tool_info.error and nonempty result.denied_actions;
ignore successful tool output and parameters. A fresh actual Antigravity run
confirms permission-denied with the strict scenario verdict still FAIL. Fixtures
cover empty/malformed summaries and private action/response omission.

A longer OpenCode diagnosis ended after native retries with a provider error
mentioning HTTP 503. Numeric upstream 502/503/504 error statuses map to the
existing connection-failed category; its remedy covers provider availability as
well as networking. Fixtures verify the status mapping, unrelated authentication
statuses and private response omission. This does not claim a repeated native 503
or successful framing, and does not change the configured provider or account.

Sources checked 2026-10-22: [Copilot input semantics](https://docs.github.com/en/copilot/how-tos/copilot-cli/automate-copilot-cli/run-cli-programmatically),
[Antigravity headless protocol](https://www.antigravity.google/docs/cli/headless/),
and [OpenCode commands](https://opencode.ai/v2/docs/cli/commands).

[◀ Decisions index](./README.md)
