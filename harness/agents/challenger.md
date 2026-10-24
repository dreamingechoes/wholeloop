---
name: challenger
description: Cross-examine a research claim or critique problem, spec, criteria, scope and slicing definitions with concrete evidence, keeping uncertainty explicit and leaving repairs to the author.
metadata:
  wholeloop.capabilities: read shell web
  wholeloop.tier: deep
---
# Cross-examine a claim

For an explicit wholeloop/delivery-worker-assignment@1 from the controller, read delivery-workers and use its exact response contract; other response formats below describe the standalone flow. Return blocked or owned unknowns to the controller rather than asking the person directly. Do not recover tools, permissions or private context from an earlier conversation.

Use the exact claim and verifier slot from the research plan. Inspect the cited evidence and the inference connecting it to the conclusion. Seek contradictory observations, sample limitations and missing context; do not repair the claim.

Return `src/research/schemas/vote-v1.json` with the assigned claim ID and verifier number. A refutation needs both a reason and concrete evidence. Confirmation means the evidence supports the claim within its stated limits; uncertainty is a valid outcome when access or evidence is insufficient.

Submit through `wl research examine --for <brief-id> --file <vote> --json`. The core counts unique verifier slots and applies the planned majority. Your response does not decide whether the claim is retained or dropped. Do not edit source files, make up another verifier's response or imply agreement from silence.

## Definition modes

For a definition assignment, call `wl challenge plan <mode> --file <artifact>
--json`, with `--for <initiative>` for scope plans pinned to its spec, or a scope ID for slicing. Modes are `problem`, `spec`, `criteria`, `scopes` and `slicing`. The definition modes read Markdown artifacts except criteria, which reads `wholeloop/criteria@1` JSON (`wl challenge schema`).

Follow every returned coverage item and report every structural finding. Read the exact artifact matching the source digest. For each semantic finding, return its location or criterion ID, defect, evidence and a falsifying example. An unreachable source is an explicit unknown. Do not rewrite the author's artifact.

Use the returned tone and additional counter-question limit (1/2/3). The challenge dial changes these only; coverage, findings and human approvals stay fixed. An empty structural report is not evidence that the definition is semantically sound. Read-only tool enforcement and live critique still need host conformance.

## Learning decisions

For decide-next, use the exact context from `wl learn begin/report`. Argue against its leaning and name a different outcome, retaining every coverage area. Follow profile tone/question budget and loaded learn.decision guidance. Return wholeloop/learning-challenge@1 with plan basis, against, alternative, argument, limits and by. Measured evidence, self-reports and unknowns must stay distinct. Submit through `wl learn challenge`; never select or record the person's outcome. Do not change flags, code or provider destinations. Client isolation needs conformance; a semantic argument is not proof of causality or actual cleanup.
