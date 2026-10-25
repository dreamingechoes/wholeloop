# Authorize a prepared plan — keep authority outside workers

> **TL;DR** — Record one explicit grant for a prepared plan or initial request envelope, inspect its finite deadline and revoke it without losing history. This configures authority; it starts no worker and performs no publication or merge.

> [!NOTE]
> **Status: 🚧 partial.** Operator grant/revocation lifecycle and scoped broker admission/request validation are implemented and fixture-tested. Role-bound native/backend contracts and the [delegated-decision controller](./delivery-decisions.md) are implemented separately; complete unattended orchestration remains pending. Actual native filesystem/credential containment remains unverified.

## Before you start

Complete the [planning tutorial](./delivery-plan.md) first. Continue in the same Bash terminal with WHOLELOOP_CLI and workspace_dir still set. The example uses its disposable repository and external store, a fictional operator and no remote account. In a new terminal, restore workspace_dir from that tutorial's retained path or rerun it. Keep request files and receipts outside application repositories.

## Record and inspect a bounded grant

```bash
set -euo pipefail
: "${workspace_dir:?Run the planning tutorial in this terminal first}"
node "$WHOLELOOP_CLI" delivery inspect-plan \
  --run delivery-0123456789abcdef --revision 1 \
  --store "$workspace_dir/state" --json > "$workspace_dir/plan-receipt.json"
node --input-type=module - "$workspace_dir" <<'EOF'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const directory = process.argv[2]
const prepared = JSON.parse(
  readFileSync(join(directory, 'plan-receipt.json'), 'utf8')
)
const request = {
  schema: 'wholeloop/delivery-authorization-request@1',
  id: 'authorization-0123456789abcdef',
  operator: 'Fixture Operator',
  basis: {
    kind: 'plan', digest: prepared.digest,
    run: prepared.plan.run, revision: prepared.plan.revision
  },
  effects: ['report.write', 'workspace.create', 'code.write', 'test.run', 'git.commit'],
  decisions: [],
  repositories: prepared.plan.repositories.map(repository => ({
    repository: repository.id, topicPrefix: 'wl/'
  })),
  reads: [],
  effectLimit: 20
}
writeFileSync(join(directory, 'authorization.json'), JSON.stringify(request, null, 2))
EOF
node "$WHOLELOOP_CLI" delivery authorize \
  --file "$workspace_dir/authorization.json" --root "$workspace_dir" \
  --store "$workspace_dir/state" --json
node "$WHOLELOOP_CLI" delivery grant \
  --id authorization-0123456789abcdef \
  --store "$workspace_dir/state" --json
```

Expect status active, provenance operator-control, the exact plan/source/policy/budgets, your explicit effects and a deadline 24 hours after issuance. runtime: not-observed-by-this-command makes clear that this is no observation of a worker or sandbox. The topic prefix applies only to branches independently recorded as owned by the controller; it cannot authorize changing another user's branch or the target branch.

Repeat authorize with the identical file: it retains the original grant and deadline. Changed requests using the same ID are refused. An expired or revoked action is not renewed by retrying. For a new explicit action, use a new ID and a current valid basis. You may supply a shorter or longer finite expiresAt in canonical UTC before first issuance.

## Revoke while retaining the receipt

```bash
cat > "$workspace_dir/revoke.json" <<'EOF'
{
  "schema": "wholeloop/delivery-revocation-request@1",
  "grant": "authorization-0123456789abcdef",
  "operator": "Fixture Operator",
  "reason": "End this disposable authorization trial."
}
EOF
node "$WHOLELOOP_CLI" delivery revoke \
  --file "$workspace_dir/revoke.json" --root "$workspace_dir" \
  --store "$workspace_dir/state" --json
node "$WHOLELOOP_CLI" delivery grant \
  --id authorization-0123456789abcdef \
  --store "$workspace_dir/state" --json
```

Both commands now report revoked and retain the original grant plus the first revocation. Repeating revoke retains that receipt. Later broker requests fail; history is not erased. No worker is started or stopped by this example, and no Git commit, push, PR or merge occurs. Actual cancellation/reconciliation belongs to the runner lifecycle.

## Initial envelopes and worker boundaries

Use delivery authority-schema --json to inspect the closed request, revocation and broker contracts. A basis can instead be kind: envelope with its exact digest and no run/revision. That records initial authority before detailed planning. Select only delegated decision IDs already declared in the envelope's policy. Code work under that envelope still requires a structurally fitting derived plan and independent exact-plan acceptance; those decision/worker hosts remain later increments. Source instructions and profiles cannot enable delegation.

Endpoint and effect scope are separate: research-report excludes code/publication; local-handoff excludes publication; to-pr excludes merge. Even to-merge requires an explicit merge effect and later actual host eligibility. Deployments, production changes, messages and flag mutation are unsupported. A read rule names an exact provider, tenant/repository scope and existing read operation; a provider write cannot be disguised as a read. Grant data contains identifiers/references, never credential values.

Broker sessions close over controller-selected run/plan/attempt/generation, role and cell scope. Admission returns unavailable unless a trusted runtime reports actual restricted tools and separate controller/credential views; none also excludes interactive tools. Workers cannot choose their own role, create/revoke grants, change budgets or submit human acceptance. Scoped proposals and evidence are recorded as worker-claim with effects not-performed. Fixture runtime observations stay fixture and cannot establish native containment or actual test execution.

The current core exposes no worker-side operator endpoint or automatic process launch. Actual backend/client observation and dispatch follow in P6-08–P6-13. An unrestricted native host retains the existing [supervised small-change route](./small-change.md); widening an authorization cannot make it isolated. [ADR-0095](../decisions/0095-operator-grants-and-scoped-worker-claims.md) records the trust boundary and remaining acceptance.

## Stopping point

You have exercised explicit authorization, independent-process inspection and durable revocation in a disposable external store. Retain the tutorial directory for inspection. Follow [Phase 6](../../roadmap/phase-6-autonomous-delivery.md) for journaled delivery states, queue/fencing, real environments, actual QA and PR/merge evidence. No native/service acceptance is marked passed by these metadata operations.

<!-- docnav -->
[◀ Delivery planning](delivery-plan.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Delegated machine decisions ▶](delivery-decisions.md)
