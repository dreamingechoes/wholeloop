# PostHog evidence

- Use the official MCP endpoint in tools mode; the default cli mode does not expose execute-sql directly.
- Confirm organization, project and region; discover real event/property names before authoring HogQL.
- Query through execute-sql with query:read permission, never flag/experiment mutation tools.
- Pin the exact query, inclusive/exclusive timestamps, timezone, cohorts and aggregation unit.
- Preserve returned column names, sample size and truncation warnings; a missing event is not a zero count.
- Cite the project/query reference and distinguish observed rows from your interpretation.
- Authentication, failed queries, sampling or incomplete results become an open question with an answerer.
- [Official tools](https://github.com/PostHog/posthog/blob/master/services/mcp/schema/tool-definitions.json)
- Mapping checked: 2026-10-18. Live project conformance remains pending.
