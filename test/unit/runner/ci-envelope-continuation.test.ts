import { expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { DeliveryJournalError } from '../../../src/delivery/events.js'
import { continueCiDelivery } from '../../../src/runner/ci-continuation.js'
import { envelopeContinuation } from '../../../src/runner/engine.js'
import { deliveryRunner } from '../../../src/runner/events.js'
import type { RunnerRequest, RunnerStore } from '../../../src/runner/store.js'
import { runnerCiFailureFixture } from '../../support/runner-ci.js'

/** End the original run the way the controller does after its failed CI stage. */
function failed(store: RunnerStore, request: Readonly<RunnerRequest>) {
  const owner = store.record(contractDigest(request))
  if (!owner.controller) throw new Error('Original fixture controller required')
  store.release(
    { request: owner.request, controller: owner.controller, generation: owner.generation },
    'Release the original run after its failed required check.',
  )
  store.lifecycle.transition(request.run, {
    to: 'failed',
    outcome: 'failed',
    reason: 'A required check failed on the published head.',
  })
}

it('continues a none run after a repairable CI failure under its own envelope grant', async () => {
  await runnerCiFailureFixture(
    ({ store, request, input }) => {
      failed(store, request)
      const next = envelopeContinuation(store, input.request)
      if (!next) throw new Error('An unattended CI continuation was expected')
      const successor = store.get(next),
        state = store.lifecycle.journal.view(request.run),
        plan = store.planning.getPlan(request.run, 2)
      // The same envelope grant, a new plan revision with one CI correction, no operator.
      expect(successor).toMatchObject({ run: request.run, revision: 2, grant: request.grant })
      expect(successor.key).toContain('-ci-repair-2')
      expect(plan.plan.corrections).toEqual([
        expect.objectContaining({ origin: 'ci', stage: 'ci', unit: 'search', revision: 2 }),
      ])
      expect(state.grant?.id).toBe(request.grant)
      expect(deliveryRunner(state).continuations?.at(-1)).toMatchObject({
        revision: 2,
        stage: 'ci',
        request: input.request,
        failure: input.failure,
      })
      const receipt = JSON.parse(
        store.files.read(`delivery/continuations/${request.run}/2.json`) ?? '{}',
      )
      expect(receipt).toMatchObject({
        schema: 'wholeloop/delivery-ci-continuation@1',
        authority: 'envelope-grant-continuation',
        operator: 'wholeloop controller',
      })
    },
    {},
    'failure',
    { unattended: true },
  )
})

it('keeps an operator CI proposal off the envelope grant', async () => {
  await runnerCiFailureFixture(
    ({ store, request, input }) => {
      failed(store, request)
      // An operator's recorded proposal carries no controller mark: the envelope
      // grant cannot start it, even with every effect the CI correction needs.
      const recorded = continueCiDelivery(
        store.lifecycle,
        request.run,
        { request: input.request, unit: 'search' },
        { operator: 'Fixture Operator', reason: 'Record a CI correction proposal.' },
      )
      if (!recorded.accepted) throw new Error('Recorded proposal required')
      expect(recorded.record.authority).toBe('new-exact-plan-grant-required')
      let error: unknown
      try {
        store.lifecycle.track({ run: request.run, revision: 2, grant: request.grant })
      } catch (caught) {
        error = caught
      }
      expect(error).toBeInstanceOf(DeliveryJournalError)
      expect((error as DeliveryJournalError).message).toContain('continuation-requires-new-grant')
    },
    {},
    'failure',
    { unattended: true },
  )
})

it.each([
  { name: 'a supervised run', conclusion: 'failure' as const, options: {} },
  {
    name: 'a blocked classification',
    conclusion: 'cancelled' as const,
    options: { unattended: true },
  },
  {
    name: 'an exhausted push budget',
    conclusion: 'failure' as const,
    options: { unattended: true, ciPushes: 1 },
  },
])('ends with the request instead of continuing for $name', async ({ conclusion, options }) => {
  await runnerCiFailureFixture(
    ({ store, request, input }) => {
      failed(store, request)
      const before = store.lifecycle.journal.events().length
      expect(envelopeContinuation(store, input.request)).toBeUndefined()
      expect(store.lifecycle.journal.events()).toHaveLength(before)
      expect(store.files.read(`delivery/continuations/${request.run}/2.json`)).toBeUndefined()
    },
    {},
    conclusion,
    options,
  )
})
