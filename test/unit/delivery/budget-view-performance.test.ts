import { describe, expect, it, vi } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import type { DeliveryGrant } from '../../../src/delivery/authority.js'
import { type BudgetClock, findBudget } from '../../../src/delivery/budget-events.js'
import {
  budgetClockPayload,
  effectiveBudget,
  effectiveBudgetView,
  prepareBudgetAdmission,
} from '../../../src/delivery/budget-policy.js'
import type { EffectsFacet } from '../../../src/delivery/effect-events.js'
import {
  type DeliveryEvent,
  type DeliveryPayload,
  deliveryEvent,
} from '../../../src/delivery/events.js'
import { DEFAULT_DELIVERY_BUDGETS } from '../../../src/delivery/plan.js'
import { replayDelivery } from '../../../src/delivery/reducer.js'

const at = '2026-11-06T00:00:00.000Z',
  run = 'delivery-0000000000000000',
  basis = 'a'.repeat(64),
  clock: BudgetClock = { wall: at, monotonicMs: 0, epoch: 'fixture' }
// Synthetic policy data exercises arithmetic/ownership, not a live authority receipt.
const grant: DeliveryGrant = {
  schema: 'wholeloop/delivery-grant@1',
  id: 'authorization-0000000000000000',
  operator: 'Fixture Operator',
  basis: { kind: 'plan', digest: basis, run, revision: 1 },
  effects: ['source.read', 'report.write'],
  decisions: [],
  repositories: [{ repository: 'app', topicPrefix: 'wl/' }],
  reads: [],
  effectLimit: 20,
  requestDigest: 'e'.repeat(64),
  issuedAt: at,
  expiresAt: '2026-11-06T04:00:00.000Z',
  source: 'b'.repeat(64),
  owner: 'Fixture Owner',
  policy: {
    endpoint: 'local-handoff',
    intervention: 'supervised',
    uncertainty: 'investigate',
    delegations: [],
  },
  budgets: DEFAULT_DELIVERY_BUDGETS,
  provenance: 'operator-control',
}
function fixture(count: number) {
  const events: DeliveryEvent[] = [],
    append = (payload: DeliveryPayload) =>
      events.push(
        deliveryEvent(run, { kind: 'controller', name: 'Fixture' }, payload, events.at(-1), at),
      )
  append({
    schema: 'wholeloop/delivery-registration-event@1',
    basis: { kind: 'plan', digest: basis, revision: 1 },
    source: grant.source,
    policy: {
      digest: contractDigest(grant.policy),
      endpoint: 'local-handoff',
      intervention: 'supervised',
    },
    units: [{ id: 'search', role: 'implementation', repository: 'app' }],
  })
  append({
    schema: 'wholeloop/delivery-grant-event@1',
    id: grant.id,
    digest: contractDigest(grant),
    basis,
    status: 'active',
  })
  append({
    schema: 'wholeloop/delivery-budget-event@1',
    basis,
    action: 'started',
    grantDigest: contractDigest(grant),
    startedAt: at,
    deadline: grant.expiresAt,
    clock,
    limits: DEFAULT_DELIVERY_BUDGETS,
  })
  for (let index = 0; index < count; index++) {
    const id = `attempt-${index.toString(16).padStart(16, '0')}`
    append({
      schema: 'wholeloop/delivery-budget-event@1',
      basis,
      action: 'reserved',
      reservation: {
        id,
        kind: 'attempt',
        unit: 'search',
        role: 'builder',
        generation: index + 1,
        deadline: '2026-11-06T00:30:00.000Z',
        clock,
        metering: {
          hardTokens: true,
          hardCurrency: false,
          tokensMaximum: 1000000,
          meter: 'fixture',
          evidence: 'f'.repeat(64),
          provenance: 'fixture',
        },
      },
    })
    append({
      schema: 'wholeloop/delivery-budget-event@1',
      basis,
      action: 'usage',
      usage: {
        key: `report-${index}`,
        reservation: id,
        meter: 'fixture',
        mode: 'delta',
        tokens: index + 1,
        final: true,
        evidence: 'e'.repeat(64),
        provenance: 'fixture',
      },
    })
  }
  const state = replayDelivery(events).get(run)
  if (!state) throw new Error('Missing budget fixture')
  const facet = findBudget(state)
  if (!facet) throw new Error('Missing budget facet')
  return { state, facet }
}

function preparedEffects(count: number): EffectsFacet {
  return {
    schema: 'wholeloop/delivery-effects@1',
    records: Array.from({ length: count }, (_, index) => ({
      intent: {
        schema: 'wholeloop/delivery-effect-intent@1',
        id: `effect-${index.toString(16).padStart(32, '0')}`,
        key: `effect-${index}`,
        run,
        basis,
        grant: grant.id,
        grantDigest: contractDigest(grant),
        operation: 'report.write',
        ref: `fixture/report-${index}`,
        inputDigest: 'e'.repeat(64),
      },
      digest: 'd'.repeat(64),
      status: 'prepared',
      sequence: index + 1,
      observations: [],
    })),
  }
}

