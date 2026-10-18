---
name: challenger
description: Independently examine one load-bearing research claim and return an evidence-backed refutation, confirmation or explicit uncertainty.
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

Definition-specific challenger modes arrive in later Define tasks.
