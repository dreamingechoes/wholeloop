# Reproducible execution environments

> **TL;DR** — Start the actual application and its dependencies in resources owned by one execution. Separate controller authority from untrusted build/test commands, and retain observed lifecycle receipts. A worktree or declared undo recipe alone is not containment.

> [!NOTE]
> **Status: 🚧 partial.** P6-11 implements inert discovery, closed recipes, exact selected-byte retention and current-input inspection. P6-12 adds owned Docker provisioning/setup/readiness and current-resource inspection. P6-13 adds owned stop, private native cancellation, partial lifecycle recovery and explicit retirement. Actual backend checks pass on a macOS arm64 controller with a Linux aarch64 daemon and on an independent Linux x86_64 host; actual native acceptance remains open. Docker is the first isolated backend; existing local scripts remain available in explicitly supervised operation.

The internal provisioning API also enforces an optional enclosing controller's captured deadline, signal and ownership across preflight, resource admission and actual setup calls. Original operation observations and independently bounded service lifetime remain separate. This parent control does not itself establish root producer ownership or complete-route preparation; see [ADR-0169](../../../docs/decisions/0169-original-parent-controls-for-provisioning.md).

## Environment recipe

The internal runner scope also retains a distinct original preparation phase before any runtime resource exists, then binds actual preflight clients and later mutations to the same captured request and candidate content. Fresh inspection and original cancellation do not repeat provisioning; closure alone establishes no readiness. The fixed producer separately recovers the exact original applied ready input through consumed budgeted artifact bytes, preflight and successful native outcomes, including after retirement. Its readiness remains historical-only with no acceptance. Complete-route selection remains technical work; see [ADR-0171](../../../docs/decisions/0171-original-runner-provisioning-owners.md) and [ADR-0172](../../../docs/decisions/0172-recorded-original-environment-inputs.md).

The backend captures the complete original provisioning request before validation and asynchronous preflight. Later caller-owned changes cannot select a different run, resource key, recipe, helper or candidate set for admission; see [ADR-0170](../../../docs/decisions/0170-original-provisioning-request-capture.md).

Implemented planning contract `wholeloop/environment-recipe@1` contains a named backend, immutable image identity, explicit repository mounts, bounded argv/cwd commands, service dependencies, readiness checks, fixture-data setup, ports, resource limits, network policy, secret references and cleanup policy. Do not store secret values or accept arbitrary executable provider plugins.

Discover candidates from repository guidance, then require explicit selection and pin their bytes. Existing scripts/package commands may be referenced; discovery never executes them. Shell-dependent setup must select a named shell explicitly rather than turn every command into interpolated text.

| Stage | Receipt |
| --- | --- |
| Preflight | Backend/version/architecture, available capacity, mounts, image and selected capabilities |
| Provision | Owned environment/service IDs and immutable recipe digest |
| Setup | Actual commands, exits and bounded sanitized output references |
| Ready | Executed health checks and exact application endpoint |
| Test | Candidate/source digest, data revision and test/evaluator assignments |
| Stop | Observed service/process shutdown, retained volumes and unresolved effects |
| Retire | Exact owned resources removed or retained, with reason |

A setup failure is not an application defect. Baseline readiness must be observed before judging a feature. Defaults proposed for review: 5 minute setup deadline, 2 minute readiness deadline, at most 8 services, 8 GiB memory and 4 CPUs per environment; smaller host capacity causes an explicit capacity pause. Overrides are finite and operator-authorized.

The [executable environment guide](../../../docs/tutorials/delivery-environments.md) exercises discovery/preparation/inspection without a backend. [ADR-0102](../../../docs/decisions/0102-inert-environment-recipes-and-pinned-setup-origins.md) distinguishes logical mounts and read origins, explicit argv origins, retained bytes and requested capabilities from actual execution evidence.

## Containment contract

Use separate controller and worker filesystem views. Mount only explicitly selected worktrees, fixture data and assignment inputs into a worker. Never mount the controller store, personal home, credential stores, host Docker socket, arbitrary host roots or another worker's workspace. The controller owns backend operations.

