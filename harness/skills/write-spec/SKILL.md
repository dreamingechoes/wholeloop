---
name: write-spec
description: Turn a framed problem or standalone idea into a testable specification with stories, criteria, a pinned measurement plan and an explicit human approval.
metadata:
  wholeloop.step: write-spec
---
# Write a specification

Read worker-handoffs, destination-publication, ask-never-guess, output-contract and spec-definition.

1. Call `wl step begin write-spec --for <initiative> --json`. Standalone use accepts `--input "<problem>" --owner "<person>" --impact "<observable impact>"` without requiring earlier steps. Collect returned missing inputs before creating work.
2. Show the preflight and style block. Read existing framing/research artifacts from `have`, including their unresolved questions. Preserve the initiative ID.
3. Use `templateSource`: for repository guidance, load its `ref` before drafting; for a manifest, fill its `content` and preserve all returned required headings. Repository guidance takes priority. Core criteria/measurement metadata remains additive to the team's format.
4. Read `wl spec schema --json`. The artifact's YAML front matter uses `schema: wholeloop/spec@1`, impact, stories, metrics and rollout. Each story names its actor, desired behavior, benefit and criteria with falsifiable tests. Remove vague wording rather than accepting "fast", "intuitive" or "better".
5. For every metric, pin provider, query operation, stored query, unit, baseline, target and measurement window/timezone. A known baseline cites evidence. An unknown baseline names missing evidence, an answerer and an existing story that adds the tracking. No metrics requires an explicit measurement exception with a reason and accountable person; it is not a silent omission.
6. Write the readable problem/users/stories/criteria/metrics/rollout/measurement sections and technical appendix. Keep technical detail in the appendix; show dependencies, affected paths, proposed flags and candidate scopes there.
7. Run `wl challenge plan spec --file <draft-file> --json`. Give the returned fixed coverage and exact artifact to `wl-challenger` to inspect the criteria as a tester: contradictions, missing boundaries and behavior that could pass while doing something unwanted. Use the challenge style without dropping coverage. Resolve findings with evidence or explicit questions; do not invent a baseline or claim to have run a query.
8. Run `wl spec check <draft-file> --json`, then `wl step complete write-spec
   --for <id> --artifact <draft-file> --json`. Fix structural findings before presenting the receipt. Remote publication can still be a pending handoff.
9. Stop at `approve-spec`. Record only the person's actual decision with `wl answer decision.approve-spec=approved|rejected --for <id> --by <person>
   --json`. A rejection permits a new write-spec run; its completed revision needs a fresh approval. Do not continue downstream while approval is pending.

Host execution, semantic critique and live measurement queries need client/source conformance; the core verifies structure and preserves the exact authored plan.

Start only the named rendered role with its assignment, required protocol text and result schema. Never fork conversation history or copy the conductor as a worker. Validate each final-message result and submit it from the conductor; checked headless transports already own their submissions.
