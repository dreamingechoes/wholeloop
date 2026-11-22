# Build execution

⛔ `build-plan-before-code`: Record a validated builder plan against the prepared workspace snapshot before implementing; unresolved assumptions require a revision-bound human decision. ⛔ `build-current-gates`: Complete a build only with verify and review PASS on the same current workspace bytes after its recorded plan; ad-hoc work runs both gates too. ⛔ `build-repo-guidance`: Resolve and load repository/user build guidance before the builder; ambiguous bindings stop provisioning.

⛔ `build-project-code-in-docker`: Builders run tests, builds and other project scripts only through `wl exec --for <slice> -- <command>`, which uses the slice's warm container or the repository's recorded host choice; never through the client's own shell, and never choose the host yourself. Commands there run offline: never install dependencies through it; the repository's declared setup does that once, with network, and a missing one is a question for the person. A refusal names its remedies; show it to the person.

Supply the prepared workspace, tools, independent workers, actual observations and cancellation. Retain every returned check at every pace.

Never weaken criteria, reset a failed budget or infer human testing from green machine gates. A changed personal checkout is a host violation to preserve and report, never something to restore silently. Runtime snapshots and receipts remain outside repositories; no external message, push or pull request belongs to this step.
