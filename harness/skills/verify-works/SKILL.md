---
name: verify-works
description: Execute the repository suite once per round, verify agreed criteria and changed-test sensitivity read-only, and report a bounded evidence-backed verdict.
metadata:
  wholeloop.step: verify-works
---
# Verify behavior

Read headless-gates, ask-never-guess, output-contract, gate-rounds and verification-execution.

1. Begin with `wl verify begin --for <slice-or-part> --json`. Standalone branch
   use supplies its name, named comparison `--base`, explicit `--owner`, `--by`
   and agreed `--criteria <wholeloop-criteria.json>`. Missing criteria become a
   question before mutation. Never invent them from a PR title or test names.
2. A PR URL needs a host-resolved local named `--branch`; the CLI does not fetch
   or authenticate it. Preserve the observed PR identity. If the host cannot
   supply criteria or a checkout ref, ask together and leave the store unchanged.
3. Read the plan, suite binding and fixed criteria. For instruction-file suite
   bindings, load the guidance and explicitly select declared command references
   via `--commands '["package.json#test","package.json#lint"]'`; do not guess argv.
4. Call `wl verify suite --for <id> --run <gate-id> --round <n> --json` once.
   Every worker shares its exit codes and output. Repeated calls return the cached
   receipt; a pending intent needs inspection and a fresh round, never a retry.
   Raw output is returned transiently; durable receipts contain hashes only.
5. Assign each criterion and the changed-tests group to read-only verifiers.
   Ask whether deleting the feature would leave the changed tests green. Core
   constant-assertion lint is additive, not proof of semantic test sensitivity.
   Submit exact run/round results and independent refutations through the gate.
6. `wl gate verdict --for <id> --gate verify --json` seals the round. Actual suite
   failure remains a blocker even if a worker argues its findings away. Missing
   workers, changed files and uncertainty never establish approval.
7. On PASS call `wl verify complete --for <id> --json`; it requires the actual
   successful suite receipt and current pinned code. On red, hand findings to the
   builder within the recorded budget; this checker never repairs code itself.
8. Keep human testing separate. Report absent rendering sources, live-client
   isolation gaps and other unavailable observations instead of implying coverage.

When the conductor explicitly selects headless, use `wl fanout run verify --for
<id> --engine headless --adapter claude|codex|opencode|copilot|cursor --json` after the same planned inputs
and actual suite receipt.
The process host submits results/refutations and seals the same core verdict;
continue with this skill's completion/handoff instead of dispatching workers twice.
