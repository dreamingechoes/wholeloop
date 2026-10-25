# 0103 — Own Docker resources and isolate application publication

- **Status:** Accepted
- **Date:** 2026-10-25

## Context

An inert recipe cannot prove that an application started, copied the intended bytes or denied access to controller files. Docker client exit codes do not establish daemon-side ownership, process termination or a published endpoint. The observed reference daemon also omits host port allocation on an internal network, and distinguishes the root image identity from the selected architecture manifest. Treating either observation as successful readiness would accept the wrong execution contract.

## Decision

1. Add a controller-only Docker execution path above immutable recipes, live private grants and the existing finite effect journal. Require workspace.create and test.run, exact current plan/envelope acceptance, allowed repository topics and bounded effect admission. Persist one scoped environment provisioning intent before invocation; an issued action never runs again. Repeating a completed key reinspects the existing environment. A failed or ambiguous startup retains resources and evidence rather than creating a replacement implicitly.
2. Copy bounded regular files from separately allocated candidate worktrees into owned Docker volumes. Verify the repository, branch scope, HEAD, complete snapshot, selected recipe bytes and Git control before copying. Reject symlinks, submodules, known credential filenames and recognizable credentials. The fixed initialization program reads its payload from stdin and returns a digest of actual written bytes/modes; compare that with the intended copy. Mount no host paths, home, credential store, controller state or Docker socket into application or helper containers.
3. Use exact image digests and separately observe the engine's root image ID, selected platform manifest, OS and architecture. Compare both identities and platform with actual container inspection. Record controller OS/architecture and daemon OS/architecture independently; an emulation request is not evidence of native execution. Keep raw image environment and command configuration in memory only; persisted preflight reports contain configuration hashes.
4. Require a local Unix daemon, observed capacity and supported controls. Reserve aggregate requested capacity across retained environments in the selected external store. Refuse unavailable capacity, missing cache-only images, unsupported scoped egress or secret-reference delivery. Explicit application image pulls occur only inside the issued scoped effect; container creation always uses pull-never. The trusted helper image is a pinned, already cached official Node image, not an arbitrary executable provider plugin.
5. Persist each resource intent before creation and its exact ID, labels and creation fingerprint before startup. Verify actual rootfs mode, user, capabilities, no-new-privileges, image/manifest/platform, mounts, network membership, environment, healthcheck suppression and CPU/memory/process/log limits. Compare actual mounted volume names and ownership, not merely requested mount descriptions. Application and setup commands run as UID/GID 65532; only the fixed initialization helper uses container root with all capabilities dropped and no network.
6. Keep application traffic on an owned internal bridge in isolated gateway mode, or on no network. Disable automatic image health commands. Setup and exec-readiness jobs receive a quarter-CPU ceiling; service quotas retain their explicit recipe values. Every job has its own owned container and finite deadline/output limit. Killing a Docker client is insufficient: after timeout/cancellation, stop the exact owned daemon-side job and observe its terminal state before claiming it stopped. Recheck current authority before every mutation and throughout execution.
7. Publish requested endpoints through a separate fixed controller proxy, with no application mounts. It connects only to one observed owned service/port; its bounded byte stream cannot select another destination. Only that fixed proxy joins an owned ingress network, while the application stays isolated. Bind host publication to loopback, observe actual allocated ports and check the listener. Limit each connection to four MiB, thirty seconds and at most eight concurrent connections; stop the proxy at the original finite lifetime deadline. Never enable broad application egress to make publication work.
8. Preserve recipe-v1's historical direct input-file planning form. The first backend supports read-only input directories with the selected basename below /inputs/ID; an executable file origin uses /inputs/ID/basename. Direct file-mount execution is explicitly unavailable rather than silently reinterpreting old argv. Historical recipes remain readable under the unchanged public contract.
9. Retain immutable hash-linked runtime snapshots separately from actual effect observations. Reinspection checks exact resource ownership, running services/proxies, selected live inputs and bounded candidate snapshots. Historical ready is insufficient for current readiness. Changed candidates, expired lifetimes or unavailable observations never become current acceptance. A created environment or observed setup failure is not semantic QA, human testing, native-client certification, PR readiness or merge permission.
10. Preserve failed resources and the old unexecuted undo ledger. Provisioning performs no automatic deletion. P6-13 supplies public stop/recovery/retirement; the disposable evaluation has a separate explicit successful-test teardown that verifies identities and observes absence. No TTL, guessed name or worker claim authorizes unrelated cleanup.

## Dependency and resource cost

The existing Docker CLI is the local backend; no npm runtime dependency or vendor HTTP integration is added. A pinned cached Node helper supplies fixed initialization, TCP readiness and publication for application images. Initialization/TCP helpers reserve 256 MiB and a quarter CPU; each published port adds a 128 MiB, quarter-CPU proxy. Admission includes that peak overhead. Application images must support the fixed non-root identity and their selected commands; dependencies must already be available in the selected image/cache for offline setup. Unsupported images or capabilities fail explicitly, with no root/network/model fallback.

## Alternatives considered

| Option | Why rejected |
| --- | --- |
| Bind the personal checkout or whole controller store | Exposes unrelated files, authority and credentials |
| Accept CLI exit zero or a requested port binding as ready | Does not prove actual daemon state or an allocated endpoint |
| Compare one image ID for every engine/platform representation | Confuses the root image/index and selected platform manifest |
| Give the application a normal egress network to publish ports | Changes its declared network boundary |
| Run arbitrary helper images/plugins | Broadens trusted controller execution beyond the fixed implementation |
| Stop only the Docker client | Leaves the daemon-side process running |
| Delete by resource name or retention age | Can remove another execution or destroy failure evidence |

## Verification and limits

Deterministic tests cover capability/denial tables, actual-inspect-shaped fixtures, changed controls, retained ownership history, bounded process output and compatible bounded snapshots. The separately invoked Docker evaluation runs actual applications, copied inputs, disjoint ports/data, filesystem/environment/network denials, current-input invalidation and setup failure. It reports the actual controller/daemon separately and preserves unexpected failures. Reference observations use macOS arm64, a Linux aarch64 daemon and Docker 29.9.2; an independent Linux-host/backend trial and actual native model/client acceptance remain open. Static metadata or fixtures do not certify those scopes.

## Sources and links

- [Docker container execution](https://docs.docker.com/engine/containers/run/) and [creation options](https://docs.docker.com/reference/cli/docker/container/create/) define the underlying controls; the implementation verifies actual inspection results.
- [Docker internal networks](https://docs.docker.com/reference/cli/docker/network/create/) and [port publication/gateway modes](https://docs.docker.com/engine/network/port-publishing/) explain network semantics; the retained local probes establish the observed port and image-identity failures.
- [Docker environment guide](../tutorials/delivery-docker.md), [inert recipes](./0102-inert-environment-recipes-and-pinned-setup-origins.md) and [effect recovery](./0098-checkpoint-recovery-and-observed-effect-reconciliation.md).

[◀ Decisions index](./README.md)