describe('current-call budget policy views', () => {
  it.each([100, 400])(
    'does not inspect %i irrelevant prepared effects for advisory admission',
    (count) => {
      const { state, facet } = fixture(count),
        effects = preparedEffects(count)
      state.facets.push(effects)
      let fields = 0
      for (const record of effects.records) {
        Object.defineProperty(record, 'invocation', {
          get() {
            fields++
            return undefined
          },
        })
        Object.defineProperty(record.intent, 'operation', {
          get() {
            fields++
            return 'report.write'
          },
        })
      }
      for (const reservation of facet.reservations) {
        const id = reservation.id
        Object.defineProperty(reservation, 'id', {
          get() {
            fields++
            return id
          },
        })
      }
      expect(
        prepareBudgetAdmission(state, grant, clock, {
          id: 'attempt-ffffffffffffffff',
          kind: 'attempt',
          role: 'builder',
          generation: 1,
        }).problem,
      ).toBeNull()
      console.info('Unneeded admission history fields:', JSON.stringify({ count, fields }))
      expect(fields).toBe(0)
    },
  )
  it('keeps legacy start fallback and required hard-meter/push history checks', () => {
    const { state, facet } = fixture(0),
      effects = preparedEffects(1),
      first = effects.records[0]
    if (!first) throw new Error('Missing prepared policy effect')
    state.facets.push(effects)
    const later = { ...clock, wall: '2026-11-06T00:01:00.000Z', monotonicMs: 60000 }
    delete facet.startedAt
    expect(effectiveBudgetView(state, grant, later).startedAt).toBe(later.wall)
    first.invocation = 'f'.repeat(64)
    expect(effectiveBudgetView(state, grant, later).startedAt).toBe(state.registeredAt)
    facet.requirements.tokens = { mode: 'hard', limit: 1000 }
    expect(
      prepareBudgetAdmission(state, grant, clock, {
        id: 'attempt-ffffffffffffffff',
        kind: 'attempt',
      }).problem,
    ).toBe('unmetered-hard-limit')
    facet.requirements = {}
    first.intent.operation = 'git.push'
    expect(
      prepareBudgetAdmission(
        state,
        grant,
        clock,
        {
          id: 'attempt-ffffffffffffffff',
          kind: 'effect',
          operation: 'git.push',
        },
        { ...grant.budgets, ciPushes: 1 },
      ).problem,
    ).toBe('ci-push-limit')
  })
  it.each([100, 400])(
    'does not clone %i historical reports for clock/admission scalars',
    (count) => {
      const { state, facet } = fixture(count),
        before = structuredClone(state)
      let reads = 0
      for (const entry of facet.usage) {
        const tokens = entry.tokens
        Object.defineProperty(entry, 'tokens', {
          enumerable: true,
          configurable: true,
          get() {
            reads++
            return tokens
          },
        })
      }
      const clone = vi.spyOn(globalThis, 'structuredClone')
      let copies: number, fields: number
      try {
        expect(budgetClockPayload(state, grant, clock).action).toBe('clock')
        expect(
          prepareBudgetAdmission(state, grant, clock, {
            id: 'attempt-ffffffffffffffff',
            kind: 'attempt',
            unit: 'search',
            role: 'builder',
            generation: 1,
          }).problem,
        ).toBeNull()
        copies = clone.mock.calls.filter(
          ([value]) => (value as { schema?: unknown })?.schema === 'wholeloop/delivery-budget@1',
        ).length
        fields = reads
      } finally {
        clone.mockRestore()
      }
      console.info('Unused budget history copies:', JSON.stringify({ count, copies, fields }))
      expect(copies).toBe(0)
      expect(fields).toBe(0)
      expect(state).toEqual(before)
    },
  )
  it('preserves independent mutable public snapshots and their limit identity', () => {
    const { state, facet } = fixture(2),
      before = structuredClone(state),
      result = effectiveBudget(state, grant, clock),
      first = result.facet.usage[0]
    if (!first) throw new Error('Missing computed usage')
    first.tokens = 999
    result.facet.reservations.length = 0
    result.limits.builders = 99
    expect(result.facet.limits).toBe(result.limits)
    expect(state).toEqual(before)
    expect(facet.usage[0]?.tokens).toBe(1)
  })
  it('borrows only nested history and recomputes current clock and narrowed limits', () => {
    const { state, facet } = fixture(2),
      before = structuredClone(state),
      view = effectiveBudgetView(state, grant, clock),
      laterClock = { ...clock, wall: '2026-11-06T00:00:01.000Z', monotonicMs: 1000 },
      later = effectiveBudgetView(state, grant, laterClock, {
        ...grant.budgets,
        builders: 1,
      })
    expect(view).toEqual(effectiveBudget(state, grant, clock))
    expect(view.facet).not.toBe(facet)
    expect(view.facet.usage).toBe(facet.usage)
    expect(view.facet.reservations).toBe(facet.reservations)
    expect(view.facet.requirements).toBe(facet.requirements)
    expect(later.facet).not.toBe(view.facet)
    expect(later.facet.elapsedMs).toBe(1000)
    expect(later.limits.builders).toBe(1)
    expect(view.facet.elapsedMs).toBe(0)
    expect(view.facet.limits).toBe(view.limits)
    expect(state).toEqual(before)
  })
  it('computes admission limits once while formatting the accepted clock payload', () => {
    const { state } = fixture(0),
      budgets = { ...grant.budgets }
    let reads = 0
    for (const key of Object.keys(budgets) as (keyof typeof budgets)[]) {
      const value = budgets[key]
      Object.defineProperty(budgets, key, {
        enumerable: true,
        get() {
          reads++
          return value
        },
      })
    }
    const result = prepareBudgetAdmission(state, { ...grant, budgets }, clock, {
      id: 'attempt-ffffffffffffffff',
      kind: 'attempt',
    })
    expect(result.problem).toBeNull()
    expect(result.payloads.map((entry) => entry.action)).toEqual(['clock', 'reserved'])
    expect(reads).toBe(Object.keys(budgets).length)
    console.info('Admission limit reads:', reads)
  })
})
