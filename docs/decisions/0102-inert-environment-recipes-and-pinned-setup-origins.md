# 0102 — Pin environment recipes without treating discovery as execution

- **Status:** Accepted
- **Date:** 2026-10-25

## Context

The environment ledger deliberately records declarations and undo argv without executing them. Autonomous delivery additionally needs actual application environments, but discovering a package script, Dockerfile or guidance page does not authorize execution or prove readiness. Mutable image tags, host paths and ambiguous command origins make an apparently repeatable setup change underneath its evaluator.

## Decision

1. Keep the existing ledger and all its records unchanged. Add closed environment-recipe and recipe-record contracts, prepared in the external controller store. Preparation and discovery execute no package manager, shell, Git command, hook, image acquisition or backend operation. Their receipts explicitly establish no authority or readiness.
2. Discover a bounded named set of candidate files and package script names. Require explicit selection into a recipe; never derive executable commands from discovered prose or auto-run Compose/Dockerfiles. Reject duplicate package JSON keys rather than selecting a last script definition silently.
3. Bind source repository identifiers, exact selected relative file paths and SHA-256 bytes, an immutable image digest, named backend/OS/architecture and explicit emulation policy. Copy selected bounded non-secret bytes into content-addressed external blobs before committing a recipe manifest. Historical reads verify retained bytes independently of current source availability; separate inspection reports changed/unavailable current inputs without rewriting old evidence.
4. Use logical workspace, data and input mounts only. Their targets are fixed to /workspace/ID, /data/ID and /inputs/ID; inputs are read-only. A source repository root is a read origin, never a host-mount authorization. The subsequent backend must bind each workspace to its separately allocated owned candidate; it cannot mount a person's checkout, source root, home, controller state, Docker socket or a sibling from this metadata.
5. Every command has explicit argv/cwd and an origin: literal recipe bytes, immutable image defaults, a selected script/tool file or an exact selected npm package script. Image defaults apply only to an empty service start argv; file origins must appear at their mounted path; package origins require the exact npm run script invocation and package directory. Shell syntax requires an explicit shell argv; the controller never interpolates a shell command.
6. Declare a service DAG, loopback-or-unpublished ports, TCP or explicit exec readiness, data roots, setup/seed/test commands, network phases, finite per-command/readiness limits and aggregate capacity. Defaults are five-minute setup, two-minute readiness, eight services, 8 GiB and four CPUs, with finite contract maxima. These are requested ceilings; runtime admission still needs actual host capacity and operator authority. Unmet capacity must not silently lower or enlarge the contract.
7. Separate cache-only image use from an explicit-pull request. Declare no network, internal service networking or scoped destinations for setup/runtime. Planning a scoped destination or secret-reference provider does not mean the first backend can enforce or deliver it: actual unsupported capabilities must refuse before startup. Never infer egress from a failed download or copy secret values into files, argv, receipts or app configuration.
8. Retain failed resources; retention deadlines are inspection reminders, not automatic deletion. Recipe preparation starts no cleanup. Exact observed backend ownership, readiness, cancellation and explicit retirement remain P6-12/P6-13. No recipe or declaration becomes semantic QA acceptance.

## Alternatives considered

| Option | Why rejected |
| --- | --- |
| Execute discovered package/Compose setup automatically | Turns untrusted discovery into an implicit effect grant |
| Reuse undo ledger entries as executable environment definitions | Changes the meaning of existing unexecuted declarations |
| Bind directly to arbitrary host paths | Exposes unrelated files and confuses source origins with owned workspaces |
| Store only live file paths or image tags | Cannot reproduce or inspect an earlier selected revision |
| Treat recipe inspection as ready | Omits actual service identity, health, capacity and containment evidence |
| Enable broad network or plaintext credentials when setup fails | Changes authority and exposes private data |

## Verification and limits

Tests cover actual file reads, synthetic malicious hooks that remain unexecuted, duplicate package keys, immutable retained bytes, changed inputs, path/symlink/credential/limit refusals, dependency cycles and independent compiled CLI processes. Existing ledger regression tests remain unchanged. The executable guide requires neither Docker nor accounts. Actual containers, service identity, denial, platform/daemon architecture and lifecycle observations remain separate backend tasks.

[◀ Decisions index](./README.md)
