// Issues external effects at most once; a lost response is observed, never invoked again.
import { randomBytes } from 'node:crypto'
import { contractDigest } from '../contracts/compatibility.js'
import type { DeliveryGrant } from './authority.js'
import type { BudgetClock, BudgetMetering } from './budget-events.js'
import {
  currentBudgetReservation,
  deliveryBudgetClock,
  prepareBudgetAdmission,
} from './budget-policy.js'
import {
  deliveryEffects,
  type EffectIntent,
  type EffectObservation,
  type EffectRecord,
} from './effect-events.js'
import { DeliveryJournalError, type DeliveryProjection } from './events.js'
import { DeliveryLifecycle } from './lifecycle.js'
import { observePlanBases, validateDeliveryShape } from './plan.js'
import {
  boundedRecoveryCall,
  type RecoveryClock,
  type RecoveryRead,
  recoveryRead,
} from './read-retry.js'
import { deliveryAttempts } from './reducer.js'
import eventSchema from './schemas/effect-event-v1.json' with { type: 'json' }
import intentSchema from './schemas/effect-intent-v1.json' with { type: 'json' }

export interface EffectHost {
  eligible(intent: Readonly<EffectIntent>): {
    allowed: boolean
    provenance: 'fixture' | 'host-observed'
    evidence: string
    metering?: BudgetMetering
  }
  invoke(intent: Readonly<EffectIntent>, invocation: string, signal: AbortSignal): Promise<void>
  observe(
    intent: Readonly<EffectIntent>,
    invocation: string,
    signal: AbortSignal,
  ): Promise<RecoveryRead<EffectObservation>>
}
export interface EffectRequest {
  key: string
  operation: EffectIntent['operation']
  repository?: string
  ref: string
  expectedHead?: string
  inputDigest: string
  attempt?: NonNullable<EffectIntent['attempt']>
}
const ACTOR = { kind: 'controller', name: 'wholeloop' } as const
export class DeliveryEffects {
  readonly lifecycle: DeliveryLifecycle
  readonly budgetClock: () => BudgetClock
  constructor(store?: string, now?: () => string, clock?: () => BudgetClock) {
    this.lifecycle = new DeliveryLifecycle(store, now)
    this.budgetClock = clock ?? (() => deliveryBudgetClock(this.lifecycle.journal.now))
  }

  prepare(run: string, request: EffectRequest): EffectRecord {
    let id = ''
    this.lifecycle.journal.transaction(ACTOR, (view, append) => {
      const state = this.state(view(), run)
      const grant = this.grant(state)
      id = `effect-${contractDigest({ run, basis: state.basis.digest, key: request.key }).slice(0, 32)}`
      const intent: EffectIntent = {
        ...structuredClone(request),
        schema: 'wholeloop/delivery-effect-intent@1',
        id,
        run,
        basis: state.basis.digest,
        grant: grant.id,
        grantDigest: state.grant?.digest ?? '',
      }
      validateDeliveryShape(intent, intentSchema)
      this.scope(state, intent, grant)
      const prior = deliveryEffects(state).records.find((record) => record.intent.id === id)
      if (prior) {
        if (prior.digest !== contractDigest(intent))
          throw new DeliveryJournalError('changed-effect-intent')
        return
      }
      append(run, {
        schema: 'wholeloop/delivery-effect-event@1',
        action: 'prepared',
        basis: state.basis.digest,
        id,
        digest: contractDigest(intent),
        intent,
      })
    })
    return this.get(run, id)
  }

