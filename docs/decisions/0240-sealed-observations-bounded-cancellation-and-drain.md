# 0240 — Sealed observations, bounded cancellation and drain

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

Fixed review and verification inspectors composed readers that each started their own observation: one review inspection made 422 Git calls, 182925 lstat calls and 46909 opens, and both took no-op writer locks to read sealed decisions. Inside those observations the same workspace files were reread for every context (12/48 times for 12/48 calls), and every scoped Git query rebuilt and hashed the complete environment. Native-scope manifests and cancellation files were read without byte or file-type bounds, so a FIFO could block a reader past its own timeout, and identical cancellation requests were rewritten and flushed on every poll. A released foreground owner's drain poll performed four journal observations and three authority reads.

## Decision

- **Sealed stage observations.** Read the fixed review or verification selection inside one fresh observation ([ADR-0227](./0227-verified-read-observation-scopes.md)) that forbids writes and rereads every captured input before releasing a verdict. When recovery metadata is missing, close that observation, discard the selection and run the original recovery from a fresh read; never retry a failed proof or write under an inherited observation.
- **Shared workspace snapshots.** Inside an observation, capture one workspace snapshot per root, owned limit profile and exact Git environment identity, and recompute the complete physical snapshot at the final barrier, which also closes a reproduced gap where file bytes, modes or links changed after capture. Malformed bounds keep the original uncached path.
- **Environment fingerprints.** Reuse the previous environment digest only after enumerating every current key and comparing every value; retention is bounded to 512 fields and 65536 code units, and values are never logged or written.
- **Bounded native reads.** A non-following metadata lookup decides absence; present manifests and cancellation requests are read only through the bounded descriptor reader with its EOF proof. A cancellation whose current nonce already matches is not republished.
- **One drain query.** `currentForDrain` makes one fresh request and budget observation that accepts active ownership or the exact released owner; ordinary admission still requires active ownership.

## Alternatives rejected

Wrapping every inspection would break missing-write recovery. Reusing a snapshot without final revalidation keeps the freshness gap. Caching presence, cancellation or drain facts across polls could hide deletion, replacement or revocation. A metadata size does not prove actual input length ([ADR-0234](./0234-complete-source-path-validation-and-bounded-read-loops.md)).

## Verification

`test/unit/runner/review-observation.test.ts`: the retained review inspection falls from 422 to 37 Git calls and 46909 to 848 opens with the same complete result and no locks or writes. `test/unit/gates/snapshot-observation.test.ts`, `test/unit/worktrees/git-environment-performance.test.ts`, `test/unit/runner/native-scope-reads.test.ts`, `cancellation-writes.test.ts`, `native-cancellation-reads.test.ts`, `foreground-reads.test.ts` and `foreground-drain-performance.test.ts` cover single snapshot capture with final revalidation, 100 fingerprints → 1, FIFO and oversize refusal, idempotent cancellation and twelve drain polls reading 24 instead of 96 segments.

[◀ Decisions index](./README.md)
