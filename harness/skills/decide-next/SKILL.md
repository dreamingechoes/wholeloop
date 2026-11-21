---
name: decide-next
description: Challenge the leaning against pinned evidence, record a person's keep/iterate/kill/unflag and close only fully decided work.
metadata:
  wholeloop.step: decide-next
---
# Decide what follows

Read worker-handoffs, ask-never-guess, output-contract and learning-decisions.

1. Begin `wl learn begin --for <scope> --leaning <outcome> --json`. Read the original promise, exact checkpoint report, unknowns and pending checkpoints. Complete the latest measured report first. Standalone entry supplies an outcome description, --owner and explicit --reported evidence, never fake measurements.
2. Read actual learn.decision guidance and the effective profile. Give `wl-challenger` the returned context, four coverage items and strongest case against the leaning. Tone/additional questions change by profile; evidence coverage never shrinks.
3. Record wholeloop/learning-challenge@1 using `wl learn challenge --for <id>
   --file <counterargument.json> --json`. It must cite the exact plan event, oppose the current leaning, name another outcome and explain argument/limits. Stale evidence or changed guidance/profile requires explicit re-planning.
4. Show the counterargument and evidence to the person. Record `wl learn decide
   keep|iterate|kill|unflag --for <id> --basis <challenge-event> --by <person>
   --reason <reason> --ack <unknown-key-array> --json`. A written reason and acknowledgment of every unknown/pending checkpoint are mandatory.
5. Iterate also supplies --iteration with title/problem/audience/impact, optionally an explicitly selected existing closed pre-spec initiative. The core creates or reopens a linked framing draft with unresolved validation/cost/stop questions. It starts frame-problem, without inventing validated framing or specification.
6. Keep/unflag propose flag removal; kill proposes human disablement/code cleanup. Nothing changes flags or code. No provider publication or Build starts here.
7. Canonical completion closes the scope and closes its initiative only when every scope has a completed learning decision. A manually closed sibling does not count. Use `wl learn complete --for <id> --json` to recover after a persisted decision; it does not duplicate decisions or iteration ideas.
8. Read `wl learn report --for <id> --json` and hand back the exact receipt, proposed cleanup and new framing draft. The human outcome remains distinct from measurements, semantic critique and actual production changes.

Start only the named rendered role with its assignment, required protocol text and result schema. Never fork conversation history or copy the conductor as a worker. Validate each final-message result and submit it from the conductor; checked headless transports already own their submissions.
