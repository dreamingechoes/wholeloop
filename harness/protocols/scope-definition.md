# Measurable scope definitions

- ⛔ `scope-metric-coverage` — a scope plan pins its completed spec and assigns every metric and story to at least one scope. A standalone plan declares its metric catalog or explicit measurement exception; missing ownership blocks it.
- ⛔ `scope-stable-publication` — a stable key reuses the child ID and local tracker reference. Validate all definitions and dependency cycles before the journal commits; a failure leaves no partial child updates.
- ⛔ `scope-parent-approval` — scopes cannot continue downstream while an ancestor's revision-bound approval is pending. Revising the cut invalidates prior approval; rejection permits correction without approving unfinished work.

State delivery choices and complexity with reasons. Flag names follow selected repository guidance. Remote tracker requests remain pending until the host executes the provider operation and records its actual link.
