# 0131 — Current plan authorization stage

- **Status:** Accepted
- **Date:** 2026-10-26

## Context

The root route has a plan stage after definition adoption and before acceptance definitions. Reusing definition production there would generate another revision on every visit. An exact-plan grant already authorizes its immutable plan; an envelope grant still needs the route's independent delivery-plan acceptance. A positive authorization envelope alone also cannot satisfy the root runner's started-stage requirement.

## Decision

Add an internal RunnerPlanStages adapter that evaluates the current immutable plan, without producing or reserving a revision. Require explicit unattended policy, active authority and exact grant/envelope scope. For envelope authority, use the existing route-required independent decisions and require their requests to cite the exact persisted plan-record bytes. Give request selection a frozen copy of that artifact identity. Extend the internal decision component with an optional required-artifact binding checked on both new and retained requests; historical callers and descriptors remain unchanged.

Use only the fixed native decision host and actual root process/store callback. Preserve original consumed intent, native closure, independent planner/challenger provenance and current published receipts. Paused inspection constructs neither a request selector nor a host. Losing a consumed descriptor remains unknown and cannot purchase another request key or judgment.

An implementation plan authorized by an exact-plan grant needs no additional decision or model. Its actual trusted core metadata operation calls the existing started boundary with backend owned-core, the exact stage invocation and the current controller PID. This describes an in-process operation, never a child launch or model call. The PID is descriptive and is never a cancellation target. Inspection alone cannot create that start record, and a foreign native prefix cannot use the metadata shortcut. Existing engine/journal rules continue to require a started runtime before accepting a passed stage.

Supervised use, unavailable delegation, changed plan bytes, invalid scope, unknown invokers or fixture judgments cannot establish delegated plan acceptance. The stage grants no implementation, product acceptance, human testing or publication evidence. Existing root decision requirements remain authoritative, including research-specific decisions. Full route-host composition remains separate technical work.

## Alternatives rejected

Producing another plan revision at every plan stage causes an endless loop. Requiring a second approval for an explicitly authorized exact plan invents an extra operator obligation and unnecessary model work. Treating a positive grant as a completed stage bypasses actual execution registration. Spawning an otherwise useless child merely to manufacture a PID wastes resources. Claiming a model was launched for core metadata work misstates execution. Sharing a mutable artifact object lets request selection rewrite the very input it must cite.

## Verification

Exercise exact-plan core execution with zero model calls, refusal to infer execution from inspection, supervised and cancelled admission, wrong-artifact and omitted requests, frozen artifact identity and consumed descriptor loss. Preserve original decision, builder, definition, acceptance-definition, store and frozen-contract regressions. Extend the finite model-free definition evaluation with exact-plan and envelope-plan journal admission and paused recovery, checking that neither reserves another revision. Record observed results in the journal; normalized synthetic judgments do not certify real models, containment or complete-route acceptance.

The broader eight-file regression passes 490 cases, followed by all nine final plan controls. All five complete definition/plan controls pass on macOS Node 24 and Linux Node 20.0.0 with identical bundled code. Lint, types, build, documentation, harness, Markdown, Mermaid and offline package checks pass. Full repository-suite results remain those of the preceding criterion-verification increment.
