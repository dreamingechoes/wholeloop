# BigQuery evidence

- Use execute_sql_readonly, never the unrestricted execute_sql tool.
- Confirm project, dataset, region and billing scope. Use a principal with read-only dataset permissions.
- Discover columns first; pin GoogleSQL, parameters, date boundaries and timezone.
- Set bounded server timeouts and inspect dry-run cost estimates before an expensive real query.
- Preserve job ID/location and poll incomplete jobs in the host; pending work is not an empty result.
- Record row limits, errors and aggregation units. Missing access becomes an explicit open question.
- Do not export sensitive raw rows merely to calculate an aggregate already supported in the warehouse.
- [Read-only tool](https://docs.cloud.google.com/bigquery/docs/reference/mcp/tools_list/execute_sql_readonly)
- Mapping checked: 2026-10-18. Live IAM, cost and job-conformance checks remain pending.
