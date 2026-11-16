# Maintenance proposals — from a pinned finding to a delivery request

> **TL;DR** — Pin a local inspection, turn its finding into a reviewable proposal, and admit current proposals within an operator envelope. Admission captures each one as its own delivery request. It never changes code, writes a tracker, plans a run or issues a grant.

> [!IMPORTANT]
> **Experimental.** `wl maintenance`, deduplicated proposals, retained dismissals and once-only admission are tested ([ADR-0195](../decisions/0195-maintenance-proposals-and-recurring-admission.md), [ADR-0196](../decisions/0196-maintenance-commands-and-recurring-delivery-intake.md)). Planning and authorizing an admitted run are the [planning](./delivery-plan.md) and [authorization](./delivery-authorization.md) steps.

## Before you start

Install the CLI as in [getting started](../getting-started.md#install-the-cli). The Bash commands below create a disposable Git repository and a separate external store. They do not change your project or personal store.

## Inspect and propose

An inspection is one local command, run without a shell, that you pin: its id, category, repository name, absolute root, command and rule. Output lines are the finding.

```bash
set -euo pipefail
workspace_dir="$(mktemp -d "${TMPDIR:-/tmp}/wholeloop-maintenance.XXXXXX")"
repo="$workspace_dir/repo"
mkdir -p "$repo"
git -C "$repo" init -q -b main
printf 'Search by title.\nTODO: describe archived tasks.\n' > "$repo/search.md"
git -C "$repo" add search.md
git -C "$repo" -c user.name=Tutorial -c user.email=tutorial@example.test \
  commit -q -m 'docs: add search notes' -m 'Seed a stale note.'
cd "$workspace_dir"
cat > inspection.json <<EOF
{
  "id": "stale-search-docs",
  "category": "stale-docs",
  "repository": "app",
  "root": "$repo",
  "command": ["git", "grep", "-n", "TODO"],
  "rule": "Open TODO notes in documentation are stale."
}
EOF
cat > proposal.json <<'EOF'
{
  "behavior": "Search documentation describes archived tasks.",
  "scope": ["search.md"],
  "criteria": [
    {
      "id": "archived-docs",
      "text": "The search notes describe archived tasks.",
      "test": "The TODO inspection finds nothing in search.md."
    }
  ],
  "validation": "Run the pinned TODO inspection and the documentation check.",
  "risks": ["Readers of the old note need the archived behavior."]
}
EOF
wl maintenance inspect --file inspection.json --json
wl maintenance propose \
  --inspection inspection.json --file proposal.json --store state --json
wl maintenance propose \
  --inspection inspection.json --file proposal.json --store state --json
wl maintenance proposals --store state --json
printf 'Retained tutorial files: %s\n' "$workspace_dir"
```

Expect one finding line, `search.md:2:TODO: describe archived tasks.`, then status `recorded` with a key, then `duplicate` with the same key. The proposal file holds no finding: `propose` runs the inspection itself, so evidence can never be supplied by a caller. A scope path under policy, agent instructions, harness guidance, CI configuration, rubrics, budgets or evaluations appears in `protected`, and admission refuses it.

## Admit within an envelope

The envelope is yours: the operator, allowed categories and repositories, extra protected paths, per-run and aggregate limits, and a `local-handoff` or `to-pr` endpoint. `to-merge` is invalid input. Pass the inspections you pin for this admission; a proposal whose inspection is not among them is not admitted.

```bash
cd "$workspace_dir"
printf '[%s]\n' "$(cat inspection.json)" > inspections.json
cat > envelope.json <<'EOF'
{
  "operator": "Tutorial Operator",
  "categories": ["stale-docs"],
  "repositories": ["app"],
  "protectedPaths": [],
  "perRun": { "maxScope": 2, "maxCriteria": 2 },
  "aggregate": { "maxRuns": 3, "windowMs": 604800000 },
  "endpoint": "local-handoff"
}
EOF
wl maintenance admit \
  --envelope envelope.json --inspections inspections.json --store state --json
wl maintenance admit \
  --envelope envelope.json --inspections inspections.json --store state --json
```

The first admission re-runs the inspection, finds the same evidence and reports `admitted: true` with a `run` identity and a `source` id. The second reports `already-admitted` with the same run and source. A key is never admitted twice. Look at `state/delivery/sources/<source>.json`: the body lists the behavior, evidence, scope, criteria and finding, and each criterion line is mapped with role `criterion`.

`grant` is `separate-exact-plan-grant-required` and `execution` is `not-started`. No plan, journal entry, queue entry or grant exists yet. To continue, write a plan for that `run` from that `source` with `wl delivery plan`, then issue its own grant with `wl delivery authorize`.

## Dismiss, expire and refuse

- `wl maintenance dismiss --key <key> --operator <name> --reason <text>` retains the dismissal. The same finding then reports `dismissed` when proposed and when admitted.
- Change or remove the finding in the repository and admission reports `stale-evidence`.
- An invalid inspection, proposal or envelope exits 3 with a fixed message that does not echo the input.
- If another admission is recorded while inspections run, nothing is written and the command asks you to rerun it, because run identities and the aggregate count depend on the admissions it read first.

You have reached the stopping point when one admission exists per proposal and the delivery source carries its mapped criteria. Planning and authorization stay explicit; see [delivery planning](./delivery-plan.md).

<!-- docnav -->
[◀ Original delivery evaluation fixtures](delivery-evaluation-fixtures.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [V1 acceptance ▶](../v1-acceptance.md)
