# Operator overview and local change feed

> **TL;DR** — `wl overview` orders the harness's attention and exposes exact next commands. The core owns this meaning; an interface renders it. The local feed delivers complete views and bounded activity without a listener.

> [!IMPORTANT]
> **Experimental.** Operator attribution, the read-only overview, its schemas and the local feed are tested. They belong to autonomous delivery, which may change in a minor release. See [ADR-0210](../decisions/0210-operator-overview-and-change-feed.md).

## Reading the harness

`wl overview --json` emits `wholeloop/overview@1`. Its readable default is the same document indented. `wl overview schema --json` returns the overview and feed JSON Schemas without opening a store, with explicit runtime availability. The overview reads the configured external store and local flow/checkpoint configuration; it acquires no writer lock, repairs no cache, starts no worker and opens no listener.

The reader checks the writer lock and observes the canonical journals and required auxiliary facts twice on one attempt clock, sampled after capturing its journals. This prevents a new legitimate commit from looking like a clock rollback. Explicit as-of replay clocks stay fixed. Interrupted validation retries within the same three-attempt bound; persistently invalid bytes still fail closed. It retries a changed snapshot three times, then reports `store-busy` rather than mixing facts from different reads. Held locks produce that same conservative result. Invalid inputs produce fixed, redacted problems and exit 3. An unavailable view has unknown totals and cursor, not fabricated empty or complete results.

Item flow reuses the execution engine's inherited decisions and dependency rules. Delivery actions and outcomes share the delivery report projector; runner facts and budget boundaries use their existing inspectors. A journaled active grant and a currently active authority observation are distinct facts. Missing or changed basis, expired authority and budget boundaries suppress new work. Uncertain controller ownership suppresses a second run or resume and retains reconciliation.

## Canonical read positions

The opaque canonical `v1` cursor binds two journal prefixes. The state position contains the event count, last event ID and complete-prefix digest. The delivery position contains the global sequence and existing hash-chain tip. Projection filenames, modification times and segment names do not establish a position. Rebuilding projections leaves the cursor and semantic view digest unchanged.

Decoding bounds the token before parsing and rejects unknown fields, versions and noncanonical bytes. Resuming verifies both prefixes against the complete validated journals. Edited or truncated prefixes fail with a fixed category, without echoed contents. Monthly or segment rollover preserves an unchanged prefix. A cursor is a read position and grants no execution authority.

The semantic digest excludes only `asOf`. Auxiliary observations can change the view without appending an event: a recorded person decision, expiry or an unavailable basis changes meaning while retaining the same cursor. A consumer must use the view digest for these changes and keep the cursor for journal resumption. Legacy timestamps without an explicit zone remain unknown instead of acquiring the observer's host timezone.

## Core precedence and commands

Attention is ordered by store problems, ambiguous effects, unknown worker ownership, human decisions, item decisions, inactive grants, unavailable basis, budget boundaries, failed runs, exhausted runs, blocked runs, paused runs, blocked dependencies, due checkpoints and unread mail. Typed target kind/ID and entry ID break ties. Ordering happens across the full input before truncation, so a visible prefix cannot hide a more urgent entry.

The headline chooses unavailable, attention, blocked, running, waiting, ready, complete, empty or idle from factual counts and categories. Renderers do not rerank it. Inherited parent approvals appear once. Next commands are argv arrays with bound IDs and explicit person/outcome input descriptors; a consumer must collect those inputs. It must never substitute an approval or infer a person's identity. Generic item approvals include `--basis`; the actual writer transaction rejects a stale displayed basis. Specialized artifact decisions keep their own validators and offer inspection here.

## Bounds, provenance and privacy

Visible limits are 128 attention entries, 256 items, 64 deliveries, 256 agents, 128 worktrees, 128 checkpoints and 50 recent outcomes. Counts and omitted totals describe the full collections. Nested decisions, controllers and dependencies are bounded to 32; actions to eight and currencies to eight. Canonical input readers impose byte/event limits before projection; the final JSON is bounded to 16 MiB. Exceeding a bound on required input fails closed rather than publishing partial facts.

