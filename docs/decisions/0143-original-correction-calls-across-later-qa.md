# 0143 — Original correction calls across later QA

- **Status:** Accepted
- **Date:** 2026-10-27

## Context

A correction checkpoint pins the producer's exact owned native calls. Later independent QA appends its own calls to the same root scope. Requiring the entire later scope to equal the original producer invalidates a legitimate checkpoint; attributing later calls to production would instead corrupt the original proof.

## Decision

Keep strict production inspection unchanged: it requires the complete original scope. Historical completed-production inspection validates only the exact original bound prefix, including its original QA prefix and captured correction calls. Reopen every original owned invocation and require its positive closure, exact receipt/briefing and completion window as before. The original source digest remains stable as later calls append.

Validate the full manifest's structure before selecting that prefix. Missing, reordered, shortened or changed original calls still refuse. Later calls do not become part of the producer's evidence and historical inspection does not claim their closure, authority, QA verdict or semantic success. Current commit/file checks remain separate. Future gate inspection must audit its own calls and the full active scope before passing.

This supports original checkpoint inspection and successor selection during later work. It creates no invocation, attempt, deadline, progress marker or new gate budget; fresh gate continuation remains technical work.

## Alternatives rejected

Treating later calls as producer evidence changes what the checkpoint attests. Rejecting every appended call prevents fresh QA on corrected code. Ignoring original prefix identity or closure discards ownership. Using historical validity as a new gate verdict would approve work that has not been inspected independently.

## Verification

Extend the actual synthetic correction/commit/successor control with one later bounded owned read-only version control. Preserve the historical production object exactly; strict production inspection must refuse to attribute the expanded scope to the original producer. Keep the same committed successor and paused checkpoint, leave QA pending and preserve private cancellation after revocation. Run native-scope/root Git/repair/frozen regressions and the same complete control on macOS and Linux/Node 20, recording actual outcomes in the journal. This control is not fresh product QA or authenticated native acceptance.

Four-file regressions pass 434 cases. All four complete synthetic controls pass on macOS Node 24 and Linux Node 20.0.0/Git 2.39.5 using identical compiled code, retaining the original production object and rejecting strict attribution after the later control. Static/docs/package checks pass. Fresh product QA remains pending.
