# Operator overview and local change feed

> **TL;DR** — One core projection will order the harness's attention and expose exact next commands. A local feed will deliver the projection and bounded activity without a listener or store writes. Interfaces render these meanings; they do not derive them.

> [!NOTE]
> **Status: 🚧 partial.** P6-36 attribution is complete. P6-37 has internal verified-prefix cursor and deterministic precedence functions with unit tests; the store reader, overview CLI, schemas and fixture kit are not yet implemented. P6-38's feed remains pending. See [ADR-0210](../decisions/0210-operator-overview-and-change-feed.md).

## Canonical read positions

The internal cursor binds two journal prefixes. The state position contains an event count, last event ID and digest of the complete prefix. The delivery position contains the global sequence and the existing hash-chain tip. Projection filenames, modification times and segment names do not establish a position; rebuilding a projection must not change one.

The opaque `v1` token uses canonical JSON encoded as base64url. Decoding bounds the token before parsing, rejects unknown fields and versions, and checks canonical bytes. Resuming verifies both prefixes against the current complete journals. A counter alone cannot establish an unchanged history: edited or truncated prefixes fail with a fixed problem category and no echoed contents. Monthly or segment rollover does not change a retained prefix's identity.

These helpers consume already validated journal arrays. They neither read files nor authenticate an actor, grant permission or claim that a worker is still present. The future reader must validate complete current inputs before using them. A cursor is a read position, never execution authority.

## Core precedence

The internal attention order is explicit: store problems, ambiguous effects, unknown worker ownership, human decisions, item decisions, inactive grants, failed runs, exhausted runs, blocked runs, paused runs, blocked dependencies, due checkpoints and unread mail. Within a category, typed target kind/ID and entry ID provide stable ties. The complete list is ordered before a display bound is applied.

The internal headline function chooses among unavailable, attention, blocked, running, waiting, ready, complete, empty and idle. Store health wins; unresolved decisions and ambiguity precede routine activity. It consumes factual counts and categories. It does not turn a claim into observed execution, select an outcome or invent a reason. Store-to-category classification remains P6-37 work and will reuse the existing status/report/runner rules.

## Remaining projection and feed work

The overview will expose bounded items and flow positions, run summaries, observed workers and last-seen session agents, worktrees, checkpoints and recent outcomes. Private reasons, prompts, source contents and credentials stay outside that view. Default diagnostics and exports already retain P6-36's private-rationale boundary.

Next commands will bind known typed identities and declare any required person or outcome input. They must not select approval or infer who a person is. A read-only inspection remains available when mutable prerequisites are unavailable. The overview and feed contract kit will include schemas and fixture stores before the task closes.

The future feed must keep liveness separate from progress and preserve a resume checkpoint for activity already delivered. An initial current overview must not acknowledge activity batches that have not been delivered yet. File events are hints; polling is the fallback. None of this preparation establishes P6-38's replay, resume, Linux or no-write acceptance.

<!-- docnav -->
[◀ State and messaging](state-and-messaging.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Orchestration and gates ▶](orchestration-and-gates.md)
