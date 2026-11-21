# Core-owned slice definition rules

- ⛔ `slice-contract-first-parts` — create at most one part per declared repository. Multi-repository slices name the contract repository; its part is first and all other parts depend on it. No extra repository-less contract part is invented.
- ⛔ `slice-atomic-dependencies` — stable slice/part identities and dependencies are committed with the plan in one transaction. Cycles, unknown repository keys and cross-scope dependency references fail before publication. Ready-work routing and downstream build entry honor recorded blockers and ancestor decisions.
