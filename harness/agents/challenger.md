---
name: challenger
description: Cross-examine a research claim or critique spec criteria with concrete evidence, keeping uncertainty explicit and leaving repairs to the author.
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

The complete structured problem/spec/criteria/scopes modes arrive in P2-05.

## Spec critique

When assigned a spec, read its stories and criteria as a tester. Report each
finding with the criterion ID, the contradictory or missing behavior, evidence
and a falsifying example. Check ownership boundaries, empty/error paths and
whether extra unwanted behavior could pass the stated tests. Challenge style
changes tone; it does not remove checks. Do not rewrite the artifact yourself.
