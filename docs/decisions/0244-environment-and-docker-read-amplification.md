# 0244 — Environment and Docker read amplification

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

Environment stages amplified reads in four places. `EnvironmentResources.get` revalidated the whole snapshot history on every read, including a canonical digest of the growing observation prefix per snapshot: quadratic, and most of the route's 11.8 million `JSON.stringify` calls. Each inert Docker query read the complete stage binding, history and every recorded operation twice in one synchronous span, and listing an operation read its `started` and `outcome` records twice. Creating a resource inspected it and then immediately inspected it again for policy. And every Docker query, read-only ones included, ran as an owned process — writer-locked registration, `node` wrapper, intent and start records, the CLI and a process-table observation — although a read answered over the Engine API starts no process and has nothing to own. About four of every five supervised requests were such reads, each costing roughly 85–130 ms.

## Decision

Every store access that remains keeps its own containment checks ([ADR-0243](./0243-single-writer-store-trust-model.md)); repeated accesses are removed, never the checks of an access that still happens.

- **Validated history prefixes.** Every snapshot is still read and decoded through the guarded reader on every `get`. A leading run of snapshots whose decoded text (fatal UTF-8, so identical bytes) and both schemas' serialized content match the last fully validated history reuses its validated records; the first difference and everything after it take the complete original path. Results are deep copies; retention is bounded to 64 directories and 16 MiB per history.
- **One binding read per query.** An allowed inert read reads the binding only under the writer lock that publishes its locator; an unresolved binding still refuses as `environment-stage-original-unresolved`. Unregistered commands still read first, so binding errors keep precedence. Registered effects select their operation from the listing their admission just validated, and listing reads each record once.
- **Creation inspection.** Ownership and policy are checked on the inspection that follows creation, after its identifier and stamp are bound, so a policy refusal still leaves the resource recorded for retirement. A container's mounts still get a fresh query, and every later effect inspects again first.
- **In-process inspection.** `DockerCli.query` answers `container|volume|network inspect <id…>` (at most sixteen plain identifiers) with one `GET` per id over the local Unix socket, in the CLI's output shape. The endpoint and the client's negotiated `ApiVersion` are learned from the owned preflight answers of the same CLI and connection variables (`docker context inspect`, `docker version --format '{{json .}}'`), so requests reach the same daemon with the same object schema and learning them launches nothing. Only `unix://` endpoints qualify, and Docker's configuration files are never read. Any other shape — daemon `info`, which guards effects and must follow the CLI's current target, `version`, image and context inspection — and every answer that is not a complete 200 within the limits takes the original owned CLI path with its original failures. `RunnerEnvironmentScope` tries an answer after admission and before registering a read owner; an object on another daemon answers 404 and falls back.

## Alternatives rejected

Size, mtime or per-instance caches, skipping snapshot reads and caching bindings between queries would trust earlier bytes. A first in-process version resolved the endpoint with its own synchronous `docker context inspect` — an unowned launch that blocked the event loop for up to five seconds and delayed cancellation, exposed by four cancellation controls — and also served `info`, which would let a daemon identity check observe a socket learned earlier instead of the CLI's current target. Using the daemon's newest API version could change fields that ownership and policy digests read. A long-lived supervisor per environment would still pay process costs for reads that need none.

## Verification

`test/unit/environment/runtime-history-performance.test.ts`: a warm `get` performs zero parses and one schema serialization (584/2576 `stringify` calls at 8/32 snapshots before); a same-length change and a live schema change still refuse. `test/unit/runner/environment-read-performance.test.ts`: inert reads list operations once each, records are read once, refusal order holds, and an answered query registers no read owner. `test/unit/environment/created-resource-performance.test.ts`: one inspection per created volume or network, with the policy refusal still binding the resource. `test/unit/environment/docker-engine.test.ts`: exact served and refused shapes, argument order, the version prefix, fallback on missing, oversized, malformed, failed, slow or cancelled answers, learning the target only from preflight answers, sharing it per connection and launching nothing for an answered query.

[◀ Decisions index](./README.md)
