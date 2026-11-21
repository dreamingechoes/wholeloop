# Headless gate actions

Plan the gate first. Verification needs its actual once-per-round suite before read-only fan-out. Select headless explicitly and use an available recipe; never change native permissions to make a recipe run. AGY requires observed read-only initialization before input.

Run `wl fanout run review|verify --for <id> --engine headless --progress --adapter <client> --json`. The transport submits results and seals the verdict; do not also dispatch native workers. Missing or failed work remains unknown. Preserve unexpected repository changes and report them; never repair from a checker or reset its budget.

Inspect reported external worker metadata when a run is interrupted. Confirm that a lock owner's process stopped before recovery; never steal a stale lock automatically. Do not retain raw worker streams or copy credentials into an input. Report the actual missing capability rather than a general platform caveat.
