# 0065 — Public output registration and event-map identities

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

The command registry and general output schema had diverged: release notes, distribution previews and conformance matrices declared versioned output but had no corresponding JSON Schema variant. Existing command tests did not compare the two inventories. An audit filtering on the presence of schema metadata also missed two event-data maps; their locations identify them as contracts despite that gap.

## Decision

- Register the three missing outputs with their receipt fields, evidence and publication distinctions. Include the optional conformance page receipt without making it mandatory for existing read-only matrix output.
- Check every source and compiled-help command against exactly one versioned output discriminator. Refuse missing/duplicate/unversioned variants and malformed general envelopes. Keep required field checks for actual draft/matrix/delivery output alongside their existing feature tests.
- Inventory source contracts by schema locations rather than requiring metadata to be present before including a file. Check all thirty-six files for a draft declaration, unique identity and version one. Metadata absence must fail rather than hide the contract from its own audit.
- Give the gate and verification suite event maps explicit root identities and a standard properties wrapper, matching the other event maps. Change runtime lookups to that wrapper while preserving every prior event-data rule. Retain hashes of the previously committed maps as compatibility fixtures; actual journal envelopes and persisted data remain unchanged and need no migration.
- Run these checks in the ordinary unit suite, already required by local check and CI. No runtime dependency, extra command or native operation is needed. This registration audit does not finish the complete v1 compatibility baseline, deprecation policy, semantic validator audit or release acceptance.

## Alternatives rejected

Testing only example commands would miss future omissions. Treating a command's versioned string as sufficient would leave JSON Schema consumers without a branch. Adding metadata to a raw event-key map without a standard wrapper would make it look like a JSON Schema without describing those properties. Rewriting persisted events would impose a migration despite unchanged payload rules.

## Verification

Reproduce missing output registration before the fix. Check source/compiled inventory parity, removed and duplicated variants, unversioned identities and malformed envelopes. Check all source schema locations and exact prior event-data rule hashes, then run existing gate and verification replay/workflow tests. Use a compiled seven-client delivery dry run to check required receipt fields without writing output or invoking native clients. Full v1 freeze remains separate work.

[◀ Decisions index](./README.md)
