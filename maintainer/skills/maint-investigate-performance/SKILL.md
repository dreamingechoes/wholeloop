---
name: maint-investigate-performance
description: Investigate a performance problem in wholeloop with the measurement-only tools from the P6-39 audit, without trading away guarantees. Use when a command or route is slower than expected or a change may have made a hot path worse.
---

# Investigate a performance problem

Read `roadmap/performance-audit.md` first: it records what each path cost, what was fixed and which remaining costs are accepted guarantees (guard Git processes, committed-fact flushes, closure proofs).

## Measure before changing anything

1. `npm run perf:calibrate` must pass; otherwise the counters are not trusted.
2. Reproduce with the smallest route that shows the problem. For the full autonomous route run `npm run perf:route -- --callers` (needs Docker) and keep the printed profile directory.
3. Read counts, not seconds: instrumented timings include profiler cost. Find the phase and the calling functions that dominate.

## Change under the rules

- No processes inside loops and no repeated identical query within one decision; each Git process costs about 4 ms.
- Internally read borrowed frozen journal views rather than copies, unless you need a mutable one.
- Write and flush only committed facts; never rewrite identical bytes.
- Index once instead of searching inside loops.
- Memoize only within ADR-0243's rules. Never memoize external repository facts (Git configuration, worktree locks) across actions.
- Never trade current reads, authority, durability or error order for speed.

## Prove it

1. Add an operation-count test next to the existing `test/unit/**/*-performance.test.ts` controls that fails on the old code and passes on the new.
2. Re-run the route and compare with `node scripts/perf/compare.mjs <before-run> <before-profiles> <after-run> <after-profiles>`; it refuses runs whose outcomes differ.
3. Record the before and after counts in the commit body and the ledger, and amend the ADR whose behaviour changed.

This skill never commits or pushes.
