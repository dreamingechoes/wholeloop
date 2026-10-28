import { writeFileSync } from 'node:fs'
import { FlowEngine } from '../../src/flow/engine.js'
import { DEFAULT_REVIEW_RUBRIC } from '../../src/review/input.js'
import { RunnerReviewStages } from '../../src/runner/review-stages.js'
import { StateStore } from '../../src/state/store.js'
import { type GateFixtureMode, gateWorkerFixture } from './gate-worker.js'
import { runnerWorkerFixture } from './runner-worker.js'

export async function runnerRepairFixture(
  operation: (
    input: Parameters<Parameters<typeof runnerWorkerFixture>[0]>[0] & {
      reader: RunnerReviewStages
      context: ReturnType<Parameters<Parameters<typeof runnerWorkerFixture>[0]>[0]['dispatch']>
    },
  ) => Promise<void>,
  mode: GateFixtureMode = 'confirmed',
) {
  await runnerWorkerFixture(
    async (input) => {
      const { store, host, request, dispatch, observe, workers, root } = input
      const production = await workers.execute(dispatch('implementation:search'))
      if (production.status !== 'passed')
        throw new Error(`Original production unavailable: ${JSON.stringify(production)}`)
      observe(production)
      const committed = await host.execute(dispatch('commit:search'))
      if (committed.status !== 'passed')
        throw new Error(`Original commit unavailable: ${JSON.stringify(committed)}`)
      observe(committed)
      const workspace = host.workspace(request, 'search').repository.path,
        userFile = store.files.path('fixture-review-settings.json')
      writeFileSync(userFile, JSON.stringify({ version: 1, gates: { review: { rounds: 2 } } }))
      const engine = new FlowEngine(
          new StateStore(store.files.root),
          root,
          userFile,
          store.files.path('fixture-home'),
        ),
        options = gateWorkerFixture(store, workspace, mode, 'host-observed'),
        reader = new RunnerReviewStages(store, {
          identity: request.host,
          engine: () => engine,
          gate: options,
        }),
        context = dispatch('review:search'),
        observation = await reader.execute(context)
      if (observation.status !== 'blocked')
        throw new Error(`Expected original kept finding: ${JSON.stringify(observation)}`)
      // Keep the root stage active: the new internal controller owns correction before final observation.
      await operation({ ...input, reader, context })
    },
    'complete',
    {
      unattended: true,
      provenance: 'host-observed',
      guidance: DEFAULT_REVIEW_RUBRIC,
      stageBudget: 'plan',
    },
  )
}
