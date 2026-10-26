import { describe, expect, it, vi } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { DeliveryRunner, type DeliveryRunnerHost } from '../../../src/runner/engine.js'
import { type RunnerRequest, RunnerStore } from '../../../src/runner/store.js'
import { authorization, fixture } from '../../support/delivery.js'

async function setup(
  run: (store: RunnerStore, request: RunnerRequest, host: DeliveryRunnerHost) => Promise<void>,
  none = false,
) {
  await fixture(async ({ planning, plan }) => {
    // Exercise one complete application route here; route.test.ts covers multi-unit
    // dependency expansion without multiplying journal/Git setup in every lifecycle case.
    plan.work = plan.work
      .filter((work) => work.id === 'search')
      .map((work) => ({ ...work, after: [], consumes: [] }))
    plan.milestones = plan.milestones.map((milestone) => ({ ...milestone, work: ['search'] }))
    plan.policy.intervention = none ? 'none' : 'supervised'
    const store = new RunnerStore(planning.sources.files.root),
      prepared = planning.preparePlan(plan),
      grant = store.lifecycle.authority.authorize(authorization(plan, prepared.digest))
    store.lifecycle.track({ run: plan.run, revision: 1, grant: grant.grant.id })
    const request: RunnerRequest = {
      schema: 'wholeloop/delivery-runner-request@1',
      key: 'first',
      run: plan.run,
      revision: 1,
      plan: prepared.digest,
      grant: grant.grant.id,
      host: { id: 'fixture', version: '1', configuration: 'a'.repeat(64) },
      pollMs: 50,
    }
    const host: DeliveryRunnerHost = {
      identity: request.host,
      preflight: async () => ({
        available: false,
        interactive: 'disabled',
        humanRequired: false,
        reason: 'The actual native boundary has not been observed.',
      }),
      execute: async () => {
        throw new Error('No application or model should execute.')
      },
      inspect: async () => {
        throw new Error('No prior native invocation exists.')
      },
      endpoint: async () => {
        throw new Error('No endpoint has been observed.')
      },
    }
    await run(store, request, host)
  })
}
describe('foreground runner refusals preserve truthful execution state', () => {
  it('returns a released paused controller when a supervised runtime is unavailable', async () => {
    await setup(async (store, request, host) => {
      const prepared = store.prepare(request),
        runner = new DeliveryRunner(store)
      const result = await runner.run(prepared.digest, host)
      expect(result).toMatchObject({ state: 'paused', ownership: 'released', outcome: null })
      expect(result.stages).toEqual([])
      expect(store.lifecycle.journal.get(request.run).reason).toContain('runtime')
    })
  })
  it('terminates none with undelegated decisions without invoking even native preflight', async () => {
    await setup(async (store, request, host) => {
      let calls = 0
      host.preflight = async () => {
        calls++
        throw new Error('Must not be called.')
      }
      const prepared = store.prepare(request),
        result = await new DeliveryRunner(store).run(prepared.digest, host)
      expect(result).toMatchObject({ state: 'blocked', ownership: 'released', outcome: 'blocked' })
      expect(result.stages).toEqual([])
      expect(calls).toBe(0)
    }, true)
  })
  it('retains a complete fixture route and checkpoints without certifying native acceptance', async () => {
    await setup(async (store, request, host) => {
      host.preflight = async () => ({
        available: true,
        interactive: 'disabled',
        humanRequired: false,
        reason: 'The explicit synthetic controller protocol is available.',
      })
      host.execute = async (context) => {
        context.started({
          backend: 'fixture',
          instance: context.invocation,
          worker: context.stage.id,
        })
        return {
          schema: 'wholeloop/delivery-runner-stage-observation@1',
          plan: contractDigest(context.plan),
          request: contractDigest(context.request),
          stage: context.stage.id,
          invocation: context.invocation,
          status: 'passed',
          invocationState: 'stopped',
          evidence: 'c'.repeat(64),
          provenance: 'fixture',
          reason: 'The selected normalized fixture host observed its exact stage.',
        }
      }
      const prepared = store.prepare(request),
        result = await new DeliveryRunner(store).run(prepared.digest, host)
      expect(result).toMatchObject({ state: 'paused', ownership: 'released', outcome: null })
      expect(result.stages).toHaveLength(result.route.length)
      expect(result.stages.every((s) => s.status === 'passed' && s.provenance === 'fixture')).toBe(
        true,
      )
      expect(store.budgets.inspect(request.run).counters.artifactBytes).toBeGreaterThan(0)
      expect(
        store.recovery.checkpoints.inspect(request.run).map((c) => c.manifest.stage),
      ).toContain('integrated-candidate')
    })
  })
  it('cannot infer process start from a positive host envelope', async () => {
    await setup(async (store, request, host) => {
      host.preflight = async () => ({
        available: true,
        interactive: 'disabled',
        humanRequired: false,
        reason: 'The explicit synthetic protocol is available.',
      })
      host.execute = async (c) => ({
        schema: 'wholeloop/delivery-runner-stage-observation@1',
        plan: contractDigest(c.plan),
        request: contractDigest(c.request),
        stage: c.stage.id,
        invocation: c.invocation,
        status: 'passed',
        invocationState: 'stopped',
        evidence: 'c'.repeat(64),
        provenance: 'fixture',
        reason: 'An unregistered result must not establish execution.',
      })
      const prepared = store.prepare(request),
        result = await new DeliveryRunner(store).run(prepared.digest, host)
      expect(result).toMatchObject({ state: 'paused', ownership: 'released' })
      expect(result.stages[0]?.status).toBe('unknown')
    })
  })
  it('refuses a changed host configuration and never infers workers from metadata', async () => {
    await setup(async (store, request, host) => {
      const prepared = store.prepare(request)
      host.identity = { ...host.identity, configuration: 'b'.repeat(64) }
      await expect(new DeliveryRunner(store).run(prepared.digest, host)).rejects.toThrow(
        'runner-host-binding',
      )
      expect(store.inspect(prepared.digest)).toMatchObject({
        state: 'planned',
        ownership: 'unclaimed',
      })
    })
  })
  it('does not call a host when the original foreground invocation is already cancelled', async () => {
    await setup(async (store, request, host) => {
      const abort = new AbortController()
      abort.abort()
      host.preflight = async () => {
        throw new Error('Must not be called.')
      }
      const prepared = store.prepare(request),
        result = await new DeliveryRunner(store).run(prepared.digest, host, {
          signal: abort.signal,
        })
      expect(result).toMatchObject({ state: 'paused', ownership: 'released' })
      expect(store.lifecycle.journal.get(request.run).reason).toContain('already cancelled')
    })
  })
  it('rejects a foreign reserved lease before preflight or dispatch', async () => {
    await setup(async (store, request, host) => {
      const prepared = store.prepare(request)
      await expect(
        new DeliveryRunner(store).run(prepared.digest, host, {
          lease: {
            request: 'f'.repeat(64),
            controller: 'controller-0123456789abcdef0123456789abcdef',
            generation: 1,
          },
        }),
      ).rejects.toThrow('runner-lease-binding')
      expect(store.inspect(prepared.digest).ownership).toBe('unclaimed')
      expect(store.budgets.inspect(request.run).started).toBe(false)
    })
  })
  it('recovers a published result checkpoint after interruption without repeating its host call', async () => {
    await setup(async (store, request, host) => {
      const calls: string[] = []
      host.preflight = async () => ({
        available: true,
        interactive: 'disabled',
        humanRequired: false,
        reason: 'The selected fixture protocol is available.',
      })
      host.execute = async (context) => {
        calls.push(context.stage.id)
        context.started({
          backend: 'fixture',
          instance: context.invocation,
          worker: context.stage.id,
        })
        return {
          schema: 'wholeloop/delivery-runner-stage-observation@1',
          request: contractDigest(context.request),
          plan: contractDigest(context.plan),
          stage: context.stage.id,
          invocation: context.invocation,
          status: 'passed',
          invocationState: 'stopped',
          evidence: 'c'.repeat(64),
          provenance: 'fixture',
          reason: 'The exact fixture stage completed before checkpoint publication.',
        }
      }
      const prepared = store.prepare(request),
        runner = new DeliveryRunner(store),
        checkpoint = vi.spyOn(store.recovery.checkpoints, 'capture').mockImplementationOnce(() => {
          throw new Error('Injected interruption after the durable result event.')
        })
      await expect(runner.run(prepared.digest, host)).rejects.toThrow('Injected interruption')
      expect(store.stage(prepared.digest, 'plan')?.status).toBe('passed')
      expect(store.inspect(prepared.digest).ownership).toBe('released')
      checkpoint.mockRestore()
      const deadline = store.budgets.inspect(request.run).deadline,
        recovered = await runner.run(prepared.digest, host)
      expect(recovered.state).toBe('paused')
      expect(calls.filter((stage) => stage === 'plan')).toHaveLength(1)
      expect(
        store.recovery.checkpoints
          .inspect(request.run)
          .some((entry) => entry.manifest.stage === 'plan-accepted' && entry.status === 'current'),
      ).toBe(true)
      expect(store.budgets.inspect(request.run).deadline).toBe(deadline)
    })
  })
})
