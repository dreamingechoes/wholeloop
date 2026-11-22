# Verification execution

⛔ `verify-suite-once`: Execute only declared suite commands once per pinned round; preserve ambiguous interrupted intents and share the resulting receipt instead of relaunching tests. ⛔ `verify-agreed-criteria`: Ask for missing criteria before creating standalone verification and never replace a recorded agreement through an invocation override. ⛔ `verify-observed-exit`: An actual failed suite execution cannot become PASS through refutation; canonical verification completion needs a successful current suite receipt. ⛔ `verify-test-sensitivity`: Check changed tests for known constant assertions and retain a separate read-only semantic sensitivity assignment.

For instruction-file guidance, select explicit declared command references. Share the returned suite output with checkers; do not execute the suite again to recover missing output. Stop on a failed or interrupted run and inspect its reported state.

- ⛔ `verify-startup-budget` — known spawn failures and exit 126/127 stop before workers or a code verdict. Keep the intent; a new plan retains only unused evaluation budget, with earlier code failures still spent. Changed workspaces, submitted criterion work and ambiguous interruptions never earn this discount. Environment repair retains its existing owner and authority.
- ⛔ `verify-readable-output` — canonical suite calls select result version 2, which names output hashes and shows bounded transient failure excerpts. Never persist process output or invent a tail for a cached hash-only receipt.

Constant lint recognizes a limited JavaScript assertion vocabulary and skips quoted fixtures/comments. It does not prove whole-test failure reachability or execute a mutation engine. Missing observations remain the semantic verifier's responsibility.
