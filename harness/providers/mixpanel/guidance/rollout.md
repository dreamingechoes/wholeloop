# Rollout provider boundary

- Native comms drafts, flag proposals and dashboard handoffs use rolloutHost and the external user store. They create no remote message, applied flag or chart.
- Virtual wholeloop.flags.read-state needs an explicit authenticated host bridge. Preserve exact flag/environment and full enabled/exposure/audience/revision. Unsupported targeting, missing identities, partial reads or absent bridges stay unknown; never flatten complex cohorts into an invented global percentage.
- Service credentials stay in the host credential store. Resolve project/site/ datasource IDs explicitly. MCP tools require actual roster/argument inspection; manifest names and normalized fixtures do not prove server semantics or access.
- Return complete normalized scalar JSON with an exact unit for numeric queries. Keep the original query/window/timezone and sanitized evidence reference. No empty result is zero. Figma returns referenced design context, never edits.
- Dashboard specs retain the exact metric and source pointer. Handoff means a person creates the chart in the named service; never report remote creation.

The explicit Mixpanel App API host binds project/workspace and native Insights parameters, creates a private dashboard/owned report and verifies their relationship. Time scope remains owner-reviewed and unverified; retain partial links without retry.
