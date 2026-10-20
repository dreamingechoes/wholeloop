# 0059 — Conformance observations and regression candidates

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

The framing runner distinguishes preparation, installed-core simulation and live
process/journal evidence. A nightly matrix must retain those distinctions instead
of promoting an absent run or generated adapter declaration into native support.
Failures can also come from authentication, managed policy or changed harness
inputs; a latest failure alone does not identify a CLI version regression.

## Decision

- Add a pure matrix builder over wholeloop/conformance-results@1 input and an
  explicit as-of time. Each observation wraps one complete report, channel and
  actual observation timestamp. Render all seven targets and both pinned/latest
  channels in stable order, including missing observations as UNRUN.
- Validate the consumed report projection: schema, supported target/scenario,
  exact version pins, run IDs, hashes, process metadata, status/evidence consistency
  and bounded assertion codes. Reject duplicate target/channel observations and
  reused run IDs, oversized batches, future dates and false successful reports.
  PASS requires a successful native process at its pin, no missing assertions and
  the standalone initiative. FIXTURE_PASS requires simulation evidence.
- Retain requested versus observed versions, simulation/native evidence and
  timestamps independently. Mark observations older than 48 hours stale. The
  two-day window tolerates one missed daily job without claiming timeless support;
  stale observations cannot produce current regression candidates.
- Require a fresh native pinned PASS and latest FAIL on different exact versions,
  both with successful processes and identical core/source/scenario bindings,
  before identifying a regression candidate. Include actual version names, named
  assertions, original run IDs and a deterministic content key for future issue
  deduplication. A candidate is a structural discrepancy, not an adjudication of
  semantic model quality or every native capability.
- Keep the CLI read-only. Read one regular non-symlink JSON file of at most 1 MiB,
  emit versioned JSON or Markdown and never retain raw reports in repository
  runtime state. Exit 4 identifies candidates or invalid file/usage; successful
  rendering without candidates exits 0 even when every row is UNRUN. That exit
  code cannot serve as a native conformance gate by itself.
- Imported observations are supplied evidence, not authenticated attestations.
  Do not overwrite their timestamps, re-execute clients, publish issues or update
  the platform page implicitly. Scheduled collectors, version resolution, issue
  handling and owned documentation integration remain separate implementation.

## Alternatives rejected

A green matrix derived from rendered capabilities would confuse local output with
native execution. Treating every latest failure as a regression would file issues
for missing credentials and incomparable cores. Selecting the last duplicate
silently would let input order decide evidence. Updating old timestamps during
rendering would hide stale observations. Automatic page writes from this reader
would conflate imported reports with reviewed documentation.

## Verification

Table-driven fixtures cover unknown, stale, simulated, comparable and incomparable
results, failed processes, version mismatches, deterministic ordering/deduplication,
malformed metadata and false passes. Compiled CLI checks cover read-only rendering,
candidate exits, JSON/Markdown exclusivity, redacted parse errors, size and symlink
refusal. Supplied native-looking reports in these tests are synthetic; no actual
native model, CI execution or issue publication was performed.

[◀ Decisions index](./README.md)
