# Gate rounds

Plan with `wl gate plan verify|review --for <id> --json`. Read every pinned unit, its prompt, criteria, effective budget, disabled reasons and applicability report. Execute units read-only through the host's available engine. Never repair findings inside a checker. Submit observed evidence through `wl gate submit --stdin`; the envelope names the exact run and round and exactly one result or vote.

Cross-examine each finding in independent slots numbered 1 through the pinned quorum. A refutation needs concrete counterevidence. Keep silence and uncertainty visible. Seal only after collecting the intended responses with `wl gate verdict`; sealing with missing workers deliberately records a failed round.

⛔ `gate-deterministic-verdict`: Only the core aggregates PASS, FAIL and EXHAUSTED; missing units never count as clean results. ⛔ `gate-explicit-budget`: Never reset a failed run or extend its budget automatically; an explicit extension needs a reason. ⛔ `gate-observe-only`: A changed workspace blocks the round; preserve its files and route the recorded findings to the builder.

A historical PASS becomes STALE after a code change. Rerun gates explicitly. The host must enforce read-only tools where available and use genuinely independent workers; slot numbers alone are not proof of isolation. Ignored files and external services require their own checks.
