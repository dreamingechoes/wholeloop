---
name: status
description: Inspect wholeloop items, pending human decisions and unread message counts without changing local state. Use for progress and handoff questions.
---
# Show status

Read the shared output-contract protocol.

Call `wl status [<id>] --json`. Summarize each item's title, owner and status, its active or next step, pending decisions and unread message count. An empty store is an empty status, not a reason to fabricate a project.

For details, use `wl state get <id> --json`, `wl open <id>` or `wl resume <id>
--json`. These reads leave messages unread. Use explicit message reads only when the person or the workflow requests them.

State the limits of the current implementation: scheduled checkpoints, live tracker changes, gate rounds and remote synchronization are not collected yet. Do not mark unavailable workflows as completed or authenticated integrations.