  /** The persisted issue is irrevocable: a lost response requires observe, never invoke again. */
  async execute(run: string, id: string, host: EffectHost): Promise<EffectRecord> {
    let intent: EffectIntent | undefined
    let invocation = ''
    this.lifecycle.journal.transaction(ACTOR, (view, append) => {
      const state = this.state(view(), run)
      const record = this.record(state, id)
      const grant = this.grant(state)
      if (record.status !== 'prepared') throw new DeliveryJournalError('effect-already-issued')
      if (
        deliveryEffects(state).records.filter(
          (effect) => effect.intent.grant === grant.id && effect.invocation !== undefined,
        ).length >= grant.effectLimit
      )
        throw new DeliveryJournalError('effect-limit')
      this.scope(state, record.intent, grant)
      if (
        !['queued', 'running'].includes(state.state) ||
        this.lifecycle.journal.now() < state.maxObservedAt
      )
        throw new DeliveryJournalError('effect-execution-state')
      const prepared = this.lifecycle.authority.planning.getPlan(run, state.basis.revision ?? 0)
      if (prepared.digest !== record.intent.basis) throw new DeliveryJournalError('effect-plan')
      observePlanBases(prepared.plan.repositories)
      const eligible = host.eligible(structuredClone(record.intent))
      if (
        !eligible.allowed ||
        !/^[a-f0-9]{64}$/.test(eligible.evidence) ||
        !['fixture', 'host-observed'].includes(eligible.provenance) ||
        (eligible.metering && eligible.metering.provenance !== eligible.provenance)
      )
        throw new DeliveryJournalError('effect-host-unavailable')
      invocation = `invocation-${randomBytes(8).toString('hex')}`
      const budget = prepareBudgetAdmission(
        state,
        grant,
        this.budgetClock(),
        {
          id: invocation,
          kind: 'effect',
          operation: record.intent.operation,
          ...(eligible.metering ? { metering: eligible.metering } : {}),
        },
        prepared.plan.budgets,
      )
      if (budget.problem) throw new DeliveryJournalError(budget.problem)
      for (const payload of budget.payloads) append(run, payload)
      append(run, {
        schema: 'wholeloop/delivery-effect-event@1',
        action: 'issued',
        basis: state.basis.digest,
        id,
        digest: record.digest,
        invocation,
        admission: { evidence: eligible.evidence, provenance: eligible.provenance },
        deadline: budget.reservation.deadline,
      })
      append(run, {
        schema: 'wholeloop/delivery-control-event@1',
        from: state.state,
        to: 'waiting-external',
        basis: state.basis.digest,
        reason: 'An issued effect requires an exact observation before continuation.',
      })
      intent = record.intent
    })
    if (!intent) throw new DeliveryJournalError('missing-issued-intent')
    const current = this.get(run, id)
    if (current.status !== 'pending' || current.invocation !== invocation) return current
    // A recorded intent never substitutes for the final live authority/fence check.
    try {
      const state = this.lifecycle.journal.view(run)
      this.scope(state, intent, this.grant(state))
      if (!currentBudgetReservation(state, invocation, this.budgetClock()))
        throw new DeliveryJournalError('expired-effect-budget')
    } catch {
      this.observe(run, id, {
        binding: current.digest,
        status: 'not-applied',
        reason: 'observed',
        invocationState: 'stopped',
        provenance: 'controller-observed',
        evidence: contractDigest({ invocation, invoked: false }),
      })
      return this.get(run, id)
    }
    const issued = intent
    const invoked = await boundedRecoveryCall(
      (signal) => host.invoke(structuredClone(issued), invocation, signal),
      Date.parse(current.deadline ?? '') - Date.parse(this.lifecycle.journal.now()),
    )
    if (!invoked.available)
      return this.unknown(run, id, invoked.reason === 'deadline' ? 'deadline' : 'lost-response')
    // The host invocation's return value is never treated as proof of application.
    return this.reconcile(run, id, host)
  }

  async reconcile(
    run: string,
    id: string,
    host: Pick<EffectHost, 'observe'>,
    clock?: RecoveryClock,
  ): Promise<EffectRecord> {
    const before = this.get(run, id)
    if (!['pending', 'unknown'].includes(before.status)) return before
    // Reconciliation remains read-only at the host after revocation/expiry of the issued action.
    if (!before.invocation) throw new DeliveryJournalError('missing-effect-invocation')
    const invocation = before.invocation
    const observed = await recoveryRead(
      (signal) => host.observe(structuredClone(before.intent), invocation, signal),
      (clock?.now() ?? Date.now()) + 90000,
      clock,
    )
    if (!observed.available) return this.unknown(run, id, observed.reason)
    try {
      validateDeliveryShape(observed.value, eventSchema.properties.observation)
      if (
        observed.value.binding !== before.digest ||
        (observed.value.resource !== undefined &&
          observed.value.resource.ref !== before.intent.ref) ||
        observed.value.provenance === 'controller-observed' ||
        (before.admission?.provenance === 'fixture' && observed.value.provenance !== 'fixture') ||
        (observed.value.status === 'applied' &&
          (!observed.value.resource || observed.value.reason !== 'observed')) ||
        (observed.value.status === 'not-applied' &&
          (observed.value.invocationState !== 'stopped' || observed.value.reason !== 'observed')) ||
        (observed.value.status === 'unknown' && observed.value.resource !== undefined)
      )
        throw new Error()
    } catch {
      return this.unknown(run, id, 'binding-mismatch')
    }
    this.observe(run, id, observed.value)
    return this.get(run, id)
  }

