import { describe, expect, it } from 'vitest'
import { findBudget } from '../../../src/delivery/budget-events.js'
import { deliveryAttempts } from '../../../src/delivery/reducer.js'
import { nativeDecisionFixture as setup } from '../../support/native-decisions.js'

describe('native independent delegated decisions', () => {
  it.each(['claude', 'codex'])(
    'runs independent actual %s fixture processes with honest authority',
    async (target) => {
      await setup(
        async ({ host, decisions, request, purposes }) => {
          const result = await decisions.decide(request, host)
          expect(result.record).toMatchObject({
            status: 'fixture-only',
            actorKind: 'machine',
            humanApproval: 'not-recorded',
            effects: 'not-granted',
            judgment: { outcome: 'accept', identity: { role: 'planner', provenance: 'fixture' } },
            challenge: {
              verdict: 'supported',
              identity: { role: 'challenger', provenance: 'fixture' },
            },
          })
          const { judgment, challenge } = result.record
          expect(judgment.identity.invocation).not.toBe(challenge.identity.invocation)
          expect(judgment.identity.worker).not.toBe(challenge.identity.worker)
          expect(host.current(judgment.identity, result.record.basis)).toBe(true)
          expect(
            host.current(
              { ...judgment.identity, provenance: 'host-observed' },
              result.record.basis,
            ),
          ).toBe(false)
          const state = purposes.queue.lifecycle.journal.get(request.run)
          expect(deliveryAttempts(state).records.map((item) => item.role)).toEqual([
            'planner',
            'challenger',
          ])
          expect(findBudget(state)?.reservations).toHaveLength(2)
          expect(await decisions.decide(request, host)).toEqual(result)
          expect(
            findBudget(purposes.queue.lifecycle.journal.get(request.run))?.reservations,
          ).toHaveLength(2)
        },
        'valid',
        target,
      )
    },
  )
  it.each([
    'wrong-basis',
    'wrong-judgment',
    'forged-identity',
    'unknown-outer',
    'outcome',
  ] as const)('rejects %s claims without synthesizing a decision', async (mode) => {
    await setup(async ({ host, decisions, request }) => {
      await expect(decisions.decide(request, host)).rejects.toThrow(
        mode === 'forged-identity'
          ? 'native-decision-claim'
          : mode === 'unknown-outer'
            ? 'native-decision-not-completed'
            : 'native-decision-binding',
      )
      await expect(decisions.decide(request, host)).rejects.toThrow('unknown-prior-decision')
    }, mode)
  })
  it('keeps independent rejection and unresolved facts blocking acceptance', async () => {
    await setup(async ({ host, decisions, request }) => {
      expect((await decisions.decide(request, host)).record.status).toBe('blocked')
    }, 'rejected')
    await setup(async ({ host, decisions, request }) => {
      const record = (await decisions.decide(request, host)).record
      expect(record.status).toBe('blocked')
      expect(record.judgment.uncertainties[0]?.id).toBe('baseline')
      expect(record.challenge.uncertainties[0]?.id).toBe('baseline')
    }, 'unknowns')
  })
  it('invalidates actual completed identities after authority revocation', async () => {
    await setup(async ({ host, decisions, request, purposes }) => {
      const result = await decisions.decide(request, host)
      purposes.queue.lifecycle.authority.revoke({
        schema: 'wholeloop/delivery-revocation-request@1',
        grant: request.grant,
        operator: 'Fixture Operator',
        reason: 'Revoke the original decision scope.',
      })
      expect(host.current(result.record.judgment.identity, result.record.basis)).toBe(false)
    })
  })
  it('invalidates completed identities when private captured report bytes change', async () => {
    await setup(async ({ host, decisions, request, purposes }) => {
      const result = await decisions.decide(request, host)
      const state = purposes.queue.lifecycle.journal.get(request.run)
      const artifact = findBudget(state)?.artifacts[0]
      expect(artifact).toBeDefined()
      if (!artifact) throw new Error('Fixture requires a captured native report')
      purposes.queue.lifecycle.journal.files.atomic(artifact.ref, 'Changed report bytes.')
      expect(host.current(result.record.judgment.identity, result.record.basis)).toBe(false)
    })
  })
  it('does not invoke a native worker when trusted evidence prerequisites require a human', async () => {
    await setup(async ({ host, decisions, request, purposes }) => {
      host.evidence.prerequisites = () => ({
        supported: true,
        humanRequired: true,
        interactive: 'disabled',
      })
      await expect(decisions.decide(request, host)).rejects.toThrow(
        'non-delegable-or-unavailable-prerequisite',
      )
      expect(
        deliveryAttempts(purposes.queue.lifecycle.journal.get(request.run)).records,
      ).toHaveLength(0)
    })
  })
})
