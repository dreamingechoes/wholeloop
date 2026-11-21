---
name: ramp-exposure
description: Collect exact stage evidence, record a person's go/hold/rollback and confirm external exposure changes without applying flags.
metadata:
  wholeloop.step: ramp-exposure
---
# Ramp exposure

Read ask-never-guess, output-contract and ramp-evidence. Read speaking-to-person.

1. Begin with `wl ramp begin --for <scope> --file <ramp-plan.json> --json`. Standalone entry supplies a description and --owner. Read `wl ramp schema` and confirm environment, flag/manual control, audiences, thresholds, units and windows. The default 0/internal/10/50/100 sequence is a suggestion, never an approval.
2. Read the pinned ramp.criteria content. A prepared launch also requires its measurement sourceDigest. Do not replace either binding during the run.
3. Request reads with `wl ramp requests --for <id> --mode observe --json`. The conductor executes only those provider reads and returns sanitized normalized wholeloop/ramp-read-responses@1 results, including explicit unavailable entries. Use `wl ramp observe --for <id> --stdin --json` to record them.
4. Show exact source queries, units, windows, unknown reasons and recommendations. Ask the person, then record `wl ramp decide go|hold|rollback --for <id>
   --basis <observation-event> --by <person> --reason <reason> --json`. Go requires every required check passed and --ack containing every optional open check key.
5. `wl ramp proposal --for <id> --json` only prepares the change. An explicitly invoked conductor SDK can dispatchRampProposal through flags.propose-change; it records intent, requires applied=false and never retries ambiguous requests.
6. The person applies the change externally. Prepare fresh --mode confirm reads after the decision, then `wl ramp confirm --for <id> --by <person>
   --stdin --json`. Manual control also needs `--evidence <ref>`. A matching read advances one stage; a confirmed rollback restarts at stage zero.
7. Resume with `wl ramp report --for <id> --json`. Respect full lookback windows after confirmation or restored control; changed/unavailable exposure is unknown. Keep remote state and continuous cohort history as explicit owner checks.
