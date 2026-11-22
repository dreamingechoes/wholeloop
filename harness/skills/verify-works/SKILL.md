---
name: verify-works
description: Execute the repository suite once per round, verify agreed criteria and changed-test sensitivity read-only, and report a bounded evidence-backed verdict.
metadata:
  wholeloop.step: verify-works
---
# Verify behavior

Read worker-handoffs, headless-gates, ask-never-guess, output-contract, gate-rounds and verification-execution. Read speaking-to-person.

1. Begin with `wl verify begin --for <slice-or-part> --json`. Standalone branch use supplies its name, named comparison `--base`, explicit `--owner`, `--by` and agreed `--criteria <wholeloop-criteria.json>`. Missing criteria become a question before mutation. Never invent them from a PR title or test names. Add `--rigor quick|deep` only when the person chose it for this run; standard is the default and the profile never sets it. Show the Rigor line and any proposal.
2. A PR URL needs a host-resolved local named `--branch`; the CLI does not fetch or authenticate it. Preserve the observed PR identity. If the host cannot supply criteria or a checkout ref, ask together and leave the store unchanged.
3. Read the plan, suite binding and fixed criteria. For instruction-file suite bindings, load the guidance and explicitly select declared command references via `--commands '["package.json#test","package.json#lint"]'`; do not guess argv.
4. Call `wl verify suite --for <id> --run <gate-id> --round <n> --result-version 2 --json` once. Every worker shares its exit codes and output. A known startup failure stops before workers or a code verdict: show display.text, route the environment problem to its owner and obtain a new verify plan after correction retaining the unused budget; never rerun the old intent. Successful receipts are cached; an ambiguous pending intent still needs inspection and a fresh round. Hashes are named explicitly; failed findings carry a bounded transient output tail. Durable receipts retain hashes only.
5. Dispatch each returned suite jobs entry to read-only `wl-verifier` workers with only that assignment. Start all independent jobs before joining their handles with the native wait primitive; never use fixed sleeps. Ask whether deleting the feature would leave the changed tests green. Core constant-assertion lint is additive, not proof of semantic test sensitivity. Submit exact run/round results through the gate. Refresh the cached suite view for its self-contained examinations; join independent `wl-reviewer` refuters before submitting their votes. A cached view never reruns tests; missing raw output remains unavailable evidence.
6. `wl gate verdict --for <id> --gate verify --json` seals the round. Actual suite failure remains a blocker even if a worker argues its findings away. Missing workers, changed files and uncertainty never establish approval.
7. On PASS call `wl verify complete --for <id> --json`; it requires the actual successful suite receipt and current pinned code. On red, hand findings to the builder within the recorded budget; this checker never repairs code itself.
8. Keep human testing separate. Report actual missing rendering sources or inaccessible evidence with their effect on the result.

When the conductor explicitly selects headless, use `wl fanout run verify --for
<id> --engine headless --progress --adapter claude|codex|opencode|copilot|cursor --json` after the same planned inputs and actual suite receipt. The process host submits results/refutations and seals the same core verdict; continue with this skill's completion/handoff instead of dispatching workers twice.

Start only the named rendered role with its assignment, required protocol text and result schema. Never fork conversation history or copy the conductor as a worker. Validate each final-message result and submit it from the conductor; checked headless transports already own their submissions.
