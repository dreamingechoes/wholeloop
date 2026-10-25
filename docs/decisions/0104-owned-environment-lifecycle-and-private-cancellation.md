# 0104 — Recover owned environment lifecycle through private cancellation

- **Status:** Accepted
- **Date:** 2026-10-25

## Context

A killed Docker CLI can leave daemon-side work running or applied. Its stored PID can later belong to another process; a process's absence cannot be inferred from a timeout. Likewise, a failed inspect does not prove that a resource was removed. Cleanup needs its own recoverable evidence and narrow authority after a run's execution grant expires or is revoked.

## Decision

1. Keep lifecycle control operator-only, with a closed request naming an exact environment, current runtime digest, stable request ID, action and reason. Reject recognizable credential-bearing metadata before any request or fence is persisted. Stop and reconcile permanently fence further provisioning. They stop known owned containers and retain volumes and external evidence. Explicit retire additionally removes exact resources after observed shutdown; it grants no ability to resume work, undo a ledger recipe, delete a topic or publish code.
2. Track every new provisioning mutation before dispatch. A fixed native wrapper receives private input only after its actual process-group leader is registered. The wrapper watches an external cancellation channel, terminates its own children and enforces a finite timeout even if its controller dies. Recovery never signals a stored PID: it cancels through the channel and observes the whole group absent using a bounded POSIX process-table read. Unavailable observation or a reused/live group remains unknown.
3. Bind provisioning tracking before any resources exist. Do not retrospectively label an incomplete old environment as tracked. A completed old ready history can be stopped; an ambiguous old caller retains uncertainty and blocks destructive retirement. Fixture provenance cannot authorize a host-observed resource or become actual host certification.
4. Serialize lifecycle controllers through a private, preserved claim. An unreleased live, reused or unobservable controller PID blocks a successor; a positively absent controller permits a new claim. Keep immutable request, claim, release and receipt records outside Git. Repeating a completed request returns its historical receipt without new actions; a changed request ID binding or stale first review refuses. Interrupted requests resume their exact original review and reinspect actual state.
5. Require the original daemon and complete resource identity before stop or remove: ID, name, controller labels, nonce and creation fingerprint. Recover an unknown created ID only from its full original intent tuple, creation window and policy. Successful filtered listing establishes exact absence; an inspect error, shortened/malformed identity or guessed name does not. A same-name replacement with foreign labels or a changed fingerprint remains untouched.
6. Persist stop/removal intent before the action, inspect stopped containers and positively observe absence after removal. Order retirement as containers, networks, then volumes, without force removal. A lost response is reconciled by a new controller before any retry; an already absent resource is not removed again. Preserve partial cleanup and failure receipts. Admission reserves immutable history capacity for startup, ten readiness attempts, observed stop and a complete retirement, leaving bounded recovery headroom. Release reserved CPU/memory only for an observed stopped/retained/retired environment; unknown state remains reserved.
7. Retention review dates are inspection reminders, never deletion timers. Failed data remains inspectable until explicit operator retirement. Successful environments may also be kept; selecting explicit retirement is separate from observing success. Runtime acceptance and publication remain unestablished/unperformed.

## Alternatives considered

| Option | Why rejected |
| --- | --- |
| Kill the PID saved by a previous controller | Can terminate an unrelated reused process |
| Stop only the client or wait for a lease | Does not prove daemon-side shutdown or prevent a late request |
| Delete by guessed names, labels alone or a failed inspect | Can mistake replacement resources or unavailable reads for owned absence |
| Retry an interrupted remove blindly | Loses the distinction between applied, failed and unknown effects |
| Automatically execute old undo recipes or delete worktrees | Broadens lifecycle authority beyond the reviewed backend resources |
| Delete retained volumes on a TTL | Destroys useful failure evidence without an operator decision |

## Verification and limits

Unit cases exercise actual native wrapper startup/cancellation, unrelated process groups, fenced dispatch, immutable metadata, current reviews, foreign identities, partial cleanup and legacy uncertainty. The explicit disposable Docker evaluation observes shutdown with retained volumes, a same-name foreign replacement and a deliberately killed retirement controller; a fresh compiled CLI continues by exact observation. No account, model, Git push, PR or merge is involved. Independent Linux-host Docker acceptance remains open; deterministic Linux-container checks do not certify that host boundary. The backend assumes its native Docker/process tools and controller store are trusted. An external administrator concurrently replacing volume names has the daemon's authority; Docker volume removal offers no atomic fingerprint compare-and-delete operation.

[◀ Decisions index](./README.md)
