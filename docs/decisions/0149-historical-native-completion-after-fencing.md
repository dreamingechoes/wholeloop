# 0149 — Historical native completion after fencing

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

A completed builder slot is fenced and requeued before another correction generation. Current assignment/transport inspection must reject that old lease. Historical production and its commit checkpoint still need the original successful result; looking only at the mutable queue record makes the original receipt disappear when the slot advances.

## Decision

Add a separate historical native-completion audit. Read the complete validated delivery journal and select exactly one successful settlement by original run, queue, attempt and generation. Replay its exact authoritative prefix, then audit the original assignment, admission, runtime, receipt/result hashes, original source and captured input bytes, and captured artifacts through the same validation used by current completion. Return the original settlement digest/sequence as provenance; do not select the newest directory or another lease.

Current binding/retained/completion methods continue to require the current queue assignment. Share one fresh projection within each audit and recheck the current assignment at the end of a positive current completion. Historical completion omits only current-slot selection; it does not grant dispatch, revive authority, establish current candidate readiness or supply semantic QA.

Original correction production may use this fixed historical host proof after its lease is fenced. Retain exact original native-call prefix closure and deadline checks. Preserve the same outward five-field production object so existing version-one commit bindings keep their original digest. Strict current production inspection remains unchanged. Losing original receipt/input/output evidence still refuses historical success. Original transport history can survive revocation; root cancellation retains its original private channels.

This supports provenance needed for later correction generations. It does not dispatch those generations or implement longer commit/QA chains.

## Alternatives rejected

Using the current queue record loses valid past evidence. Relaxing current completion would revive stale leases. Choosing the latest receipt is ambiguous and can attribute another worker's output. Trusting a saved lease or receipt filename without replaying its settlement discards ownership. Checking only output hashes omits original input provenance. Changing the production object's shape would invalidate existing immutable commit bindings.

## Verification

Run native-host/worker/repair/frozen regressions. Exercise actual synthetic Claude/Codex processes, fence/requeue their lease, reserve another generation and require strict current refusal alongside unchanged historical proof. Reject substituted controllers and altered captured artifacts; preserve original history after revocation without journal writes. A separate original correction control reserves but never launches a later generation, preserves the five-field production object, rejects changed original input/output bytes and recovers while paused without selectors/hosts. Also reopen a retained pre-change version-one commit checkpoint and preserve its exact production digest after fencing. Record actual platform outcomes and limits in the journal.

All 480 directed regressions and three complete synthetic controls pass on macOS Node 24 and Linux Node 20.0.0/Git 2.39.5 with identical compiled code. A retained pre-history version-one commit also keeps its exact production/commit digest after fencing. Static/docs/package checks pass. Later generations are reserved and stopped without launch; no actual later correction dispatch or native-account acceptance is claimed.
