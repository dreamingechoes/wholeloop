---
name: research
description: Investigate a hard question through configured or detected read-only sources, independently challenge load-bearing claims, and record a local evidence brief.
metadata:
  wholeloop.step: research
---
# Research a question

Read worker-handoffs, destination-publication, source-evidence, ask-never-guess, output-contract and core-invariants.

1. Begin `wl step begin research --input "<question>" --owner "<person>" --json`. For an attached brief, use `--parent <initiative-or-scope>`; the recorded parent owner can be reused. Resume an existing brief with `--for <brief-id>`.
2. Collect missing inputs together. Show the preflight, style and resolved `research.method` guidance before investigating.
3. Call `wl research plan --for <brief-id> --json`. If status is `needs-sources`, ask once which sources to use, with its suggested codebase and web choices preselected, and where to remember them (run, project or user). Show each access label and its evidence; authentication is unverified. Include unavailable-provider guidance. Confirm through `wl research plan --for <brief-id> --sources '<comma-separated-provider-ids>' --remember <scope> --json`; a JSON array also accepts an explicit empty list. Remembered sources replace detection. Never select a source because its executable exists or another client declares it. Start no worker until status is `planned`; changing pinned sources needs a new run.
4. Use the native host fan-out when available: one `wl-researcher` per returned job. Pass only that returned job, including its question, allowed source, input and resultSchema; it returns the result in its final message. Launch all independent jobs before joining their handles with the native wait primitive; never use fixed sleeps. Validate it and submit through `wl research submit --for <brief-id> --file <report> --json`. If native fan-out is unavailable, run the same jobs sequentially with the same coverage. The shared `research` workflow implements both scheduling modes for adapters.
5. Read destination-publication and the plan again for examination assignments. Give each returned examination job to an independent `wl-challenger`; start all ready slots, then join their native handles. Each job includes the original claim and evidence without other votes. Each returns a structured final-message vote; validate it and submit through `wl research
   examine --for <brief-id> --file <vote> --json`. A failed worker is uncertainty, never a refutation. Do not reuse one worker's answer as multiple votes.
6. Call `wl research complete --for <brief-id> --json`. Only the deterministic aggregate can complete the artifact; missing workers become open questions, and a claim drops only after the pinned active-refutation majority.
7. Show the brief receipt, evidence, retained/dropped claims and open questions. Continue with `step begin frame-problem --from <brief-id> --json` when requested. Adopted briefs use the initiative shared outbox through destination-publication.

Host adapters still need live conformance. Do not claim parallelism, source access or authentication that the current client cannot establish.

Start only the named rendered role with its assignment, required protocol text and result schema. Never fork conversation history or copy the conductor as a worker. Validate each final-message result and submit it from the conductor; checked headless transports already own their submissions.
