import { describe, expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { DeliveryRunner, type DeliveryRunnerHost } from '../../../src/runner/engine.js'
import { type RunnerRequest, RunnerStore } from '../../../src/runner/store.js'
import { authorization, fixture } from '../../support/delivery.js'

const owner = 'controller-0123456789abcdef0123456789abcdef',
  invocation = 'b'.repeat(64)
async function setup(
  run: (store: RunnerStore, digest: string, host: DeliveryRunnerHost) => Promise<void>,
) {
  await fixture(async ({ planning, plan }) => {
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
    const record = store.prepare(request),
      lease = store.claim(record.digest, owner)
    store.append(lease, { action: 'dispatched', stage: 'plan', invocation })
    store.append(lease, {
      action: 'started',
      stage: 'plan',
      invocation,
      runtime: { backend: 'fixture', instance: 'original', worker: 'original' },
    })
    store.append(lease, {
      action: 'observed',
      stage: 'plan',
      invocation,
      status: 'unknown',
      evidence: 'c'.repeat(64),
      provenance: 'fixture',
      reason: 'The foreground fixture lost its native response.',
    })
    store.release(lease, 'The original foreground process has stopped issuing work.')
    const host: DeliveryRunnerHost = {
      identity: request.host,
      preflight: async () => {
        throw new Error('Read-only recovery never performs execution preflight.')
      },
      execute: async () => {
        throw new Error('Read-only recovery must not execute a stage.')
      },
      endpoint: async () => {
        throw new Error('Recovery grants no endpoint completion.')
      },
      inspect: async (_request, stage) => ({
        schema: 'wholeloop/delivery-runner-stage-observation@1',
        request: record.digest,
        plan: stage.basis,
        stage: stage.id,
        invocation: stage.invocation,
        status: 'stopped',
        invocationState: 'stopped',
        evidence: 'd'.repeat(64),
        provenance: 'fixture',
        reason: 'The fixed fixture observer positively observed the original group closed.',
      }),
    }
    expect(contractDigest(request)).toBe(record.digest)
    await run(store, record.digest, host)
  })
}
describe('read-only original stage reconciliation', () => {
  it('records an issued stage closure after the controller released without starting a new invocation', async () => {
    await setup(async (store, digest, host) => {
      const result = await new DeliveryRunner(store).reconcile(digest, host)
      expect(result.recoveryProblems).toEqual([])
      expect(store.stage(digest, 'plan')?.status).toBe('stopped')
      expect(result.outcome).toBeNull()
      expect(result.ownership).toBe('released')
    })
  })
  it('keeps malformed and foreign host readback uncertain', async () => {
    await setup(async (store, digest, host) => {
      const inspect = host.inspect
      host.inspect = async (r, s, signal) => ({
        ...(await inspect(r, s, signal)),
        invocation: 'e'.repeat(64),
      })
      const result = await new DeliveryRunner(store).reconcile(digest, host)
      expect(store.stage(digest, 'plan')?.status).toBe('unknown')
      expect(result.problems).toContain('unresolved-stage-invocation')
    })
  })
  it('confirms stop only after exact closure and without unresolved domain reservations', async () => {
    await setup(async (store, digest, host) => {
      store.control(digest, 'stop', 'Fixture Operator')
      const result = await new DeliveryRunner(store).reconcile(digest, host, { cancel: true })
      expect(result.state).toBe('stopped')
      expect(result.outcome).toBe('stopped')
      expect(result.stages).toHaveLength(1)
    })
  })
})
