# Launch preparation

- ⛔ `launch-pinned-measurements` — Every dashboard implements an owned pinned
  metric and points to its actual measurement entry. Never replace its query,
  baseline, unit, target or window while drafting a launch.
- ⛔ `launch-draft-boundary` — The launcher receives read-only drafting capability,
  not provider or sending tools. The conductor can request only comms.draft,
  dashboards.create and docs.create; reject known sending routes and send=true.
- ⛔ `launch-once-publication` — Record intent before dispatch. Reuse completed
  results; inspect ambiguous/pending outcomes instead of blindly repeating writes.
- ⛔ `launch-guidance-pins` — Load actual repository voice/templates and retain
  their binding/content digests through the launch run.

Local artifacts are real outputs; missing providers remain explicit handoffs.
Drafting does not observe merge readiness, flag state or production metric values.
Actual client adapter permission denial and provider semantics need conformance;
canonical metadata and typed interfaces alone do not prove live tool isolation.
