# 0089 — Scripted final approval in framing conformance

- **Status:** Accepted
- **Date:** 2026-10-22

## Context

Framing now requires approval of the final exact artifact and a final semantic
review (ADR-0086). The one-shot native scenario supplied an initial go, which
does not approve a later model-written revision. A correct client could pause
for the missing approval; the old simulation still used unreviewed completion.
Native timeouts have other possible causes too: this mismatch alone does not
explain them or establish that they are fixed.

## Decision

Add a versioned scripted declaration for the fictional Fixture Owner alongside
the bundled scenario. It approves one rendered final artifact SHA-256 and an
explicit go/reason/stop decision. Validate both bounded inputs, compose existing
owner-decision validation and bind both source inputs into the scenario digest.
Changing the declaration makes old prepared runs incompatible; retain their
historical receipts rather than rerunning or relabelling them.

The native prompt supplies those exact final bytes as JSON-string data. A changed
revision requires a new declaration; the client cannot approve arbitrary output.
The fictional declaration supplies no reviewer and does not waive semantic
challenge. Require a valid same-run final-review note, matching decision and
exact artifact in the structural judge. Shared pure decision rendering changes
no real framing command, human approval requirement or legacy store contract.

The simulation exercises frame draft/finalize with an explicitly SIMULATED
reviewer. Its result stays FIXTURE_PASS; it cannot establish native challenge or
human approval. Live review remains client-reported, with no independent proof
of semantic truth, reviewer identity or role isolation. This is transport
conformance for declared test data, not an evaluation of original framing prose.

## Alternatives rejected

Treating an initial go as approval of unseen content contradicts the new framing
contract. Automatically approving whatever a model writes fabricates authority.
Dropping final review from the skill or retaining the old weak judge would hide
the mismatch. Requiring a real human for every nightly fixture prevents the
intended unattended transport check. A production bypass flag would widen scope;
the declaration is available only inside the explicit fictional scenario.

## Verification

Pure fixture cases cover invalid/missing/non-scripted declarations, wrong owner
or outcome, stale hashes, source changes and redacted errors. Installed-core
simulations cover all seven launchers and compiled preparation. Judge regressions
reject absent, duplicated, misplaced, stale and incomplete reviews, altered
artifacts/decisions and known simulated review presented as live. These tests
do not establish a fresh native framing pass or real human acceptance.

[◀ Decisions index](./README.md)
