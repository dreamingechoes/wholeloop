---
name: cut-scopes
description: Split an approved specification or standalone deliverable into stable measurable scopes, with delivery choices and explicit human approval.
metadata:
  wholeloop.step: cut-scopes
---
# Cut scopes

Read ask-never-guess, output-contract and scope-definition.

1. Call `wl step begin cut-scopes --for <initiative> --json`. Standalone use
   accepts `--input "<deliverable>" --owner "<person>"`; it creates an initiative
   without inventing earlier steps. Collect missing inputs first.
2. Show the preflight and style. Read the spec in `have` and call
   `wl scopes plan --for <initiative> --json`. Start with the single suggested
   scope. Split only when each deliverable can ship and be measured independently.
3. Present delivery, flag and complexity questions together for each proposed
   scope. Read the selected `bindings.flags.naming` guidance before naming flags.
   Use `feature` or `proof-of-concept`, a flag or reason for its absence, and
   `simple` or `complex` with its reasoning. Complexity changes the suggested cut,
   not the checks or required approval.
4. Read `wl scopes schema --json`. Author YAML front matter with
   `schema: wholeloop/scope-plan@1`, the pinned `sourceSpec` and `scopes`.
   Preserve story and metric IDs from the spec; every one needs a scope owner.
   Standalone work supplies `metricIds` or an explicit measurement exception.
   A scope without metrics records `measurementReason`.
5. Give each scope a stable `key`, title and goal. Reuse keys on revision to
   preserve IDs and tracker references. `after` contains only intentional
   dependencies, named by another plan key or an existing scope ID in this
   initiative. Omitting an existing scope does not delete it.
6. Write Scope overview, Metric ownership, Delivery plan, Complexity and Open
   questions sections. Ask the challenger whether each scope can ship alone and
   whether dependencies hide missing cuts. Preserve unresolved evidence as
   explicit questions. Host semantic critique still needs client conformance.
7. Call `wl step complete cut-scopes --for <initiative> --artifact <file> --json`.
   Fix validation findings. The receipt identifies child scopes and their tracker
   references. Local tracker items are already stored; a remote destination can
   remain a pending handoff. Report its actual status and record any external
   link only after the host operation succeeds.
8. Stop for the person's `approve-scopes` decision. Record their actual response
   using `wl answer decision.approve-scopes=approved|rejected --for <initiative>
   --by <person> --json`. Revisions need fresh approval; child IDs cannot bypass
   the parent's pending decision. Then `wl next <initiative> --json` chooses the
   sole open scope or asks which scope to continue.
