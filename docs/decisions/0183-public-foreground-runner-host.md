# 0183 — Public foreground runner host

- **Status:** Accepted
- **Date:** 2026-11-01

## Context

The engine, the fixed dispatcher and the owned foreground controller existed only as internal components, so no operator could run or reconcile a prepared route from the terminal. [ADR-0180](./0180-trusted-native-bindings.md) settled which native clients may run unattended: none, unless explicitly bound. Proving that a bound client satisfies its runtime boundary belongs to P6-27.

## Decision

Add `wl delivery run` and `wl delivery reconcile` over one fixed public host, `wholeloop-fixed-dispatch`. Its identity names the package version and the digest of the exact native bindings document, so a prepared request is bound to one bindings list. The empty default applies when no `--bindings` file is given. A request bound to a different document, a revoked grant or a stopped run is refused before any claim.

`run` claims the run and launches the installed core in a private controller mode inside an owned process group. The child reads one bounded, nonce-bound invocation and runs the real engine with the public host. The host composes no stage adapter yet. Every route reaches a native stage before any other work, and importing the fixed domain adapters would push the installable core past its 4 MiB bound; with the Git and plan adapters it measured 4.11 MB, without them 3.73 MB. Its preflight derives every native role the route needs. An unbound role reports `public-host-native-unbound`; when every role is bound it reports `public-host-native-runtime-unavailable`, because no trusted runtime observer exists yet. The engine's existing fallbacks then end none-policy routes blocked and others paused, before any dispatch and without a prompt.

`reconcile` observes or, with `--cancel`, cancels owned controller and stage work through the existing nonce-bound recovery, never by signaling a stored PID. The operator's interrupt reaches the controller through its owned group.

Native and domain adapters join the public host when P6-27 supplies trusted runtime observers, with a bundling approach that keeps the core bounded ([ADR-0205](./0205-public-controller-bundle.md) adds the controller bundle and composes the research route). Until then, binding a client is necessary but never sufficient, and a route that would need no native client reports `public-host-unsupported-stage`.

## Alternatives rejected

Accepting a bindings document without binding its digest into the host identity would let a later run trust clients the operator never prepared for. Composing native adapters with a default observer would launch clients without proof. Letting the command take a host or executable from the request would let source text choose the controller.

## Verification

Compiled CLI cases cover:

- the empty default ending none blocked and supervised paused, then resumable;
- explicit bindings still stopping before launch;
- interactive-tool canaries recording that no client was launched or waited for input;
- refusal of a different bindings document and of a revoked grant before any claim;
- public stop and `reconcile --cancel` cancelling only the owned waiting controller group, with an unrelated process surviving and a later run refused.

This is synthetic/reference-transport evidence, not native or hosted certification.