  abandon(run: string, id: string): EffectRecord {
    this.lifecycle.journal.transaction(ACTOR, (view, append) => {
      const record = this.record(this.state(view(), run), id)
      if (record.status === 'abandoned') return
      append(run, {
        schema: 'wholeloop/delivery-effect-event@1',
        action: 'abandoned',
        basis: record.intent.basis,
        id,
        digest: record.digest,
      })
    })
    return this.get(run, id)
  }

  inspect(run: string): EffectRecord[] {
    return deliveryEffects(this.lifecycle.journal.view(run)).records
  }
  get(run: string, id: string): EffectRecord {
    return this.record(this.lifecycle.journal.view(run), id)
  }

  private unknown(
    run: string,
    id: string,
    reason: Exclude<EffectObservation['reason'], 'observed'>,
  ): EffectRecord {
    const record = this.get(run, id)
    if (!['pending', 'unknown'].includes(record.status)) return record
    const observation: EffectObservation = {
      binding: record.digest,
      status: 'unknown',
      reason,
      provenance: 'controller-observed',
      invocationState: 'unknown',
      evidence: contractDigest({ digest: record.digest, invocation: record.invocation, reason }),
    }
    this.observe(run, id, observation)
    return this.get(run, id)
  }
  private observe(run: string, id: string, observation: EffectObservation): void {
    this.lifecycle.journal.transaction(ACTOR, (view, append) => {
      const state = this.state(view(), run),
        record = this.record(state, id)
      if (!['pending', 'unknown'].includes(record.status)) {
        if (contractDigest(record.observations.at(-1)) === contractDigest(observation)) return
        throw new DeliveryJournalError('contradictory-effect-observation')
      }
      if (contractDigest(record.observations.at(-1) ?? null) === contractDigest(observation)) return
      append(run, {
        schema: 'wholeloop/delivery-effect-event@1',
        action: 'observed',
        basis: record.intent.basis,
        id,
        digest: record.digest,
        ...(record.invocation ? { invocation: record.invocation } : {}),
        observation,
      })
    })
  }
  private state(states: ReadonlyMap<string, DeliveryProjection>, run: string): DeliveryProjection {
    const state = states.get(run)
    if (!state) throw new DeliveryJournalError('unknown-run')
    return state
  }
  private record(state: DeliveryProjection, id: string): EffectRecord {
    const record = deliveryEffects(state).records.find((record) => record.intent.id === id)
    if (!record) throw new DeliveryJournalError('unknown-effect')
    return record
  }
  private grant(state: DeliveryProjection): DeliveryGrant {
    const observed = state.grant ? this.lifecycle.authority.inspect(state.grant.id) : undefined
    if (observed?.status !== 'active' || observed.digest !== state.grant?.digest)
      throw new DeliveryJournalError('inactive-authority')
    return observed.grant
  }
  private scope(state: DeliveryProjection, intent: EffectIntent, grant: DeliveryGrant): void {
    if (
      state.basis.kind !== 'plan' ||
      intent.basis !== state.basis.digest ||
      intent.grant !== grant.id ||
      intent.grantDigest !== state.grant?.digest ||
      !grant.effects.includes(intent.operation)
    )
      throw new DeliveryJournalError('effect-authority')
    const mutation = intent.operation !== 'report.write'
    if (
      !mutation &&
      (!/^artifacts\/[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(intent.ref) ||
        intent.ref.split('/').some((part) => part === '.' || part === '..' || !part))
    )
      throw new DeliveryJournalError('effect-artifact-scope')
    const repo = grant.repositories.find((repo) => repo.repository === intent.repository)
    if (
      mutation &&
      (!repo ||
        !intent.expectedHead ||
        !intent.ref.startsWith(repo.topicPrefix) ||
        !/^wl\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(intent.ref))
    )
      throw new DeliveryJournalError('effect-repository-scope')
    if ((intent.operation === 'git.push' || intent.operation.startsWith('pr.')) && !repo?.remote)
      throw new DeliveryJournalError('effect-remote-scope')
    const prepared = this.lifecycle.authority.planning.getPlan(state.run, state.basis.revision ?? 0)
    if (
      mutation &&
      prepared.plan.repositories.some(
        (repository) =>
          repository.id === intent.repository && repository.target === `refs/heads/${intent.ref}`,
      )
    )
      throw new DeliveryJournalError('effect-target-branch')
    if (
      intent.attempt &&
      !deliveryAttempts(state).records.some(
        (attempt) =>
          attempt.id === intent.attempt?.id &&
          attempt.generation === intent.attempt.generation &&
          attempt.basis === state.basis.digest &&
          attempt.state === 'started',
      )
    )
      throw new DeliveryJournalError('stale-effect-attempt')
  }
}
