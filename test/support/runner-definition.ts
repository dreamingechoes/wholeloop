import type { DecisionRequest } from '../../src/decisions/store.js'
import type { RunnerArtifactResult } from '../../src/runner/artifact-stages.js'
import {
  type RunnerDefinitionOptions,
  RunnerDefinitionStages,
} from '../../src/runner/definition-stages.js'
import { runnerDecisionRequirements } from '../../src/runner/route.js'
import { runnerBuilderPlanningFixture } from './runner-builder-planning.js'

type Fixture = Parameters<Parameters<typeof runnerBuilderPlanningFixture>[0]>[0]
export async function runnerDefinitionFixture(
  run: (
    fixture: Omit<Fixture, 'stages' | 'options' | 'request'> & {
      stages: RunnerDefinitionStages
      options: RunnerDefinitionOptions
      requests(produced: Readonly<RunnerArtifactResult>): DecisionRequest[]
    },
  ) => Promise<void>,
  settings: Omit<NonNullable<Parameters<typeof runnerBuilderPlanningFixture>[1]>, 'stage'> = {},
) {
  await runnerBuilderPlanningFixture(
    async (fixture) => {
      const requests = (produced: Readonly<RunnerArtifactResult>): DecisionRequest[] => {
        if (!produced.artifact) throw new Error('Fixture definition artifact missing')
        const artifact = produced.artifact
        return runnerDecisionRequirements(
          fixture.context.plan,
          fixture.context.stage,
          fixture.store.lifecycle.authority.inspect(fixture.context.request.grant).grant.basis.kind,
        ).map(({ id }) => ({
          schema: 'wholeloop/delegated-decision-request@1',
          key: `${id}-${fixture.context.invocation.slice(0, 32)}`,
          grant: fixture.context.request.grant,
          run: fixture.context.request.run,
          revision: fixture.context.plan.revision,
          plan: fixture.context.request.plan,
          decision: id,
          artifacts: [artifact],
          evidence: [{ id: 'production', ...artifact }],
          unknowns: [],
        }))
      }
      const options: RunnerDefinitionOptions = {
        production: fixture.options.production,
        decisions: (_context, produced) => requests(produced),
        host: fixture.options.host,
      }
      await run({
        ...fixture,
        options,
        requests,
        stages: new RunnerDefinitionStages(fixture.store, options),
      })
    },
    { ...settings, stage: 'definition', withinEnvelope: settings.withinEnvelope ?? true },
  )
}
