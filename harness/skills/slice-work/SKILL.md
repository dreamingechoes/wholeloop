---
name: slice-work
description: Cut a scope or standalone deliverable into testable vertical slices, declared dependencies and contract-first repository parts before writing code.
metadata:
  wholeloop.step: slice-work
---
# Slice vertical work

Read worker-handoffs, ask-never-guess, output-contract, destination-publication and slice-definition.

1. Call `wl step begin slice-work --for <scope> --json`. Standalone use accepts `--input "<deliverable>" --owner "<person>"` and creates a minimal initiative and scope without pretending earlier Define steps ran. Missing inputs are questions before mutation; inherited approvals remain required.
2. Show display.text; use the style privately. Read the selected `slice.conventions` guidance before drafting, then `wl slices plan --for <scope> --json`. Confirm actual repository roots and the contract-owning repository when more than one is involved. The current checkout is a known candidate, not proof of every root.
3. Read `wl slices schema --json`. Draft wholeloop/slice-plan@1 YAML front matter with repositories and slices. Preserve returned sourceScope/sourceSpec pins and every inherited criterion verbatim. If requirements changed, revise the spec rather than silently weakening the builder's contract.
4. Give each slice a stable key, objective, exactly one user-visible outcome and an end-to-end demonstration: entry point, steps and observable expected result. Add criteria with falsifiable tests, then identified test cases covering every criterion. A backend-only layer is not an end-to-end user demonstration.
5. Declare repositories by plan key. Multiple repositories require a contract repository, interface and examples. The core creates one part per repository; the contract repository's part includes its implementation and goes first. Other repository parts depend on that agreement, not on each other.
6. Slices default to a chain in plan order. Use blockedBy keys or existing slice IDs to declare dependencies; an explicit empty array means independent work. Reuse stable keys to refine work; omission does not delete earlier slices.
7. Write Slice overview, Acceptance criteria, Test cases, End-to-end demonstrations, Repositories and contracts, Dependencies and Open questions sections. Call `wl challenge plan slicing --file <draft> --for <scope> --json`; give its fixed coverage and exact artifact to `wl-challenger`. Resolve findings or record missing evidence. Structural validity does not prove vertical independence.
8. Call `wl slices check <draft> --for <scope> --json`, then `wl step complete slice-work --for <scope> --artifact <draft> --json`. The atomic receipt contains slice/part IDs, dependencies and tracker statuses. Remote tracker execution remains a pending host handoff until linked.
9. Call `wl next <scope> --json`. It selects sole ready work, chooses the contract part first or asks between independent candidates. Continue through build-slice for implementation. Never close dependencies merely to bypass their work.

Start only the named rendered role with its assignment, required protocol text and result schema. Never fork conversation history or copy the conductor as a worker. Validate each final-message result and submit it from the conductor; checked headless transports already own their submissions.
