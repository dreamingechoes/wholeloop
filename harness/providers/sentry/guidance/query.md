# Sentry evidence

- Scope the official OAuth endpoint to the actual organization/project where practical.
- Use search_events for counts/aggregations and event evidence; issue groups are not event counts.
- Preserve dataset, environment, release, filters and exact time range from the measurement plan.
- Inspect the live schema: supported absolute windows and natural-language translation vary by version.
- Cite event/issue/query links and retain sample sizes or partial-result warnings.
- Do not triage, resolve issues, change alert rules or invoke automated fixes during evidence collection.
- A missing tool/provider key, permission error or unpinnable window remains an open question.
- [Official server](https://mcp.sentry.dev/)
- Mapping checked: 2026-10-18. Live search/window conformance remains pending.
