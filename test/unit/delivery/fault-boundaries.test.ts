import { describe, expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { DeliveryCheckpoints } from '../../../src/delivery/checkpoints.js'
import { DeliveryEffects } from '../../../src/delivery/effects.js'
import { DeliveryQueue } from '../../../src/delivery/queue.js'
import { authorization, fixture } from '../../support/delivery.js'
import {
  EXPECTED,
  effectBoundary,
  FAULT_BOUNDARIES,
  FAULT_OPERATIONS,
} from '../../support/faults.js'

describe('effect boundary faults (EVAL-04, RUN-03)', () => {
  it.each(
    FAULT_OPERATIONS.flatMap((operation) =>
      FAULT_BOUNDARIES.map((boundary) => [operation, boundary] as const),
    ),
  )('%s survives %s with no duplicate effect', async (operation, boundary) => {
    const result = await effectBoundary(operation, boundary)
    expect(result).toMatchObject({ ...EXPECTED[boundary], journalStableOnReplay: true })
    expect(result.writes).toBeLessThanOrEqual(1)
    // An issued effect is never issued again; a refused one stays refused while its
    // denial or revocation holds.
    expect(result.secondIssueRefused).toBe(true)
  })
})

describe('stale workers, unrelated runs and checkpoints (EVAL-05, RUN-04)', () => {
  const owner = 'controller-0123456789abcdef0123456789abcdef',
    runtime = { backend: 'fixture', instance: 'fixture-instance', worker: 'fixture-worker' }
  it('refuses completion and effects from a fenced worker and leaves another run unchanged', () =>
    fixture(async ({ planning, plan }) => {
      const store = planning.sources.files.root,
        queue = new DeliveryQueue(store),
        prepared = planning.preparePlan(plan),
        grant = queue.lifecycle.authority.authorize(authorization(plan, prepared.digest))
      queue.lifecycle.track({ run: plan.run, revision: 1, grant: grant.grant.id })
      const other = { ...plan, run: 'delivery-fedcba9876543210' },
        otherPrepared = planning.preparePlan(other),
        otherGrant = queue.lifecycle.authority.authorize({
          ...authorization(other, otherPrepared.digest),
          id: 'authorization-fedcba9876543210',
        })
      queue.lifecycle.track({ run: other.run, revision: 1, grant: otherGrant.grant.id })
      const unrelated = contractDigest(
        queue.lifecycle.journal.events().filter((event) => event.run === other.run),
      )
      queue.enqueue(plan.run, { unit: 'contract' })
      const receipt = queue.claim(owner, () => ({
        ready: true,
        provenance: 'fixture',
        evidence: 'a'.repeat(64),
      }))
      const stale = receipt.assignment
      if (!stale) throw new Error(JSON.stringify(receipt.deferred))
      queue.start(stale, runtime)
      // The controller stops and fences the worker; its late completion must not land.
      queue.finish(stale, 'stopped', 'd'.repeat(64))
      queue.fence(stale)
      expect(() => queue.finish(stale, 'completed', 'b'.repeat(64))).toThrow()
      const effects = new DeliveryEffects(store)
      expect(() =>
        effects.prepare(plan.run, {
          key: 'stale-commit',
          operation: 'git.commit',
          repository: 'app',
          ref: 'wl/contract',
          expectedHead: plan.repositories[0]?.base ?? '',
          inputDigest: 'c'.repeat(64),
          attempt: { id: stale.attempt, generation: stale.generation },
        }),
      ).toThrow('stale-effect-attempt')
      expect(
        contractDigest(queue.lifecycle.journal.events().filter((event) => event.run === other.run)),
      ).toBe(unrelated)
    }))
  it('captures a checkpoint once across a restart', () =>
    fixture(({ planning, plan }) => {
      const store = planning.sources.files.root
      planning.preparePlan(plan)
      const checkpoints = new DeliveryCheckpoints(store)
      checkpoints.lifecycle.track({ run: plan.run, revision: 1 })
      const request = {
        schema: 'wholeloop/delivery-checkpoint-request@1',
        key: 'fault-checkpoint',
        stage: 'plan-accepted',
        inputs: [`delivery/plans/${plan.run}/1.json`],
      }
      const first = checkpoints.capture(plan.run, request),
        before = contractDigest(checkpoints.lifecycle.journal.events()),
        again = new DeliveryCheckpoints(store).capture(plan.run, request)
      expect(again).toEqual(first)
      expect(contractDigest(checkpoints.lifecycle.journal.events())).toBe(before)
    }))
})
