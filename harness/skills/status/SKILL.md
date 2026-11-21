---
name: status
description: Inspect wholeloop items, pending human decisions and unread message counts without changing local state. Use for progress and handoff questions.
---
# Show status

Read the shared output-contract protocol. Read speaking-to-person.

Call `wl status [<id>] --json` and show `display.text` verbatim. Add `--all` only when closed work was requested. The core groups the tree by actionable decisions, due checkpoints and work in progress; upcoming decisions do not ask for approval. An empty store is an empty status, not a reason to fabricate a project.

For details, use `wl state get <id> --json`, `wl open <id>` or `wl resume <id>
--json`. These reads leave messages unread. Use explicit message reads only when the person or the workflow requests them.

Report only missing observations relevant to the request. Never infer completed work or authenticated access from an unavailable read.
