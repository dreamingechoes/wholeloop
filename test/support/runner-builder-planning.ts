import { NativeDelegatedDecisionHost } from '../../src/decisions/native-host.js'
import type { DecisionRequest } from '../../src/decisions/store.js'
import { readSourceFile, sourceHash } from '../../src/delivery/input.js'
import { NativePurposeAttempts } from '../../src/delivery/native-purpose.js'
import { DeliveryQueue } from '../../src/delivery/queue.js'
import type { RunnerArtifactResult } from '../../src/runner/artifact-stages.js'
import {
  type RunnerBuilderPlanningOptions,
  RunnerBuilderPlanningStages,
} from '../../src/runner/builder-planning-stages.js'
import { runnerArtifactFixture } from './runner-artifact.js'

type ArtifactFixture = Parameters<Parameters<typeof runnerArtifactFixture>[0]>[0]
export async function runnerBuilderPlanningFixture(
  run: (
    input: ArtifactFixture & {
      stages: RunnerBuilderPlanningStages
      options: RunnerBuilderPlanningOptions
      request(production: Readonly<RunnerArtifactResult>): DecisionRequest
    },
  ) => Promise<void>,
  settings: {
    provenance?: 'fixture' | 'host-observed'
    stage?: 'build-plan' | 'definition'
    withinEnvelope?: boolean
    mode?: 'valid' | 'incomplete' | 'decision-reject'
    delegate?: boolean
    stageBudget?: 'plan'
  } = {},
) {
  const provenance = settings.provenance ?? 'fixture'
  await runnerArtifactFixture(
    async (fixture) => {
      const request = (production: Readonly<RunnerArtifactResult>): DecisionRequest => {
        if (!production.artifact) throw new Error('Fixture producer artifact missing')
        return {
          schema: 'wholeloop/delegated-decision-request@1',
          key: `builder-${fixture.context.invocation.slice(0, 40)}`,
          grant: fixture.context.request.grant,
          run: fixture.context.request.run,
          revision: fixture.context.plan.revision,
          plan: fixture.context.request.plan,
          decision: 'approve-build-plan',
          artifacts: [production.artifact],
          evidence: [{ id: 'production', ...production.artifact }],
          unknowns: [],
        }
      }
      const options: RunnerBuilderPlanningOptions = {
        production: {
          identity: fixture.context.request.host,
          native: (process) => ({ ...fixture.native, process }),
          context: () => fixture.input,
        },
        decision: (_context, production) => request(production),
        host: (process) =>
          new NativeDelegatedDecisionHost(
            new NativePurposeAttempts(
              new DeliveryQueue(
                fixture.store.files.root,
                fixture.store.now,
                undefined,
                fixture.store.budgets.clock,
              ),
            ),
            {
              prerequisites: () => ({
                supported: true,
                humanRequired: false,
                interactive: 'disabled',
              }),
              observeEvidence: (decision) =>
                decision.evidence.map((item) => {
                  const digest = sourceHash(
                    readSourceFile(fixture.store.files.root, item.ref, 256 * 1024),
                  )
                  return {
                    ...item,
                    status: digest === item.sha256 ? 'passed' : 'unknown',
                    observation: digest,
                    provenance,
                  }
                }),
            },
            {
              native: { ...fixture.native, process },
              provenance,
              environment: fixture.input.environment,
            },
          ),
      }
      await run({
        ...fixture,
        options,
        request,
        stages: new RunnerBuilderPlanningStages(fixture.store, options),
      })
    },
    provenance,
    {
      stage: settings.stage ?? 'build-plan',
      ...(settings.withinEnvelope ? { withinEnvelope: true } : {}),
      ...(settings.mode ? { mode: settings.mode } : {}),
      delegate: settings.delegate ?? true,
      ...(settings.stageBudget ? { stageBudget: settings.stageBudget } : {}),
    },
  )
}
