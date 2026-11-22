---
name: frame-problem
description: Frame a rough idea or research brief as an owned initiative, with evidence and unknowns, and finish with a specification handoff or an argued no-go.
metadata:
  wholeloop.step: frame-problem
---
# Frame a problem

Read worker-handoffs, destination-publication, ask-never-guess, output-contract and framing-evidence. Read speaking-to-person.

1. Call `wl step begin frame-problem --input "<idea>" --owner "<person>" --json`. Omit unknown values for batched questions. Use `--for <initiative>` to refine known work or `--from <brief-id>` to adopt completed research. Read the source artifact named in the preflight and carry its unresolved questions forward. Equivalent normalized titles and repeated brief adoption reuse an initiative; unrelated ideas need their own initiative. Ambiguity requires an explicit ID.
2. Handle exit 2 by collecting explicit answers and rerunning begin. Exit 3 is a precondition; exit 4 is invalid input. Do not create a second initiative to bypass a closed outcome, a required decision or another failure.
3. Show display.text; use the profile style privately. Load the selected `frame.template` repository guidance. Use supportive, balanced or adversarial challenge as the style directs, while preserving every question in the returned template.
4. Ask the fixed framing questions: problem, target segment, evidence/hypothesis, expected impact, who validated it, cost/priority, stop conditions and scope hint. The owner is recorded separately. If evidence is too weak to frame responsibly, use the research skill and return with its completed brief.
5. Draft outside the repository using every heading in `contract.template`. Separate evidence from hypotheses. Write each unknown as `TBD: <missing evidence>; who: <person or role>`; never invent a value. Run `wl challenge plan problem --file <path> --json`, show its display cost estimate before dispatch, and give its fixed coverage and exact draft to `wl-challenger`. Resolve findings or preserve explicit evidence gaps before the go/no-go call.
6. Obtain the owner's explicit call/reason, reopening condition for on-hold and exact approved stop conditions. Challenger suggestions remain proposals until accepted. Use contract.inputSchemas.decision for wholeloop/frame-decision@1 and stream the decision. Use `wl frame draft --for <id> --artifact <path> --stdin --json`, then save its exact artifact.content to that path. It replaces the Stop conditions section with only approved decision data.
7. Challenge those final bytes using `wl challenge plan problem --file <path>
   --json` and `wl-challenger`, showing the refreshed display cost estimate first. Resolve every finding, preserving unknowns honestly. Any content edit requires a fresh final review and owner approval of the new digest. Complete reviewTemplate with the actual reviewer and all four coverage areas. A structural problems: [] is not a semantic review. Do not invent one.
8. After the owner approves that exact final revision, call `wl frame finalize
   --for <id> --artifact <path> --stdin --json`. Stale or incomplete reviews cannot complete. Use contract.inputSchemas.review; the decision, owner and run must match. No-go closes with the exact reason/reopen condition; reopening is a separate explicit action. Legacy step complete cannot establish this final-review guarantee.
9. Show display.text and publication status. Local docs/tracker destinations reference the stored artifact and initiative. Remote destinations remain pending handoffs until a host performs the operation and records its link. A go hands off to the spec; an unavailable next step is a limitation to state.

Follow destination-publication for the explicit shared outbox after completion.

Start only the named rendered role with its assignment, required protocol text and result schema. Never fork conversation history or copy the conductor as a worker. Validate each final-message result and submit it from the conductor; checked headless transports already own their submissions.
