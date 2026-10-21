# Source evidence

- ⛔ `source-explicit-unknowns` — every source query declares open-question
  degradation. Pending, failed or incomplete queries cannot produce observations;
  preserve the query/window and name an answerer without copying raw tool errors.
- ⛔ `postgresql-read-only-query` — PostgreSQL source execution accepts one
  conservative SELECT/WITH query through stdin, inside a server read-only
  transaction with timeout and rollback. Reject transaction controls, modifying
  CTEs, psql commands and unsupported quoting before launching the process.

Read each provider's guidance and live schema. Verify project/tenant/region,
dates, timezone, permissions, query cost and completeness. Preserve references
and distinguish observations from inference. A read-only database role is still
required; fixture execution does not prove live permissions or source truth.

Use the native client's MCP connection first. Report observed tools/schemas to
`wl provider plan <id> <operation> --mcp <external-inventory.json> --json`; a planned
route does not prove authentication. The client translates arguments and normalizes
results from the live schema. HTTP requires explicit selection and never follows
missing or failed MCP access automatically. Preserve the declared open question
when access or the actual tool contract is missing.
