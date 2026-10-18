# Vertical slice definitions

- ⛔ `slice-testable-outcome` — declare exactly one user-visible outcome and an
  end-to-end demonstration per slice. Every criterion has a falsifiable test and
  a linked test case; inherited spec criteria remain covered and unchanged.
- ⛔ `slice-contract-first-parts` — create at most one part per declared repository.
  Multi-repository slices name the contract repository; its part is first and all
  other parts depend on it. No extra repository-less contract part is invented.
- ⛔ `slice-atomic-dependencies` — stable slice/part identities and dependencies
  are committed with the plan in one transaction. Cycles, unknown repository keys and
  cross-scope dependency references fail before publication. Ready-work routing
  and downstream build entry honor recorded blockers and ancestor decisions.

Structural lint checks declared fields, not whether prose describes a true
vertical cut. Use the slicing challenger mode for independent releaseability,
missing boundaries, hidden dependencies and full scope delivery. Live semantic
critique and remote tracker mirroring remain host conformance work.
