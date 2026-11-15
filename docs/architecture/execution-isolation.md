# Execution isolation — why project code runs only in Docker

> **TL;DR** — Whenever `wholeloop` itself must run your project's code — its test suite, its services, its acceptance checks — it runs them in owned Docker containers, never on your machine. Docker is a deliberate, required dependency for those steps: it is what lets the runner trust observed results instead of a model's claims, without exposing your home directory, credentials or network. Steps that only read and write documents and the store do not need Docker.

> [!NOTE]
> **Status: 🚧 partial.** Owned containers, volumes and networks, the refusals below and recovery are tested on macOS and Linux. Standalone headless gate workers still inherit the caller's environment; see [Known gaps](#known-gaps). Decision: [ADR-0245](../decisions/0245-require-docker-for-project-code-execution.md).

---

## Why Docker is required

The point of the runner is that you can trust its verdicts. A verdict such as "the suite passes" or "the endpoint returns 200" is only worth something if the runner observed it itself, so it has to execute code a model has just written. Running that code directly on your machine would give it your home directory, your shell environment, your SSH and cloud credentials and your network. Docker gives the runner what it needs instead:

| Need | What the container provides |
| --- | --- |
| Containment | No host mounts, no host environment, no Docker socket, no network unless the recipe declares an internal one |
| Repeatability | An image pinned by digest, inputs pinned by content hash, explicit commands with fixed working directories |
| Ownership | Every container, volume and network is labelled, re-inspected before each effect, cancellable and retired by the run that created it, even after the controller crashes |
| Bounded cost | Memory, CPU, output, time and capacity limits that refuse before starting |

This is a conscious trade-off: Docker is an external dependency you must install, in exchange for strict, observable checks. There is no fallback that runs project code on the host when Docker is missing; such a fallback would silently remove the guarantees above, so the step refuses and says why.

## Which steps need it

```mermaid
flowchart LR
  A[research · frame-problem · write-spec · cut-scopes · slice-work] --> B[(store and documents)]
  C[build-slice · review-code · open-pr] --> D[(store and Git worktrees)]
  E[verify-works · integration · acceptance] --> F[[owned Docker containers]]
  classDef primary fill:#2563eb,stroke:#1e40af,color:#ffffff
  classDef neutral fill:#f8fafc,stroke:#64748b,color:#0f172a
  class E,F primary
  class A,B,C,D neutral
```

Steps that execute project code need Docker whether you call them one at a time or let the runner chain them. The others never contact it.

## Requirements

- A Docker Engine reachable through a **local Unix socket**, with permission to create containers, local volumes and bridge networks. Remote, TCP and SSH contexts are refused.
- A **Linux** daemon, version 28 or newer; the reference engine is 29.9.2. The preflight observes the actual daemon; a version string alone is not trusted.
- The pinned helper image already in the local cache; nothing is pulled silently. See the [Docker environments tutorial](../tutorials/delivery-docker.md).

## Secrets and environment variables

`wl` is built so that running your project in Docker does not read or forward your secrets:

- **No host environment reaches a container.** Containers receive only `HOME` and `TMPDIR` plus the variables baked into the pinned image.
- **The Docker CLI gets a minimal environment**: `PATH`, `HOME` and the `DOCKER_*` connection variables. Docker authenticates through its own credential store; `wl` never reads Docker's configuration files, and credentials never enter argv, generated files or container environments. Read-only queries are answered over the local socket that the CLI itself resolves, without starting a process ([ADR-0244](../decisions/0244-environment-and-docker-read-amplification.md)).
- **Credential files refuse the whole environment.** A candidate containing `.env`, `.env.*`, `.npmrc`, `.pypirc`, `auth.json` or `credentials*` is refused rather than silently skipped, so you notice.
- **Every copied file is scanned** for private keys, GitHub, OpenAI-style and AWS tokens and URLs with embedded passwords; a match refuses.
- **Ignored files are never copied.** Only tracked and non-ignored files of the owned candidate enter a volume; symbolic links refuse.
- **Recipes cannot request secrets.** A service that declares secret delivery is refused before any Docker command.
- **Delivery workers get an allowlisted environment** built by `deliveryWorkerEnvironment`, with a private home per attempt.

Workspace snapshots hash the bytes of every tracked and non-ignored file to prove that nothing changed; the bytes are hashed in memory and never stored or logged.

## Known gaps

- **Standalone headless gate workers** (`src/fanout/host.ts`) start the native client with the caller's complete environment. Delivery workers do not. Restricting gate workers needs each client's authentication variables declared and verified against signed-in clients, so it remains open in [manual verification](../../roadmap/manual-verification.md).

## Decisions

[ADR-0102](../decisions/0102-inert-environment-recipes-and-pinned-setup-origins.md) (inert recipes and pinned origins), [ADR-0104](../decisions/0104-owned-environment-lifecycle-and-private-cancellation.md) (owned lifecycle and cancellation), [ADR-0243](../decisions/0243-single-writer-store-trust-model.md) (what the runner trusts and what it re-observes) and [ADR-0245](../decisions/0245-require-docker-for-project-code-execution.md).

---

<!-- docnav -->
[◀ Orchestration and gates](orchestration-and-gates.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Determinism and testing ▶](determinism-and-testing.md)