The worker cannot run as privileged, request host networking or gain the controller's identity. Restrict mounts, capabilities, outbound destinations and resource quotas through the backend. Native client integration/model access must be supplied through supported scoped mechanisms; if this cannot be done without exposing broad credentials, the delegated mode is unavailable.

Image acquisition, package downloads and model access require declared network phases. Offline runs do not quietly gain egress to make setup succeed. Treat image provisioning as an explicit effect; pin digests and distinguish prepared-cache use from a real pull. No runtime platform claim follows from an image tag or a synthetic host.

The initial Docker backend supports a local Linux daemon, including a macOS-hosted Linux VM. Report host OS, daemon OS, architecture and emulation separately. Do not claim native macOS application execution inside a Linux container. An absent backend produces a supported supervised fallback offer, never an automatic permission change.

The [Docker guide](../../../docs/tutorials/delivery-docker.md) documents current commands, the pinned helper, real disposable evaluation and explicit unsupported capabilities. [ADR-0103](../../../docs/decisions/0103-owned-docker-environments-and-isolated-publication.md) records observed image/index, publication and cancellation constraints.

## Services and data

Allocate disjoint ports through the existing store and bind public endpoints to loopback by default. A readiness check must observe the intended owned service, not a coincidental process already listening. Service dependencies form an acyclic graph with finite readiness deadlines.

Create a separate database/schema/volume or equivalent disposable data root per environment. Seed only owned fixture resources and record their revision. Reusing production or a personal development database is not the default. A reference environment and an implementation environment must not share mutable data.

The feature's services can write their declared ephemeral data; evaluator access to implementation source and hidden scenarios remains separate. Tests that require OS/device features unavailable in the selected backend remain human/unavailable criteria.

## Lifecycle and cleanup

Persist ownership before startup. On recovery, inspect backend resource IDs and labels plus controller-recorded identity; names alone do not establish ownership. Never adopt an existing unrelated container or volume because its name matches.

Support keep-on-failure and explicit retention deadlines. Default successful disposable resources may be retired only after observed shutdown and the run's retention policy; default failed resources are retained with an inspection path until the operator chooses retirement. Do not silently lose evidence through a TTL.

Automated cleanup executes only reviewed backend-owned lifecycle operations on exact owned resources. Current environment-ledger undo recipes stay declarations requiring their existing inspection boundary. Report partial teardown and attempt no unrelated deletion. Worktree cleanup retains its merge/abandon rules.

The [lifecycle guide](../../../docs/tutorials/delivery-lifecycle.md) describes closed digest-bound requests, permanent startup fences and retained failure data. [ADR-0104](../../../docs/decisions/0104-owned-environment-lifecycle-and-private-cancellation.md) records why recovery cancels through private channels and never signals stored PIDs.

## Acceptance and tests

- [ ] **ENV-01:** Two environments start the same application with disjoint ports and data; writes in one are absent from the other.
- [ ] **ENV-02:** Backend tests deny controller-store, home, credential, sibling-worktree and Docker-socket access.
- [ ] **ENV-03:** Wrong service identity, dependency cycles, bad readiness, setup failure and port exhaustion refuse readiness.
- [x] **ENV-04:** Stop/restart/retire under interruption preserve exact ownership; an unowned resource is never removed.
- [ ] **ENV-05:** Network-denied setup and missing images are reported explicitly; no ambient credentials or automatic broad fallback appear.
- [ ] **ENV-06:** Recipe changes invalidate environment readiness and dependent QA evidence.
- [x] **ENV-07:** Real backend checks run on macOS and Linux hosts, recording architecture and limitations; Docker fixtures alone do not pass them.

Test pure planning with synthetic backend responses, then run actual disposable containers for filesystem, services, data, cancellation and cleanup assertions. Account-bound native client startup remains a separate trial.

[◀ Runner](./02-durable-runner.md) · [Behavioral QA ▶](./04-behavioral-qa.md)
