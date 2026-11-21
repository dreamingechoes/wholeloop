# 0205 — Public controller bundle

- **Status:** Accepted
- **Date:** 2026-11-03

## Context

**Amended 2026-11-21 (P9-07).** Display support exposed the public copy bound: the uncompressed-format core exceeded 4 MiB by 1228 bytes, and installation/guard tests correctly refused it. Both bundles now compact whitespace, retaining names, syntax, the exact shebang and the controller digest boundary. The build rejects a public core above 4 MiB before tests or packaging. Raising copy/read limits was rejected; source modules stay readable and no permission or supported route changes.

`wl delivery run` launches an owned controller child with one fixed public host. Until now that host composed no stage adapter ([ADR-0183](./0183-public-foreground-runner-host.md)). Two things blocked composition:

- **Size.** The domain adapters would push the single-file core past its 4 MiB bound. Hook and install copies of the core enforce that bound, so it cannot simply be raised.
- **Runtime paths.** Nothing told the host where a bound client is installed or which client home it signs in from. ADR-0203 requires a dedicated client home.

Trusted runtime observers now exist for both reference clients ([ADR-0120](./0120-observed-native-boundaries-and-asynchronous-admission.md), [ADR-0203](./0203-contained-claude-code-boundary.md)).

## Decision

- **A separate controller bundle.** The build first produces `dist/wl-runner.mjs`. It is self-contained: the engine, the store, the dispatcher, every fixed adapter and the public composition. The build then embeds its SHA-256 into the core.
  - When the embedded digest is present, `wl delivery run` launches that bundle as the owned child. It verifies the bundle's bytes first and refuses a missing or changed bundle before claiming the run.
  - A build without the digest, as when tests run from sources, launches the core child, which composes nothing.
  - Both files ship in the package. Whitespace-compacted output keeps the public core within its existing 4 MiB copy/read bound; the build checks that bound.

  The process boundary is also the module boundary. No class is loaded twice in one process, so `instanceof` checks on adapters and errors keep their meaning.
- **A runtime document.** `--runtime` reads a closed `wholeloop/native-runtime@1` document. It holds one entry per reference client, each with the absolute path of the client binary to launch and the client home the operator signed in to. It holds no credential, model or role; those stay in the bindings.

  The public host identity digests the runtime together with the bindings. Without a runtime the identity is byte-for-byte the previous one. Retained configuration keeps a bindings-only host's original bytes.
- **An optional composer.** `RunnerPublicHost` takes an optional composer, which only the controller bundle supplies. The core's host keeps its earlier preflight reasons.
  - With a composer and a runtime, the host builds one dispatcher per request from the request's pinned basis and route, and delegates preflight, execution, inspection, stopping and the endpoint to it.
  - The composer currently supports the `research-report` route: plan, research and handoff. Every source is the built-in `native-web` angle ([ADR-0204](./0204-research-web-reads.md)), the judges are native and evidence is observed from the stored artifact bytes.
  - One binding must cover `planner` and `challenger` for the judges, and `researcher`, `planner` and `challenger` for the research workers.
  - Any other endpoint, a client missing from the runtime, or roles that no single binding covers leave the route unsupported before dispatch.
- **Fixed observers.** Codex launches go through `CodexBoundaryHost` with its client home and a `PATH` that names the runtime's client directory. Claude Code launches go through `ClaudeBoundaryHost` with the ADR-0203 containment, built from the runtime and the operating system's account record. Read-only attempts always launch with inline proposals, so each observer is built for that output mode and regenerates exactly the recipe that will run.

## Alternatives rejected

- Raising the core's 4 MiB bound would weaken the size limit that hook and install copies enforce. Compact whitespace and fail the build at that unchanged bound instead.
- Minifying identifiers or syntax is unnecessary to regain headroom; retaining names and syntax keeps emitted errors and behavior easier to inspect.
- esbuild code splitting would make the core import shared chunks, so a copied core would no longer be one file.
- Dynamically importing a second bundle into the core process would load two copies of shared classes.
- Resolving clients through `PATH` would let any earlier directory substitute a program.
- Putting runtime paths into the bindings document would mix where a client lives with which models and roles the operator trusts.

## Verification

The ordinary build checks the public core byte bound. Native-installation and real local Git-hook fixtures verify copied bytes, ownership and executable behavior; required Node 20 runtime and Ubuntu/macOS gates check the same emitted artifacts.

- Compiled CLI: with bindings and a runtime, the owned child is the verified bundle. A route the composer does not support ends blocked with no client launched. A changed bundle beside an installed core is refused before the run is claimed.
- The runtime document refuses relative, quoted, unnormalized, duplicate and identical paths, unknown targets and extra fields. A bindings-only identity is unchanged.
- The composed research route passes preflight with interactive tools disabled. It becomes unsupported when the runtime lacks the bound client.
- End to end, a composed research route completes with no prompt through the real `CodexBoundaryHost`. A synthetic client answers its version, feature, sandbox-probe, cancellation and login controls. Every launch is preceded by two sandbox controls and one login check, and the `native-web` angle runs with live web search.
- That end-to-end case found the output-mode mismatch described above. Before the fix, the observer refused every launch as `runtime-unobserved`.

- **Reconcile in the same bundle.** With a verified bundle installed, `wl delivery reconcile` runs the bundle's second private mode. The mode takes one bounded input naming the store and the request. It rebuilds the host from the retained documents that the request's identity names and returns the bounded result, which the core relays. Only the code that composed a run can inspect or stop its stages.
- **Identity command.** `wl delivery runner-host --bindings --runtime` prints the identity a request must name (`wholeloop/delivery-runner-host@1`). It computes only; it retains nothing.

A compiled-CLI case shows that the identity matches the prepared request and that reconcile goes through the bundle. Breaking the bundle's reconcile mode fails five public-runner cases. No real client or model has run through the public host.
