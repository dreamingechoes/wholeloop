# PostgreSQL evidence

- Use an explicit libpq service backed by a read-only database role; no password or connection URI in argv.
- Credentials come from the host's encrypted/keyring integration; never create a plaintext password file.
- The host executes the pinned query through psql stdin inside BEGIN READ ONLY and ROLLBACK.
- Reject transaction-control or multi-statement input; never permit a query to escape the read-only transaction.
- Apply a statement timeout and bounded result size; preserve schema, parameters, timezone and query digest.
- Read-only transaction semantics complement restricted role permissions; a SQL prefix check is insufficient.
- Do not grant SECURITY DEFINER side effects or broad privileges to make a failing query pass.
- Record the database/service/query reference without credentials. Errors remain owner-assigned open questions.
- [Transaction reference](https://www.postgresql.org/docs/current/sql-set-transaction.html)
- Mapping checked: 2026-10-18. No database connection was made; role/transaction enforcement is manual.
