# 0033 — Once-per-round suites and explicit verification inputs

- **Status:** Accepted
- **Date:** 2026-10-18

## Context

**Amended 2026-11-22 (P9-12).** An unavailable executable or shell startup failure previously became a code failure and consumed a limited evaluation round. Known startup failures now retain their write-ahead intent and a separate hash-only availability receipt, stop before workers or a code verdict, and carry unused evaluation budget to a replacement plan. A planned intent remains in history: removing it to satisfy "before recording a round" literally would break at-most-once execution. Output excerpts remain transient because durable process logs could contain secrets.

Each verifier launching the suite wastes work and makes results disagree. A crash between execution and a receipt makes blind retries ambiguous. A green suite also says nothing about whether the criteria were agreed or the tests can detect defects.

## Decision

- Require agreed criteria before standalone verification mutates state. Keep exact criteria on the item; invocation flags cannot replace an existing agreement. Standalone branches get an isolated slice worktree without fabricated Define or build completion. Resumption reuses the pinned verification comparison base, which can differ from the worktree checkout base. PRs need host-resolved local named heads and actual criteria; the core asks when absent rather than inferring them from prose.
- Resolve verify.suite from discovery and explicit bindings. Select a check/verify aggregate or the selected test plus same-package typecheck/lint declarations. Instruction-file guidance requires a host to select explicit declared refs. Never turn arbitrary prose into a shell command.
- Persist one suite intent before executing argv in the pinned workspace. A second caller cannot launch it again. Completed calls return the shared receipt; an unfinished intent needs inspection and a new gate round. This is at-most-once execution, not a claim to resolve the physical crash window automatically.
- Classify observed spawn failures and exit 126/127 separately from evaluated code only when the workspace stayed unchanged and no criterion work or votes were submitted. Record `verify.suite-unavailable` under its new `wholeloop/suite-start-failure@1` schema, naming the declared command, executable and bounded cause code without process output. Refuse a verdict or further work on that intent. A replacement gets a distinct run, the same policy/base/branch/verifier rules, and only the remaining evaluation budget; earlier failed code rounds remain spent. Changed workspaces and ambiguous interrupted intents retain the existing failure/recovery rules. No startup classification authorizes environment repair or a new execution by itself.
- Bound each command to 100–600000 ms and total captured output to 1 MiB. Use POSIX process groups for timeout/output-limit cleanup and stop the suite on failure. Return raw output only in the operation response; durable receipts contain exit code, signal and SHA-256 hashes of captured bytes. Decode UTF-8 across chunks.
- Keep the original CLI response and durable hash field meanings. Optional `--result-version 2` returns `wholeloop/verify-suite@2` with `stdoutSha256` and `stderrSha256` in command results, an explicit unavailable response without a spent round, and failed findings with a transient tail capped at 20 lines and 2048 characters, stripped of terminal controls. Plain text uses this readable presentation by default; JSON without the version flag retains v1. Canonical skills use v2 for all seven clients. A cached receipt cannot recreate output it never stored. Register only the two new contract identities; leave every frozen v1 declaration unchanged.
- Give every criterion its own verifier and changed tests a separate semantic group. Automatically submit deterministic constant-assertion findings as an additive testability unit. Ignore quoted fixtures/comments. This deliberately limited lint cannot prove mutation sensitivity or inspect every language's assertion semantics.
- Keep observed suite failure mandatory even if all findings are refuted. A canonical verify-works receipt requires its successful suite execution, current gate PASS and unchanged code. Human testing remains a separate decision.
- Share gate scheduling between builder and standalone verification hosts. The binary awaits an asynchronous dispatcher for process work while preserving the synchronous programmatic router for existing callers.

## Alternatives considered

Re-executing a pending intent can duplicate external test effects after a crash. Silently treating it as complete invents evidence. Preserve the ambiguity instead. Persisting full process logs could copy credentials into runtime state, so only hashes and exit metadata are durable; the current host receives the raw output. An AST/mutation engine would add language/runtime dependencies and still require real behavior checks. A small honest lint complements the read-only semantic group.

Removing an unavailable intent would erase a real execution attempt. Resetting the whole budget would forgive earlier code failures; counting infrastructure failure against it would preserve the original defect. Replacing a known unused attempt with only the remaining budget preserves both records and cost boundaries. Treating a mutated workspace or already examined criteria as an unused attempt would hide real work, so those cases refuse the discount. Renaming hashes under v1 or changing its default response would violate ADR-0066; v2 is an explicit additive choice. Persisting even a bounded output tail was rejected because it can contain sensitive output; live findings show it without writing it into state.

## Consequences

Project tests may have effects outside Git; the snapshot detects tracked/untracked non-ignored workspace changes, not every external effect. Hosts must declare/undo those effects and enforce genuinely read-only verifier tools. Process-group fixture checks run locally on macOS and through required Linux CI. Live client execution and authenticated PR checkout remain separate manual verification. A cached passing suite is historical when current is false.

## Verification

`test/unit/verification/start.test.ts` runs actual missing and non-executable commands, exit 126/127, failed assertions, compiled v1/v2 CLI routes and cached reads in isolated local repositories. It checks no code verdict or repeated old intent, carried budget after earlier failed rounds and repeated unavailable attempts, refusal after workspace mutation or submitted criterion work, bounded transient tails, hash-only journals and all seven rendered skills. Existing verification, gate, replay and frozen-contract tests retain their original expectations.

[◀ Decisions index](./README.md)
