import type { DecisionRequest } from '../../src/decisions/store.js'
import { type RunnerPlanOptions, RunnerPlanStages } from '../../src/runner/plan-stages.js'
import { runnerDecisionRequirements } from '../../src/runner/route.js'
import { runnerBuilderPlanningFixture } from './runner-builder-planning.js'

type Fixture = Parameters<Parameters<typeof runnerBuilderPlanningFixture>[0]>[0]
export async function runnerPlanFixture(
  run: (
    fixture: Omit<Fixture, 'stages' | 'options' | 'request'> & {
      stages: RunnerPlanStages
      options: RunnerPlanOptions
    },
  ) => Promise<void>,
  settings: Omit<NonNullable<Parameters<typeof runnerBuilderPlanningFixture>[1]>, 'stage'> = {},
) {
  await runnerBuilderPlanningFixture(
    async (f) => {
      const options: RunnerPlanOptions = {
        identity: f.context.request.host,
        requests: (context, artifact): DecisionRequest[] =>
          runnerDecisionRequirements(
            context.plan,
            context.stage,
            f.store.lifecycle.authority.inspect(context.request.grant).grant.basis.kind,
          ).map(({ id }) => ({
            schema: 'wholeloop/delegated-decision-request@1',
            key: `${id}-${context.invocation.slice(0, 32)}`,
            grant: context.request.grant,
            run: context.request.run,
            revision: context.plan.revision,
            plan: context.request.plan,
            decision: id,
            artifacts: [artifact],
            evidence: [{ id: 'production', ...artifact }],
            unknowns: [],
          })),
        host: f.options.host,
      }
      await run({ ...f, options, stages: new RunnerPlanStages(f.store, options) })
    },
    { ...settings, stage: 'plan', withinEnvelope: settings.withinEnvelope ?? true },
  )
}
