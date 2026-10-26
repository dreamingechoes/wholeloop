import { describe, expect, it } from 'vitest'
import { DeliveryLifecycle } from '../../../src/delivery/lifecycle.js'
import { deliveryRunner, type RunnerPayload } from '../../../src/runner/events.js'
import { authorization, fixture } from '../../support/delivery.js'

const controller = 'controller-0123456789abcdef0123456789abcdef'
const request = 'b'.repeat(64),
  invocation = 'c'.repeat(64)
const runtime = { backend: 'fixture', instance: 'original', worker: 'observed-worker' }
async function prepared(
  run: (
    lifecycle: DeliveryLifecycle,
    append: (value: Partial<RunnerPayload>) => void,
    source: { run: string; basis: string },
  ) => void,
) {
  await fixture(({ planning, plan }) => {
    const lifecycle = new DeliveryLifecycle(planning.sources.files.root),
      prepared = planning.preparePlan(plan),
      grant = lifecycle.authority.authorize(authorization(plan, prepared.digest))
    lifecycle.track({ run: plan.run, revision: 1, grant: grant.grant.id })
    const append = (value: Partial<RunnerPayload>) =>
      lifecycle.append(plan.run, {
        schema: 'wholeloop/delivery-runner-event@1',
        basis: prepared.digest,
        request,
        action: 'prepared',
        ...value,
      })
    append({})
    lifecycle.transition(plan.run, {
      to: 'queued',
      reason: 'Run the original authorized fixture route.',
    })
    run(lifecycle, append, { run: plan.run, basis: prepared.digest })
  })
}
describe('replayed exact runner ownership and stage intent', () => {
  it('records intent before native start and preserves independent observations', async () => {
    await prepared((lifecycle, append, source) => {
      append({ action: 'claimed', controller, generation: 1 })
      append({ action: 'dispatched', controller, generation: 1, stage: 'plan', invocation })
      expect(deliveryRunner(lifecycle.journal.get(source.run)).records[0]?.stages[0]?.status).toBe(
        'prepared',
      )
      append({ action: 'started', controller, generation: 1, stage: 'plan', invocation, runtime })
      append({
        action: 'observed',
        controller,
        generation: 1,
        stage: 'plan',
        invocation,
        status: 'passed',
        evidence: 'd'.repeat(64),
        provenance: 'fixture',
        reason: 'The fixed fixture host observed its completed stage.',
      })
      append({
        action: 'released',
        controller,
        generation: 1,
        reason: 'The foreground fixture controller finished.',
      })
      const state = lifecycle.journal.get(source.run)
      expect(deliveryRunner(state).records[0]?.stages[0]).toMatchObject({
        status: 'passed',
        runtime,
        provenance: 'fixture',
      })
      expect(state.state).toBe('queued')
      expect(state.outcome).toBeUndefined()
    })
  })
  it('refuses a second active owner, repeated dispatch and stale generation', async () => {
    await prepared((_lifecycle, append) => {
      append({ action: 'claimed', controller, generation: 1 })
      expect(() => append({ action: 'claimed', controller, generation: 2 })).toThrow(
        'runner-owner-conflict',
      )
      append({ action: 'dispatched', controller, generation: 1, stage: 'plan', invocation })
      expect(() =>
        append({ action: 'dispatched', controller, generation: 1, stage: 'plan', invocation }),
      ).toThrow('runner-stage-already-issued')
      expect(() =>
        append({
          action: 'started',
          controller,
          generation: 2,
          stage: 'plan',
          invocation,
          runtime,
        }),
      ).toThrow('runner-stale-controller')
    })
  })
  it('retains unknown ownership until a trusted positive stopped observation', async () => {
    await prepared((lifecycle, append, source) => {
      append({ action: 'claimed', controller, generation: 1 })
      append({
        action: 'recovered',
        controller,
        generation: 1,
        status: 'unknown',
        evidence: 'd'.repeat(64),
        provenance: 'fixture',
        reason: 'No original native ownership could be observed.',
      })
      expect(() => append({ action: 'claimed', controller, generation: 2 })).toThrow(
        'runner-owner-conflict',
      )
      append({
        action: 'recovered',
        controller,
        generation: 1,
        status: 'stopped',
        evidence: 'e'.repeat(64),
        provenance: 'fixture',
        reason: 'The exact original fixture controller is positively stopped.',
      })
      append({ action: 'claimed', controller, generation: 2 })
      expect(deliveryRunner(lifecycle.journal.get(source.run)).records[0]?.generation).toBe(2)
    })
  })
  it('cannot pass an unstarted process and retains uncertain invocation without redispatch', async () => {
    await prepared((_lifecycle, append) => {
      append({ action: 'claimed', controller, generation: 1 })
      append({ action: 'dispatched', controller, generation: 1, stage: 'plan', invocation })
      expect(() =>
        append({
          action: 'observed',
          controller,
          generation: 1,
          stage: 'plan',
          invocation,
          status: 'passed',
          evidence: 'd'.repeat(64),
          provenance: 'fixture',
          reason: 'Invented completion.',
        }),
      ).toThrow('runner-stage-late-result')
      append({
        action: 'observed',
        controller,
        generation: 1,
        stage: 'plan',
        invocation,
        status: 'unknown',
        evidence: 'd'.repeat(64),
        provenance: 'fixture',
        reason: 'The fixed host cannot establish original completion.',
      })
      expect(() =>
        append({ action: 'dispatched', controller, generation: 1, stage: 'plan', invocation }),
      ).toThrow('runner-stage-already-issued')
    })
  })
})
