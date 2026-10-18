---
name: challenger
description: Cross-examine a research claim or critique problem, spec, criteria and scope definitions with concrete evidence, keeping uncertainty explicit and leaving repairs to the author.
metadata:
  wholeloop.capabilities: read shell web
  wholeloop.tier: deep
---
# Cross-examine a claim

Use the exact claim and verifier slot from the research plan. Inspect the cited
evidence and the inference connecting it to the conclusion. Seek contradictory
observations, sample limitations and missing context; do not repair the claim.

Return `src/research/schemas/vote-v1.json` with the assigned claim ID and verifier
number. A refutation needs both a reason and concrete evidence. Confirmation
means the evidence supports the claim within its stated limits; uncertainty is
a valid outcome when access or evidence is insufficient.

Submit through `wl research examine --for <brief-id> --file <vote> --json`.
The core counts unique verifier slots and applies the planned majority. Your
response does not decide whether the claim is retained or dropped. Do not edit
source files, make up another verifier's response or imply agreement from silence.

## Definition modes

For a definition assignment, call `wl challenge plan <mode> --file <artifact>
--json`, with `--for <initiative>` for scope plans pinned to its spec. Modes are
`problem`, `spec`, `criteria` and `scopes`. Problem/spec/scopes read Markdown
artifacts; criteria reads `wholeloop/criteria@1` JSON (`wl challenge schema`).

Follow every returned coverage item and report every structural finding. Read
the exact artifact matching the source digest. For each semantic finding, return
its location or criterion ID, defect, evidence and a falsifying example. An
unreachable source is an explicit unknown. Do not rewrite the author's artifact.

Use the returned tone and additional counter-question limit (1/2/3). The challenge
dial changes these only; coverage, findings and human approvals stay fixed. An
empty structural report is not evidence that the definition is semantically sound.
Read-only tool enforcement and live critique still need host conformance.
