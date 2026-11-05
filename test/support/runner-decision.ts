import { contractDigest } from '../../src/contracts/compatibility.js'
import { NativeDelegatedDecisionHost } from '../../src/decisions/native-host.js'
import type { DecisionId } from '../../src/decisions/policy.js'
import type { DecisionRequest } from '../../src/decisions/store.js'
import { RunnerDecisionStages } from '../../src/runner/decision-stages.js'
import type { RunnerStageContext } from '../../src/runner/engine.js'
import { runnerRoute } from '../../src/runner/route.js'
import { type RunnerRequest, RunnerStore } from '../../src/runner/store.js'
import { nativeDecisionFixture } from './native-decisions.js'

export async function runnerDecisionFixture(
  operation: (input: {
    stages: RunnerDecisionStages
    store: RunnerStore
    context: RunnerStageContext
    decision: DecisionRequest
    host: Parameters<RunnerDecisionStages['execute']>[2]
  }) => Promise<void>,
  stageId = 'build-plan:contract',
  options: { decision?: DecisionId; mode?: Parameters<typeof nativeDecisionFixture>[1] } = {},
) {
  await nativeDecisionFixture(
    async ({ request: decision, purposes, host }) => {
      const queue = purposes.queue,
        now = queue.lifecycle.journal.now,
        store = new RunnerStore(queue.lifecycle.journal.files.root, now, queue.budgetClock),
        request: RunnerRequest = {
          schema: 'wholeloop/delivery-runner-request@1',
          key: 'decision-stages',
          run: decision.run,
          revision: 1,
          plan: decision.plan,
          grant: decision.grant,
          host: { id: 'fixture', version: '1', configuration: 'a'.repeat(64) },
          pollMs: 50,
        },
        digest = store.prepare(request).digest,
        lease = store.claim(digest, `controller-${'a'.repeat(32)}`),
        plan = store.basis(request).plan,
        stage = runnerRoute(plan).find((item) => item.id === stageId)
      if (!stage) throw new Error('Actual route stage missing')
      const invocation = contractDigest({ request, stage }),
        stages = new RunnerDecisionStages(store, request.host)
      store.append(lease, { action: 'dispatched', stage: stage.id, invocation })
      await operation({
        stages,
        store,
        decision,
        context: {
          request,
          plan,
          stage,
          invocation,
          deadline: new Date(Date.now() + 10000).toISOString(),
          signal: new AbortController().signal,
          current: () => store.live(lease, false),
          started: (runtime) =>
            store.append(lease, { action: 'started', stage: stage.id, invocation, runtime }),
        },
        host: (process) =>
          new NativeDelegatedDecisionHost(purposes, host.evidence, {
            ...host.options,
            native: { ...host.options.native, process },
          }),
      })
    },
    options.mode ?? 'valid',
    'codex',
    { decision: options.decision ?? 'approve-build-plan', none: true },
  )
}
