import { contractDigest } from '../../src/contracts/compatibility.js'
import type { DeliveryPlan } from '../../src/delivery/plan.js'
import { DEFAULT_REVIEW_RUBRIC } from '../../src/review/input.js'
import { continueDelivery } from '../../src/runner/continuation.js'
import { RunnerCorrectionStages } from '../../src/runner/correction-stages.js'
import type { RunnerStageContext, RunnerStageObservation } from '../../src/runner/engine.js'
import { RunnerGitStages } from '../../src/runner/git-stages.js'
import { runnerRoute } from '../../src/runner/route.js'
import type { RunnerRequest, RunnerStore } from '../../src/runner/store.js'
import { authorization } from './delivery.js'
import { runnerWorkerComponents, runnerWorkerFixture } from './runner-worker.js'

/** Actual owned production/Git with a synthetic predecessor failure; no complete native route. */
export async function runnerCorrectionFixture(
  run: (input: {
    store: RunnerStore
    request: RunnerRequest
    host: RunnerGitStages
    corrections: RunnerCorrectionStages
    context: RunnerStageContext
    production: ReturnType<typeof runnerWorkerComponents>
    dispatch(id: string): RunnerStageContext
    observe(value: RunnerStageObservation): void
    root: string
  }) => Promise<void>,
  options: {
    restarts?: number
    seed?: Record<string, string>
    repairText?: Record<number, string>
    retain?: boolean
    beforeBuild?(input: {
      store: RunnerStore
      request: RunnerRequest
      plan: DeliveryPlan
      root: string
      workspace: string
    }): void | Promise<void>
  } = {},
) {
  await runnerWorkerFixture(
    async (input) => {
      const { store, workers, host, request, dispatch, observe, root } = input
      observe(await workers.execute(dispatch('implementation:search')))
      observe(await host.execute(dispatch('commit:search')))
      const failed = dispatch('integration:feature')
      failed.started({ backend: 'fixture', instance: failed.invocation, worker: failed.stage.id })
      observe({
        schema: 'wholeloop/delivery-runner-stage-observation@1',
        request: contractDigest(request),
        plan: request.plan,
        stage: failed.stage.id,
        invocation: failed.invocation,
        status: 'failed',
        invocationState: 'stopped',
        evidence: 'f'.repeat(64),
        provenance: 'fixture',
        reason: 'Synthetic retained product failure for a component control.',
      })
      const original = store.record(contractDigest(request))
      if (!original.controller) throw new Error('Original fixture controller required')
      store.release(
        {
          request: contractDigest(request),
          controller: original.controller,
          generation: original.generation,
        },
        'Release the synthetic failed predecessor before recording its correction.',
      )
      store.lifecycle.transition(request.run, {
        to: 'failed',
        outcome: 'failed',
        reason: 'Retain the synthetic original product failure.',
      })
      continueDelivery(
        store.lifecycle,
        request.run,
        { request: contractDigest(request), stage: failed.stage.id, unit: 'search' },
        {
          operator: 'Fixture Operator',
          reason: 'Exercise original correction production under a new exact-plan grant.',
        },
      )
      const next = store.planning.getPlan(request.run, 2),
        grant = store.lifecycle.authority.authorize({
          ...authorization(next.plan, next.digest),
          id: 'authorization-fedcba9876543210',
        })
      store.lifecycle.track({ run: request.run, revision: 2, grant: grant.grant.id })
      const current: RunnerRequest = {
          ...request,
          key: 'correction-component',
          revision: 2,
          plan: next.digest,
          grant: grant.grant.id,
        },
        digest = store.prepare(current).digest,
        lease = store.claim(digest, `controller-${'b'.repeat(32)}`),
        git = new RunnerGitStages(store),
        dispatchCurrent = (id: string): RunnerStageContext => {
          const stage = runnerRoute(next.plan).find((entry) => entry.id === id)
          if (!stage) throw new Error('Current correction route stage required')
          const invocation = contractDigest({ digest, id })
          store.append(lease, { action: 'dispatched', stage: id, invocation })
          return {
            request: current,
            plan: next.plan,
            stage,
            invocation,
            deadline: new Date(Date.now() + next.plan.budgets.attemptMs).toISOString(),
            signal: new AbortController().signal,
            current: () => store.live(lease, false),
            started: (runtime) =>
              store.append(lease, { action: 'started', stage: id, invocation, runtime }),
          }
        },
        observeCurrent = (value: RunnerStageObservation) =>
          store.append(lease, {
            action: 'observed',
            stage: value.stage,
            invocation: value.invocation,
            status: value.status,
            evidence: value.evidence,
            provenance: value.provenance,
            reason: value.reason,
          })
      observeCurrent(await git.execute(dispatchCurrent('workspace:search')))
      await options.beforeBuild?.({
        store,
        request: current,
        plan: next.plan,
        root,
        workspace: git.workspace(current, 'search').repository.path,
      })
      const production = runnerWorkerComponents(
        {
          ...input,
          request: current,
          digest,
          host: git,
          dispatch: dispatchCurrent,
          observe: observeCurrent,
          adopt: () => {
            throw new Error('This exact-plan component control cannot adopt another plan')
          },
        },
        'complete',
        {
          provenance: 'host-observed',
          guidance: DEFAULT_REVIEW_RUBRIC,
          ...(options.repairText ? { repairText: options.repairText } : {}),
        },
      )
      observeCurrent(await production.workers.execute(dispatchCurrent('implementation:search')))
      observeCurrent(await git.execute(dispatchCurrent('commit:search')))
      const corrections = new RunnerCorrectionStages(store, production.queue, production.options),
        context = dispatchCurrent('correction-1:search'),
        result = await corrections.execute(context)
      if (result.status !== 'passed')
        throw new Error(`Original correction required: ${JSON.stringify(result)}`)
      observeCurrent(result)
      if (store.lifecycle.journal.get(current.run).state === 'waiting-external')
        store.lifecycle.transition(current.run, {
          to: 'queued',
          reason: 'The exact owned correction commit is observed before the next component.',
        })
      await run({
        store,
        request: current,
        host: git,
        corrections,
        context,
        production,
        dispatch: dispatchCurrent,
        observe: observeCurrent,
        root,
      })
    },
    'complete',
    {
      unattended: true,
      provenance: 'host-observed',
      stageBudget: 'plan',
      guidance: DEFAULT_REVIEW_RUBRIC,
      ...(options.restarts !== undefined ? { restarts: options.restarts } : {}),
      ...(options.seed ? { seed: options.seed } : {}),
      ...(options.retain ? { retain: true } : {}),
    },
  )
}
