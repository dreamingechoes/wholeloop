# 0172 — Recorded original environment inputs

- **Status:** Accepted
- **Date:** 2026-10-30

## Context

Original provisioning owners retain the request and native clients before a runtime resource exists. Their closure proves termination, including failed preflight; it cannot supply a successfully prepared input to later runner composition. Recovery needs the original ready revision and its actual applied provisioning effect without repeating setup or confusing historical readiness with a currently running application.

## Decision

Add a fixed same-store environment producer over the existing distinct preparation scope. Capture the original context and request before awaiting provisioning. Accept a result only within its original deadline, with the exact original applied ready snapshot, admission preflight, complete stopped operation owners, successful native mutation outcomes and original finished read outcomes. Read probes may legitimately fail before a declared image pull; they must still retain their original finished outcomes. Refuse a foreign context and changed inputs without invoking a backend.

Consume the complete result digest before budgeted artifact capture and publish a small private artifact locator afterwards. Reopen exact observed artifact bytes, original consumption, resource history, effect observations, preflight and native outcomes on every inspection. Missing or damaged evidence returns unknown without selecting a backend, creating a report or changing the journal. Failed or interrupted preparation remains consumed and cannot buy another execution. Expose a copied captured preparation without changing existing scope observation digests.

The recorded-ready result is explicitly historical-only, with acceptance not established. Later original QA and exact retirement do not invalidate its original ready snapshot. Live execution must independently check current authority, candidate bytes, environment state and its own original deadline. Complete-route configuration, automatic product selection and public execution remain separate technical work.

## Alternatives rejected

A ready label or stopped-owner digest alone omits actual successful setup and its immutable effect observations. Reprovisioning after losing a locator risks duplicate effects. Capturing an unbudgeted report bypasses existing artifact limits. Treating all nonzero reads as failed provisioning rejects legitimate missing-image preflight. Inspecting only the latest runtime state loses valid historical preparation after retirement; treating historical readiness as live readiness permits execution against stopped or changed environments.

## Verification

Directed cases cover cancelled, expired, fenced, changed-stage and foreign-invocation refusal, unsuccessful preflight recovery without retry, substituted input refusal, forged result locators and original-signal cancellation. The opt-in producer-result assembly evaluation retains all existing fixed-dispatch controls and adds paused fresh-controller recovery, loss/restoration of the locator, consumption, artifact and native outcome, journal preservation and historical recovery after exact retirement. Actual Docker, authenticated-model and independent Linux-host evidence retain their separate boundaries in the journal.
