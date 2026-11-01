# 0190 — Operator report, diagnostics and recovery bundles

- **Status:** Accepted
- **Date:** 2026-11-01

## Context

An operator must understand every result and limit without opening private transcripts: what outcome a run reached, why it stopped and what they may do next. Support needs a shareable diagnostic that cannot leak prompts, credentials, source text or provider responses. Moving work to another machine needs a recovery bundle that is verified byte for byte and restores records, never live authority.

## Decision

Add three read paths and one import path.

- **`wl delivery report`** replays the journal read-only and returns `wholeloop/delivery-report@1`. It reports state and outcome, and one category per terminal receipt: report, code, PR, queue, merge, partial, blocked, failed, exhausted or stopped, with in-progress for running work. It also shows the endpoint and intervention, the plan and grant status, runner stages, effects, human and external waits, unresolved work and the exact next permitted commands. Those commands are derived from the state alone, and a terminal run has none.
- **`wl delivery diagnostics`** returns `wholeloop/delivery-diagnostics@1`, built from an allow-list. It holds the core version, state and outcome, and for each event its sequence, time, actor kind, digest, schema kind and enumerated action or target state, plus effect operations and statuses. Reasons, payloads, prompts, conversations, environment, source content, provider responses and credentials are never included, and the output names what it excludes.
- **`wl delivery recovery-export --include-private`** writes a private bundle holding the journal, the run's plans and its artifacts, with a manifest of per-file sizes and checksums. It refuses without the explicit flag and refuses to overwrite.
- **`wl delivery recovery-import`** verifies every listed file and refuses any tampered, missing or unlisted file before writing. It requires each plan repository to be rebound with `--rebind repository=path` to a local repository that contains the plan's base commit, and refuses unknown or missing bindings. It then copies the records into an inert archive under `delivery/imports/<bundle>`. The target's live journal, claims and grants are never written, so nothing becomes active, and authority must be renewed on the new host.

## Alternatives rejected

A deny-list redactor would leak any field it forgot; an allow-list cannot. Importing into the live journal would restore active grants and claims on a host that never authorized them. Guessing repository paths would silently bind records to the wrong code.

## Verification

- Unit cases check the read-only report and its next actions, and all thirteen outcome categories.
- Diagnostics exclude a secret canary planted in a control reason, the source text and the owner name.
- Import refuses missing, unknown and baseless rebindings, tampered and unlisted files, and a repeat; an accepted import leaves no live journal, authority or run on the target.
- Compiled CLI cases refuse an export without `--include-private` and keep the canary out of diagnostics.
