import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { RunnerAssemblyReadiness } from '../../../src/runner/assembly-readiness.js'
import { RunnerFeatureReadiness } from '../../../src/runner/feature-readiness.js'
import { RunnerIntegrationStages } from '../../../src/runner/integration-stages.js'
import { RunnerMilestoneReadiness } from '../../../src/runner/milestone-readiness.js'
import { RunnerNativeStage } from '../../../src/runner/native-stage.js'
import { RunnerStore } from '../../../src/runner/store.js'
import { runnerGitFixture } from '../../support/runner-git.js'

describe('one current whole-product input to feature acceptance', () => {
  it.each([
    'pending',
    'independent-products',
    'linear-products',
    'unsupported-flags',
    'foreign-reader',
  ] as const)('refuses %s without exposing product inputs or selecting work', async (mode) => {
    await runnerGitFixture(
      async ({ store, request, dispatch, observe }) => {
        if (mode === 'unsupported-flags') {
          const context = dispatch('integration:feature'),
            actual = await new RunnerNativeStage(store, context).run((invoke) =>
              invoke(process.execPath, ['--version'], {
                cwd: store.files.root,
                input: '',
                timeoutMs: 3000,
                signal: context.signal,
                env: { PATH: process.env.PATH },
              }),
            )
          expect(actual.code).toBe(0)
          observe({
            schema: 'wholeloop/delivery-runner-stage-observation@1',
            request: contractDigest(request),
            plan: request.plan,
            stage: context.stage.id,
            invocation: context.invocation,
            status: 'passed',
            invocationState: 'stopped',
            provenance: 'host-observed',
            evidence: 'f'.repeat(64),
            reason: 'A closed version client and root flags do not establish product QA.',
          })
        }
        const before = contractDigest(store.lifecycle.journal.events()),
          selected =
            mode === 'foreign-reader'
              ? new RunnerStore(join(store.files.root, '..', 'foreign-state'))
              : store,
          integration = new RunnerIntegrationStages(
            selected,
            new RunnerAssemblyReadiness(
              selected,
              new RunnerMilestoneReadiness(selected, new Map()),
            ),
          )
        if (mode === 'foreign-reader')
          expect(() => new RunnerFeatureReadiness(store, integration)).toThrow(
            'feature-readiness-fixed-integration-required',
          )
        else {
          const result = await new RunnerFeatureReadiness(store, integration).inspect(request)
          expect(result.status).toBe(mode === 'unsupported-flags' ? 'unknown' : 'blocked')
          expect(result.candidate).toBeUndefined()
          expect(result.assembly).toBeUndefined()
          expect(result.report).toBeUndefined()
          expect(result.acceptance).toBe('not-established')
          if (mode === 'independent-products')
            expect(result.reason).toBe('feature-one-complete-product-assembly-required')
          if (mode === 'unsupported-flags')
            expect(store.stage(contractDigest(request), 'integration:feature')?.status).toBe(
              'passed',
            )
        }
        expect(contractDigest(store.lifecycle.journal.events())).toBe(before)
      },
      {
        singleUnit: true,
        configure(plan) {
          const original = plan.milestones[0]
          if (!original) throw new Error('Original fixture milestone required')
          if (mode === 'independent-products' || mode === 'linear-products')
            plan.milestones.push({
              ...original,
              id: 'second',
              after: mode === 'linear-products' ? [original.id] : [],
            })
        },
      },
    )
  })
})
