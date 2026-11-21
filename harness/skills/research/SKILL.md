---
name: research
description: Investigate a hard question through configured or detected read-only sources, independently challenge load-bearing claims, and record a local evidence brief.
metadata:
  wholeloop.step: research
---
# Research a question

Read worker-handoffs, destination-publication, source-evidence, ask-never-guess, output-contract. Read speaking-to-person.

1. Begin `wl step begin research --with-plan --input "<question>" --owner "<person>" --json`. For an attached brief, use `--parent <initiative-or-scope>`; the recorded parent owner can be reused. Resume an existing brief with `--for <brief-id>`.
2. Collect missing inputs together. Show display.text and read the resolved `research.method` guidance before investigating.
3. Use the plan returned by begin; inspect `wl research plan --for <brief-id> --json` only when resuming without it. If status is `needs-sources`, ask once which sources to use, with its suggested codebase and web choices preselected, and where to remember them (run, project or user). Show each access label and its evidence; authentication is unverified. Include unavailable-provider guidance. Confirm through `wl research plan --for <brief-id> --sources '<comma-separated-provider-ids>' --remember <scope> --json`; a JSON array also accepts an explicit empty list. Remembered sources replace detection. Never select a source because its executable exists or another client declares it. Start no worker until status is `planned`; changing pinned sources needs a new run.
4. Research never executes repository code, tests, builds or package commands. Before delegation establish read-only tools; clients inheriting permissions also need an observed read-only parent and no mutating external tools. If this cannot be established, preserve unavailable evidence rather than start a worker. Use the native host fan-out when available: one `wl-researcher` per returned job. Pass only that returned job, including its question, allowed source, input and resultSchema; it returns the result in its final message. Launch all independent jobs before joining their handles with the native wait primitive; never use fixed sleeps. Validate it and submit through `wl research submit --for <brief-id> --stdin --json`. If native fan-out is unavailable, run the same jobs sequentially with the same coverage. The shared `research` workflow implements both scheduling modes for adapters.
5. Read destination-publication and the plan again for examination assignments. Give each returned examination job to an independent `wl-challenger`; start all ready slots, then join their native handles. Each job includes the original claim and evidence without other votes. Each returns a structured final-message vote; validate it and submit through `wl research
   examine --for <brief-id> --stdin --json`. A failed worker is uncertainty, never a refutation. Do not reuse one worker's answer as multiple votes.
6. Call `wl research complete --for <brief-id> --json` for its evidence-bound conclusion context. Write the Answer and Recommendation yourself from the retained claims, disputes and unknowns; no synthesis worker or separate Markdown summary is needed. Submit `wl research complete --for <brief-id> --basis <context-basis> --answer '<answer>' --recommendation '<recommendation>' --json`, quoting prose as literal arguments. A changed basis needs a fresh context and revised prose. The core preserves the deterministic evidence aggregate and computes confidence and unchecked work; missing workers remain open questions.
7. Show display.text verbatim, with the answer first, recommendation, confidence and unchecked work. Link the same stored brief for evidence, retained/dropped claims and open questions. Continue with `step begin frame-problem --from <brief-id> --json` when requested. Adopted briefs use the initiative shared outbox through destination-publication.

Do not claim parallelism, source access or authentication that the current client cannot establish.

Start only the named rendered role with its assignment, required protocol text and result schema. Never fork conversation history or copy the conductor as a worker. Validate each final-message result and submit it from the conductor; checked headless transports already own their submissions.
