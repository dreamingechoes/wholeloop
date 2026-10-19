---
name: frame-problem
description: Frame a rough idea or research brief as an owned initiative, with evidence and unknowns, and finish with a specification handoff or an argued no-go.
metadata:
  wholeloop.step: frame-problem
---
# Frame a problem

Read destination-publication, ask-never-guess, output-contract and framing-evidence.

1. Call `wl step begin frame-problem --input "<idea>" --owner "<person>" --json`.
   Omit unknown values for batched questions. Use `--for <initiative>` to refine
   known work or `--from <brief-id>` to adopt completed research. Read the source
   artifact named in the preflight and carry its unresolved questions forward.
   Equivalent normalized titles and repeated brief adoption reuse an initiative;
   unrelated ideas need their own initiative. Ambiguity requires an explicit ID.
2. Handle exit 2 by collecting explicit answers and rerunning begin. Exit 3 is
   a precondition; exit 4 is invalid input. Do not create a second initiative
   to bypass a closed outcome, a required decision or another failure.
3. Show the preflight and profile style. Load the selected `frame.template`
   repository guidance. Use supportive, balanced or adversarial challenge as
   the style directs, while preserving every question in the returned template.
4. Ask the fixed framing questions: problem, target segment, evidence/hypothesis,
   expected impact, who validated it, cost/priority, stop conditions and scope
   hint. The owner is recorded separately. If evidence is too weak to frame
   responsibly, use the research skill and return with its completed brief.
5. Draft outside the repository using every heading in `contract.template`.
   Separate evidence from hypotheses. Write each unknown as
   `TBD: <missing evidence>; who: <person or role>`; never invent a value.
   Run `wl challenge plan problem --file <path> --json` and give its fixed
   coverage and exact draft to the challenger. Resolve findings or preserve
   explicit evidence gaps before the go/no-go call.
6. Complete with `wl step complete frame-problem --for <id> --artifact <path>
   --json`. Fix structural findings first. When the explicit call is no-go,
   add `--no-go dropped --reason "<why>"` or `--no-go on-hold --reason "<why>"
   --reopen "<condition>"`. No-go closes the initiative with durable reasoning;
   reopening is an explicit state action, never automatic duplicate creation.
7. Show the receipt and publication status. Local docs/tracker destinations
   reference the stored artifact and initiative. Remote destinations remain
   pending handoffs until a host performs the operation and records its link.
   A go hands off to the spec; an unavailable next step is a limitation to state.

Follow destination-publication for the explicit shared outbox after completion.
