---
name: research
description: Investigate a hard question through configured or detected read-only sources, independently challenge load-bearing claims, and record a local evidence brief.
metadata:
  wholeloop.step: research
---
# Research a question

Read destination-publication, source-evidence, ask-never-guess, output-contract and core-invariants.

1. Begin `wl step begin research --input "<question>" --owner "<person>" --json`.
   For an attached brief, use `--parent <initiative-or-scope>`; the recorded parent
   owner can be reused. Resume an existing brief with `--for <brief-id>`.
2. Collect missing inputs together. Show the preflight, style and resolved
   `research.method` guidance before investigating.
3. Call `wl research plan --for <brief-id> --json`. The journal pins sources,
   majority and verifier slots to this run. Show angles and access limitations;
   additional sources need a validated provider or configuration, not a guess.
4. Use the native host fan-out when available: one researcher per returned job.
   Each receives the same question and its assigned angle and submits the result
   through `wl research submit --for <brief-id> --file <report> --json`. If native
   fan-out is unavailable, run the same jobs sequentially with the same coverage.
   The shared `research` workflow implements both scheduling modes for adapters.
5. Read destination-publication and the plan again for examination assignments. Give each slot to an
   independent challenger. Each returns a structured vote through `wl research
   examine --for <brief-id> --file <vote> --json`. A failed worker is uncertainty,
   never a refutation. Do not reuse one worker's answer as multiple votes.
6. Call `wl research complete --for <brief-id> --json`. Only the deterministic
   aggregate can complete the artifact; missing workers become open questions,
   and a claim drops only after the pinned active-refutation majority.
7. Show the brief receipt, evidence, retained/dropped claims and open questions.
   Continue with `step begin frame-problem --from <brief-id> --json` when requested. Adopted briefs use the initiative
   shared outbox through destination-publication.

Host adapters still need live conformance. Do not claim parallelism, source
access or authentication that the current client cannot establish.
