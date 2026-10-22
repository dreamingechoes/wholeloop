# 0070 — Explicit fresh conformance collection

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

The framing runner and matrix renderer exist, but collecting separate pinned and latest observations still needs manual orchestration. Calling whichever executable happens to be on PATH would blur the two channels. A process crash must remain a visible failed observation without preventing collection from the other clients.

## Decision

- Add a strict versioned collection plan with one to fourteen exact CLI/channel/pin entries. Reject duplicates, unknown fields/targets, moving aliases, oversized pins and trailing whitespace before any fixture is created. Calendar-style Cursor versions remain accepted. The host resolves moving releases and provisions native binaries separately; the collector performs no download, installation or update.
- Require explicit fixture or live mode. Fixture mode accepts no binary root and retains FIXTURE_PASS/simulation. Live mode requires every selected executable at bin-root/cli/channel/bin/native-name, with all paths preflighted before preparation. Allow native package-manager symlinks to regular executable files. Never silently fall back to a globally installed channel when a selected binary is missing.
- Run each entry in a fresh external fixture using the existing preparation, exact-version probe, bounded worker process and journal judge. Keep native trust, permission and authentication behavior. Run sequentially so the host need not grant fourteen concurrent model sessions or duplicate credential setup.
- Retain a crashed/failed client report and continue with remaining entries. Forward cancellation and per-client 100–600000 millisecond deadlines. Stop preparing new fixtures after cancellation; interrupted state stays in the external store for inspection. Fatal preparation/storage errors still fail the command.
- Emit matrix-ready observations with actual completion timestamps, unique run IDs, requested and probed versions, hashes, assertion codes and evidence labels. Keep the opaque initiative ID required by successful reports; omit journal paths and draft contents. Completed means collection finished, not that conformance passed. Exit 4 for failed reports, 3 for cancellation/preconditions and zero otherwise.
- Continue host version resolution, acquisition, scheduled activation and issue automation independently. No model, authenticated native service or CI operation is required to implement/test this collector. Native acceptance remains separate.

## Alternatives rejected

Running a moving latest alias directly would make comparisons irreproducible. One shared PATH would let missing channel installations reuse a global client. Stopping after the first failed client would hide the remaining evidence. Removing the successful report's initiative ID would break existing matrix input validation; retain that structural ID rather than weaken the validator. Copying full fixture paths, artifacts or raw process output into aggregate results would expose unnecessary data. Automatic trust/permission changes would cross an owner setup boundary rather than measure real client behavior.

## Verification

Execute all fourteen target/channel fixtures and feed their projections directly to the real matrix renderer. Test unique runs, simulation labels, no path leakage, strict invalid plans before writes, missing channel binaries without fallback, deadlines/mode requirements and pre-cancelled collection. Use local synthetic native executables to prove exact version probes and continuation after a crash. Exercise the compiled command in an empty HOME and refuse linked/malformed plan files. Synthetic native transports remain tests, not actual authenticated/native evidence.

[◀ Decisions index](./README.md)
