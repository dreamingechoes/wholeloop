---
name: next
description: Continue wholeloop work from an item ID or begin framing a new idea. Use when the person wants to know what comes next or resume local work.
---
# Continue work

Read the shared ask-never-guess and output-contract protocols.

1. Call `wl next ["<idea-id-or-URL>"] --json`, adding `--owner <person>` only when ownership is known. No input either selects the sole open item or asks which one to continue. A stored URL reuses its linked identity. For an unknown URL, answer source and identity questions, read it through the chosen provider, then supply a labelled wholeloop/shared-read@1 file with --provider, --kind and known owner/title. Adoption imports context, never approvals or completed steps.
2. Present returned questions together. A decision question belongs to a person; record their actual answer with `wl answer decision.<id>=approved|rejected
   --for <question.subject> --remember run --by <person> --json`, then rerun next.
3. Read `contract` and show its preflight and style. Follow the corresponding canonical step skill only when the returned contract is available. The current local path includes research, framing, write-spec, cut-scopes and slice-work, preserving their contracts.
4. After completing that artifact, show the receipt and call `wl next <id> --json` to inspect the next action. Stop on missing input, a required decision, an unavailable step or the person's request. Follow returned child IDs when routing through a scope, slice or contract-first repository part.

Finished and explicitly skipped steps stay recorded. Never simulate the later steps to make the flow appear complete. Use `wl resume <id> --json` for bounded context after a session change and `wl status <id> --json` for read-only status.
