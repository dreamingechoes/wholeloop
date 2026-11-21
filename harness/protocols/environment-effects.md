# External environment effects

- ⛔ `environment-traceable-undo` — Declare every outside-repository effect against its item with a stable key, resource, effect, person and explicit undo argv/cwd. Include the ledger in Build/PR receipts and hand back its current report.
- ⛔ `environment-no-auto-undo` — Declaring/reporting a recipe never executes it and never proves a write or undo succeeded. Actual cleanup needs observation and authorization in the host; preserve human data and existing environments.

Use `wl env declare --for <id> --file <non-secret-json> --json` and `wl env report
--for <id> --json`. Resolve relative undo cwd against the current repository when using the CLI. Keep credentials in encrypted/OS/tool stores, never recipe values, argv, resource URLs or effects. Common credential flags/shapes are rejected; that is not an exhaustive secret detector.

Use a new key for a new write. Inspect the current environment report and dependencies before an explicitly authorized cleanup; a historical result may predate later effects.
