import { describe, expect, it } from 'vitest'
import { admitBehaviorJob } from '../../../src/acceptance/docker-runtime.js'
import type { AcceptanceHost } from '../../../src/acceptance/store.js'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { DeliveryEffects } from '../../../src/delivery/effects.js'
import type { EnvironmentResource, EnvironmentRuntime } from '../../../src/environment/runtime.js'
import { acceptanceFixture } from '../../support/acceptance.js'
import { environmentRecipe } from '../../support/environment.js'

const job: EnvironmentResource = {
  kind: 'container',
  slot: 'behavior-job',
  name: 'owned-job',
  token: 'fixture',
  status: 'intent',
  purpose: 'test',
  service: 'web',
}
describe('finite behavior admission', () => {
  it('reserves app/proxy capacity even during a restart and keeps unknown jobs charged', () => {
    const recipe = environmentRecipe('/fixture/app', 'Fixture code.')
    const record = { resources: [] } as unknown as EnvironmentRuntime
    expect(() => admitBehaviorJob(recipe, 40, record, job)).not.toThrow()
    recipe.limits.memoryMiB = 383
    expect(() => admitBehaviorJob(recipe, 40, record, job)).toThrow('behavior-capacity')
    recipe.limits.memoryMiB = 512
    record.resources.push({ ...job, slot: 'old', status: 'unknown' })
    expect(() => admitBehaviorJob(recipe, 40, record, { ...job, purpose: 'readiness' })).toThrow(
      'behavior-capacity',
    )
    record.resources[0] = { ...job, slot: 'old', status: 'exited' }
    expect(() =>
      admitBehaviorJob(recipe, 40, record, { ...job, purpose: 'readiness' }),
    ).not.toThrow()
    expect(() => admitBehaviorJob(recipe, 970, record, job)).toThrow('behavior-history-capacity')
  })
  it('charges CPU as well as memory', () => {
    const recipe = environmentRecipe('/fixture/app', 'Fixture code.')
    recipe.limits.cpus = 1.25
    expect(() =>
      admitBehaviorJob(recipe, 40, { resources: [] } as unknown as EnvironmentRuntime, job),
    ).toThrow('behavior-capacity')
  })
})

it('keeps the authority watch active through only its exact pending journaled test effect', () =>
  acceptanceFixture(async ({ acceptance, plan, boundary, host: observed }) => {
    const pinned = acceptance.prepare(plan)
    const effects = new DeliveryEffects(acceptance.planning.sources.files.root)
    effects.lifecycle.transition(plan.run, {
      to: 'queued',
      reason: 'Execute an explicitly authorized test effect.',
    })
    let pending: string | undefined
    const host: AcceptanceHost = {
      ...observed,
      pendingEffect: () => pending,
      async execute(test, context) {
        const effect = effects.prepare(plan.run, {
          key: 'acceptance-fixture',
          operation: 'test.run',
          repository: 'app',
          ref: 'wl/acceptance/fixture',
          expectedHead: acceptance.planning.getPlan(plan.run, 1).plan.repositories[0]?.base ?? '',
          inputDigest: pinned.digest,
        })
        pending = effect.intent.id
        const result = await effects.execute(plan.run, effect.intent.id, {
          eligible: () => ({ allowed: true, provenance: 'fixture', evidence: effect.digest }),
          invoke: async () => {
            await new Promise((resolve) => setTimeout(resolve, 400))
            expect(context.signal.aborted).toBe(false)
          },
          observe: async (intent) => ({
            available: true,
            value: {
              binding: contractDigest(intent),
              status: 'applied',
              evidence: effect.digest,
              provenance: 'fixture',
              invocationState: 'stopped',
              reason: 'observed',
              resource: { ref: intent.ref, revision: effect.digest },
            },
          }),
        })
        expect(result.status).toBe('applied')
        effects.lifecycle.transition(plan.run, {
          to: 'queued',
          reason: 'The exact fixture effect has been observed.',
        })
        pending = undefined
        return observed.execute(test, context)
      },
    }
    const result = await acceptance.executeCase(
      pinned.digest,
      'find-title',
      'effect',
      boundary,
      host,
    )
    expect(result.status).toBe('passed')
    expect(effects.inspect(plan.run)).toHaveLength(1)
  }))
