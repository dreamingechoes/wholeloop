---
name: prepare-launch
description: Pin a scope's measurement revision, load repository voice/templates and prepare rollout, comms drafts, metric-linked dashboard specs and enablement without sending anything.
metadata:
  wholeloop.step: prepare-launch
---
# Prepare the launch

Read worker-handoffs, ask-never-guess, output-contract and launch-preparation. Read speaking-to-person.

1. Use `wl launch begin --for <scope> --json`. Standalone use supplies a shipping description, --owner and an agreed --measurement file from `wl launch schema`. Missing measurement numbers/queries/targets/windows/stages become a question; never invent metrics or earlier Define/merge completion.
2. Use the scope's exact cut-scopes/spec revision, not the latest unrelated spec. Read the returned measurement digest and actual loaded comms.voice and launch.templates. Restore pinned source/guidance if a resumed run reports drift.
3. Give the read-only `wl-launcher` the plan, voice/templates and effective profile. It returns wholeloop/launch-kit@1 covering all stages and owned metrics plus support guide, one-pager and runbook. Keep every comms message a draft. Where no native launcher is installed (Codex), use `wl launch draft --for <id> --engine headless --adapter codex --json` instead: it drafts in one isolated read-only worker without user MCP servers and stores the kit, so skip step 4.
4. Complete with `wl launch complete --for <id> --file <kit.json> --json`. The core rejects query/metric overrides, missing coverage and fabricated receipts. It constructs dashboard source links to actual stored measurement entries.
5. Read `wl launch report --for <id> --json`. Local artifacts remain usable when a provider is absent. A conductor with an explicit host may dispatch only comms.draft, dashboards.create and docs.create through dispatchLaunchArtifact; the drafting agent never receives that interface.
6. A recorded publication intent is not safe to repeat after a lost response. Inspect the remote outcome; do not clear intent or retry blindly. A successful comms result needs an explicit unsent draft observation. Pending/ambiguous results stay unknown. Never invoke sending, ready or exposure-changing tools.
7. Hand back the kit, source links, provider status and unknown merge/flag state. Preparing drafts does not establish readiness to expose the feature. People review, adjust and send; ramp decisions and flag changes are separate.

Start only the named rendered role with its assignment, required protocol text and result schema. Never fork conversation history or copy the conductor as a worker. Validate each final-message result and submit it from the conductor; checked headless transports already own their submissions.
