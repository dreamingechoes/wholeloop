import { readdirSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import * as segments from '../../../src/delivery/journal-segment.js'
import { type RunnerRequest, RunnerStore } from '../../../src/runner/store.js'
import { authorization, envelope, fixture } from '../../support/delivery.js'

const owner = 'controller-0123456789abcdef0123456789abcdef'
afterEach(() => vi.restoreAllMocks())
async function setup(
  run: (store: RunnerStore, request: RunnerRequest) => void,
  withinEnvelope = false,
) {
  await fixture(({ planning, plan }) => {
    const store = new RunnerStore(planning.sources.files.root)
    if (withinEnvelope) plan.envelope = planning.prepareEnvelope(envelope(plan)).digest
    const prepared = planning.preparePlan(plan),
      authorizationRequest = authorization(plan, prepared.digest)
    if (withinEnvelope)
      authorizationRequest.basis = { kind: 'envelope', digest: plan.envelope ?? '' }
    const grant = store.lifecycle.authority.authorize(authorizationRequest)
    store.lifecycle.track({ run: plan.run, revision: 1, grant: grant.grant.id })
    run(store, {
      schema: 'wholeloop/delivery-runner-request@1',
      key: 'first',
      run: plan.run,
      revision: 1,
      plan: prepared.digest,
      grant: grant.grant.id,
      host: { id: 'fixture', version: '1', configuration: 'a'.repeat(64) },
      pollMs: 50,
    })
  })
}
describe('private prepared foreground controller requests', () => {
  it('prepares idempotently and claims one current controller without starting a worker', async () => {
    await setup((store, request) => {
      const prepared = store.prepare(request)
      expect(store.prepare(request)).toEqual(prepared)
      const lease = store.claim(prepared.digest, owner)
      expect(store.current(lease)).toBe(true)
      expect(store.budgets.inspect(request.run).started).toBe(true)
      expect(store.inspect(prepared.digest)).toMatchObject({
        state: 'queued',
        ownership: 'active',
        outcome: null,
        nativeAcceptance: 'not-established-by-inspection',
      })
      expect(() => store.claim(prepared.digest, owner)).toThrow('runner-owner-conflict')
      expect(store.permittedStages(prepared.digest).map((s) => s.id)).toEqual(['plan'])
    })
  })
  it('uses one fresh journal observation per live poll and immediately sees pause or revocation', async () => {
    await setup((store, request) => {
      const prepared = store.prepare(request),
        reads = vi.spyOn(segments, 'readJournalSegment')
      let lease = store.claim(prepared.digest, owner)
      const live = (expected: boolean) => {
        const names = readdirSync(store.files.path('delivery/journal')).filter((name) =>
          name.endsWith('.ndjson'),
        )
        reads.mockClear()
        expect(store.live(lease, false)).toBe(expected)
        // Count actual selected leaves, independent of which public view the
        // poll requests. A metadata-only cache cannot conceal later control.
        expect(reads.mock.calls.map(([, , name]) => name).sort()).toEqual(names.sort())
      }
      live(true)
      store.lifecycle.transition(request.run, {
        to: 'waiting-external',
        reason: 'Observe the original issued effect without dispatching another stage.',
      })
      live(true)
      expect(store.current(lease, true, false)).toBe(false)
      store.control(prepared.digest, 'pause', 'Fixture Operator')
      live(false)
      store.release(lease, 'Release the observed paused fixture controller before resuming.')
      store.control(prepared.digest, 'resume', 'Fixture Operator')
      lease = store.claim(prepared.digest, owner)
      live(true)
      store.lifecycle.authority.revoke({
        schema: 'wholeloop/delivery-revocation-request@1',
        grant: request.grant,
        operator: 'Fixture Operator',
        reason: 'The next poll must observe the original grant revocation.',
      })
      live(false)
    })
  })
  it('refuses changed stable keys, revoked grants and tampered request bytes', async () => {
    await setup((store, request) => {
      const prepared = store.prepare(request)
      expect(() => store.prepare({ ...request, host: { ...request.host, version: '2' } })).toThrow(
        'runner-key-conflict',
      )
      store.lifecycle.authority.revoke({
        schema: 'wholeloop/delivery-revocation-request@1',
        grant: request.grant,
        operator: 'Fixture Operator',
        reason: 'Stop future controller admission.',
      })
      expect(() => store.claim(prepared.digest, owner)).toThrow('inactive-runner-basis')
      expect(store.inspect(prepared.digest).problems).toContain('unavailable-or-changed-basis')
      store.files.atomic(
        `delivery/runner-requests/${prepared.digest}.json`,
        JSON.stringify({ ...request, pollMs: 100 }),
      )
      expect(() => store.get(prepared.digest)).toThrow('damaged-runner-request')
    })
  })
  it('pauses the same run, fences future dispatch and retains the original deadline on resume', async () => {
    await setup((store, request) => {
      const prepared = store.prepare(request),
        lease = store.claim(prepared.digest, owner),
        deadline = store.budgets.inspect(request.run).deadline
      store.control(prepared.digest, 'pause', 'Fixture Operator')
      expect(store.current(lease)).toBe(false)
      expect(() =>
        store.append(lease, { action: 'dispatched', stage: 'plan', invocation: 'b'.repeat(64) }),
      ).toThrow('inactive-runner-lease')
      expect(() => store.control(prepared.digest, 'resume', 'Fixture Operator')).toThrow(
        'unresolved-runner-ownership',
      )
      store.release(lease, 'The original controller has released dispatch ownership.')
      expect(store.control(prepared.digest, 'resume', 'Fixture Operator').state).toBe('queued')
      expect(store.budgets.inspect(request.run).deadline).toBe(deadline)
      expect(store.claim(prepared.digest, owner).generation).toBe(2)
    })
  })
  it('continues one envelope-authorized run atomically without resetting its deadline or old stage history', async () => {
    await setup((store, request) => {
      const prepared = store.prepare(request),
        lease = store.claim(prepared.digest, owner),
        deadline = store.budgets.inspect(request.run).deadline
      store.append(lease, { action: 'dispatched', stage: 'plan', invocation: 'b'.repeat(64) })
      store.append(lease, {
        action: 'started',
        stage: 'plan',
        invocation: 'b'.repeat(64),
        runtime: { backend: 'fixture', instance: 'first', worker: 'original' },
      })
      store.append(lease, {
        action: 'observed',
        stage: 'plan',
        invocation: 'b'.repeat(64),
        status: 'passed',
        evidence: 'c'.repeat(64),
        provenance: 'fixture',
        reason: 'The original exact fixture stage completed.',
      })
      const next = structuredClone(store.planning.getPlan(request.run, 1).plan)
      next.revision = 2
      next.previous = request.plan
      const revision = store.planning.preparePlan(next)
      store.adopt(lease, { revision: 2, digest: revision.digest })
      expect(store.record(prepared.digest).basis).toBe(revision.digest)
      expect(store.current(lease)).toBe(true)
      expect(store.get(prepared.digest).plan).toBe(request.plan)
      expect(store.stage(prepared.digest, 'plan')).toBeUndefined()
      expect(store.record(prepared.digest).stages[0]?.basis).toBe(request.plan)
      expect(store.budgets.inspect(request.run).deadline).toBe(deadline)
      expect(store.permittedStages(prepared.digest).map((s) => s.id)).toEqual(['plan'])
    }, true)
  })
  it('refuses implicit derivation from an exact-plan grant', async () => {
    await setup((store, request) => {
      const prepared = store.prepare(request),
        lease = store.claim(prepared.digest, owner)
      expect(() => store.adopt(lease, { revision: 2, digest: 'c'.repeat(64) })).toThrow(
        'derived-plan-not-authorized',
      )
      expect(store.record(prepared.digest).basis).toBe(request.plan)
    })
  })
  it('does not resume an unknown issued stage or infer stopped from a stop request', async () => {
    await setup((store, request) => {
      const prepared = store.prepare(request),
        lease = store.claim(prepared.digest, owner)
      store.append(lease, { action: 'dispatched', stage: 'plan', invocation: 'b'.repeat(64) })
      expect(store.control(prepared.digest, 'stop', 'Fixture Operator').state).toBe('stopping')
      expect(store.inspect(prepared.digest).problems).toContain('unresolved-stage-invocation')
      expect(store.inspect(prepared.digest).ownership).toBe('active')
    })
  })
  it('retries a positively closed stage only in a new controller generation', async () => {
    await setup((store, request) => {
      const prepared = store.prepare(request),
        lease = store.claim(prepared.digest, owner)
      store.append(lease, { action: 'dispatched', stage: 'plan', invocation: 'b'.repeat(64) })
      store.append(lease, {
        action: 'observed',
        stage: 'plan',
        invocation: 'b'.repeat(64),
        status: 'not-started',
        evidence: 'c'.repeat(64),
        provenance: 'fixture',
        reason: 'The original fixed fixture observer confirmed no process was started.',
      })
      expect(store.permittedStages(prepared.digest)).toEqual([])
      store.control(prepared.digest, 'pause', 'Fixture Operator')
      store.release(lease, 'The original controller has stopped dispatching.')
      store.control(prepared.digest, 'resume', 'Fixture Operator')
      const next = store.claim(prepared.digest, owner)
      expect(next.generation).toBe(2)
      expect(store.permittedStages(prepared.digest).map((stage) => stage.id)).toEqual(['plan'])
      expect(() =>
        store.append(next, {
          action: 'dispatched',
          stage: 'plan',
          invocation: 'b'.repeat(64),
        }),
      ).toThrow('runner-stage-already-issued')
      store.append(next, { action: 'dispatched', stage: 'plan', invocation: 'd'.repeat(64) })
      expect(store.record(prepared.digest).stages).toHaveLength(2)
    })
  })
  it('refuses derived-plan adoption while an original stage remains uncertain', async () => {
    await setup((store, request) => {
      const prepared = store.prepare(request),
        lease = store.claim(prepared.digest, owner)
      store.append(lease, { action: 'dispatched', stage: 'definition', invocation: 'b'.repeat(64) })
      expect(() => store.adopt(lease, { revision: 2, digest: 'c'.repeat(64) })).toThrow(
        'derived-plan-unresolved-stage',
      )
      expect(store.record(prepared.digest).basis).toBe(request.plan)
    }, true)
  })
  it('recovers exact orphan request bytes regardless of JSON property order', async () => {
    await setup((store, request) => {
      const digest = contractDigest(request),
        reordered = Object.fromEntries(Object.entries(request).reverse()),
        path = `delivery/runner-requests/${digest}.json`,
        original = JSON.stringify(reordered, null, 2)
      store.files.atomic(path, original)
      expect(store.prepare(request).digest).toBe(digest)
      expect(store.files.read(path)).toBe(original)
    })
  })
})
