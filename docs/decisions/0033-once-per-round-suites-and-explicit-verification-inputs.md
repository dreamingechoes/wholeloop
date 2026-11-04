# 0033 — Once-per-round suites and explicit verification inputs

- **Status:** Accepted
- **Date:** 2026-10-18

## Context

Each verifier launching the suite wastes work and makes results disagree. A crash between execution and a receipt makes blind retries ambiguous. A green suite also says nothing about whether the criteria were agreed or the tests can detect defects.

## Decision

- Require agreed criteria before standalone verification mutates state. Keep exact criteria on the item; invocation flags cannot replace an existing agreement. Standalone branches get an isolated slice worktree without fabricated Define or build completion. PRs need host-resolved local named heads and actual criteria; the core asks when absent rather than inferring them from prose.
- Resolve verify.suite from discovery and explicit bindings. Select a check/verify aggregate or the selected test plus same-package typecheck/lint declarations. Instruction-file guidance requires a host to select explicit declared refs. Never turn arbitrary prose into a shell command.
- Persist one suite intent before executing argv in the pinned workspace. A second caller cannot launch it again. Completed calls return the shared receipt; an unfinished intent needs inspection and a new gate round. This is at-most-once execution, not a claim to resolve the physical crash window automatically.
- Bound each command to 100–600000 ms and total captured output to 1 MiB. Use POSIX process groups for timeout/output-limit cleanup and stop the suite on failure. Return raw output only in the operation response; durable receipts contain exit code, signal and SHA-256 hashes of captured bytes. Decode UTF-8 across chunks.
- Give every criterion its own verifier and changed tests a separate semantic group. Automatically submit deterministic constant-assertion findings as an additive testability unit. Ignore quoted fixtures/comments. This deliberately limited lint cannot prove mutation sensitivity or inspect every language's assertion semantics.
- Keep observed suite failure mandatory even if all findings are refuted. A canonical verify-works receipt requires its successful suite execution, current gate PASS and unchanged code. Human testing remains a separate decision.
- Share gate scheduling between builder and standalone verification hosts. The binary awaits an asynchronous dispatcher for process work while preserving the synchronous programmatic router for existing callers.

## Alternatives considered

Re-executing a pending intent can duplicate external test effects after a crash. Silently treating it as complete invents evidence. Preserve the ambiguity instead. Persisting full process logs could copy credentials into runtime state, so only hashes and exit metadata are durable; the current host receives the raw output. An AST/mutation engine would add language/runtime dependencies and still require real behavior checks. A small honest lint complements the read-only semantic group.

## Consequences

Project tests may have effects outside Git; the snapshot detects tracked/untracked non-ignored workspace changes, not every external effect. Hosts must declare/undo those effects and enforce genuinely read-only verifier tools. Process-group fixture checks ran on macOS; Linux, live client execution and authenticated PR checkout remain manual verification. A cached passing suite is historical when current is false.

[◀ Decisions index](./README.md)
