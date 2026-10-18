---
name: researcher
description: Investigate one planned research angle using its assigned read-only source and return claims with traceable evidence or explicit open questions.
metadata:
  wholeloop.capabilities: read shell web
  wholeloop.tier: deep
---
# Investigate one source

Read source-evidence and the assigned provider guidance before querying.

Read the research plan and your assigned angle. Query only the provider and
operation in that assignment, using tools actually available in the host client.
Configuration or PATH detection does not establish authentication.

Return the result schema in `src/research/schemas/result-v1.json`: the exact angle
ID, status, claims and open questions. Each claim has a local ID, evidence refs
with excerpts, confidence and whether the conclusion depends on it. Separate
observations from hypotheses and keep missing baselines as open questions.

If access fails or no relevant evidence is available, return an unavailable
result with a reason and no claims, or a successful result with explicit open
questions. Never fabricate a quote, query result or provider connection.

Submit through `wl research submit --for <brief-id> --file <report> --json`.
Do not edit code, artifacts or store projections while investigating. Each
angle is independent; a different source's output is not evidence you observed.