Session agents are last seen, never presumed present. Client/model declarations retain their explicit source. Worker claims, observed process identities, fixture or host semantic evidence, recorded person decisions, operator grants and pinned policy remain separate fields. Missing usage stays unknown. Inspection establishes no native acceptance.

The view excludes item text, source payloads, prompts, conversations, person names, decision notes, private rationale, environment values and credentials. It includes typed identifiers, digests, categories and exact store-bound command arguments. Private diagnostics/export boundaries remain unchanged.

## Consumer contract kit

Schemas live in `src/overview/schemas/`; `wl overview schema` exposes the installed versions. `test/fixtures/overview/` includes static archives and expected output for every headline and attention kind. Each archive contains canonical journals plus explicitly synthetic auxiliary observations. Tests replay the journals and compare the frozen output through the actual projector and JSON Schema. These archives are inert consumer examples, never runtime state or imported authority. Separate real-store differential tests exercise the reader, existing inspectors, rebuilds and private canaries.

## Following local changes

`wl watch [--since <cursor>] [--poll]` emits compact newline-delimited `wholeloop/watch-frame@1` documents, including when `--json` is omitted. `--poll` disables filesystem watchers; otherwise nonrecursive file events are hints and a one-second poll is the correctness fallback. The default idle liveness interval is fifteen seconds. The reader serializes snapshots and output, awaits backpressure and cleans up watchers and timers on interruption. There are no store writes or network listeners.

The four frame kinds are complete overviews, activity batches of at most 128 events, liveness and problems. Process-local sequence numbers start at one. Each activity identifies its journal and ordinal/global sequence, typed event ID, digest, category, actor kind and provenance. It copies no payload, names, reason, source contents or prompt. Independent journals have no invented total time ordering: each batch consumes the next state prefix, then the next delivery prefix. Rapid commits may coalesce into one observed stable view; activity retains every event. The feed does not fabricate historical auxiliary observations at skipped intermediate positions.

Initial views, observation-only refreshes, journal views and liveness all carry `progress: false`. Only activity records can establish progress: a completed state step, a committed delivery budget-progress record or a completed delivery control transition. Fixture evidence stays fixture evidence, and a process observation establishes neither model execution nor native acceptance. Heartbeats never count as work.

A frame's outer `resumeCursor` acknowledges delivered activity. With `--since`, an initial current overview may have a newer nested `overview.cursor`; the outer checkpoint remains the supplied cursor until subsequent activity batches are delivered. Consumers persist only the outer checkpoint of a complete parsed NDJSON line. Full views may repeat after restart; activity resumes from the saved prefix without inventing historical auxiliary observations. Without `--since`, the first healthy read establishes the starting checkpoint and follows later activity.

Configuration, expiry or a retained human decision can change the semantic digest with the same cursor. Such an observation emits a full view without an activity acknowledgement. Held writer locks produce non-progress liveness and retry; an initially busy store also gets an unavailable initial view with unknown facts. Changed/truncated retained prefixes, invalid sequences/digests or unreadable input emit a fixed redacted problem and exit 3, without advancing the last good checkpoint.

SIGINT, SIGTERM and a broken output pipe cancel the reader. A slow or closed consumer cannot leave a blocked drain holding the process forever. Node's standard output intentionally refuses ordinary stream destruction, so the binary discards an interrupted stream only after the reader has cleaned up. An incomplete final line supplies no resume checkpoint; normal commands and non-interrupted problems keep ordinary buffered output behavior.

The consumer kit includes `test/fixtures/overview/recorded-feed.json`, generated by the actual reader/emitter over a deterministic fixture timeline and checked against both schemas. Static archives remain consumer examples rather than runtime authority. Cross-platform runtime checks and the complete task gate are recorded in the roadmap; no native/client acceptance follows from the feed.

<!-- docnav -->
[◀ State and messaging](state-and-messaging.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Orchestration and gates ▶](orchestration-and-gates.md)
