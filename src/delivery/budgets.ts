import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { contractDigest } from '../contracts/compatibility.js'
import type { DeliveryGrant } from './authority.js'
import {
  type BudgetArtifact,
  type BudgetClock,
  type BudgetCounter,
  type BudgetFailure,
  type BudgetLimits,
  type BudgetProgress,
  type BudgetRequirements,
  type BudgetUsage,
  emptyBudget,
  findBudget,
} from './budget-events.js'
import {
  budgetClockPayload,
  budgetUsage,
  deliveryBudgetClock,
  effectiveBudget,
  unmeteredDeliveryWork,
} from './budget-policy.js'
import { DeliveryJournalError, type DeliveryProjection } from './events.js'
import { readSourceBytes, rejectSourceCredentials } from './input.js'
import { DeliveryLifecycle } from './lifecycle.js'
import { validateDeliveryShape } from './plan.js'
import constraintsSchema from './schemas/budget-constraints-v1.json' with { type: 'json' }

export const BUDGET_CONSTRAINTS_SCHEMA = constraintsSchema
interface BudgetConstraints {
  schema: 'wholeloop/delivery-budget-constraints@1'
  operator: string
  run: string
  basis: string
  grantDigest: string
  requirements: BudgetRequirements
}
const ACTOR = { kind: 'controller', name: 'wholeloop' } as const
export interface ArtifactCaptureResult {
  stored: boolean
  artifact: BudgetArtifact
  reason: 'artifact-byte-limit' | 'credential-bearing' | null
}
export class DeliveryBudgets {
  readonly lifecycle: DeliveryLifecycle
  readonly clock: () => BudgetClock
  constructor(store?: string, now?: () => string, clock?: () => BudgetClock) {
    this.lifecycle = new DeliveryLifecycle(store, now)
    this.clock = clock ?? (() => deliveryBudgetClock(this.lifecycle.journal.now))
  }

  configure(value: unknown) {
    validateDeliveryShape(value, constraintsSchema)
    const request = value as BudgetConstraints
    if (!Object.keys(request.requirements).length)
      throw new DeliveryJournalError('empty-budget-constraints')
    this.lifecycle.journal.transaction(
      { kind: 'operator', name: request.operator },
      (view, append) => {
        const state = this.state(view(), request.run)
        const grant = this.grant(state)
        if (
          request.basis !== state.basis.digest ||
          request.grantDigest !== state.grant?.digest ||
          grant.id !== state.grant.id
        )
          throw new DeliveryJournalError('budget-constraints-basis')
        const prior = findBudget(state)
        if (Object.keys(prior?.requirements ?? {}).length) {
          if (contractDigest(prior?.requirements) !== contractDigest(request.requirements))
            throw new DeliveryJournalError('budget-constraints-conflict')
          return
        }
        if (prior?.startedAt || unmeteredDeliveryWork(state))
          throw new DeliveryJournalError('budget-already-started')
        append(request.run, {
          schema: 'wholeloop/delivery-budget-event@1',
          action: 'configured',
          basis: state.basis.digest,
          grantDigest: request.grantDigest,
          requirements: request.requirements,
        })
      },
    )
    return this.inspect(request.run)
  }

  start(run: string) {
    this.lifecycle.journal.transaction(ACTOR, (view, append) => {
      const state = this.state(view(), run)
      if (findBudget(state)?.startedAt) return
      append(
        run,
        budgetClockPayload(state, this.grant(state), this.clock(), this.planLimits(state)),
      )
    })
    return this.inspect(run)
  }
  tick(run: string) {
    this.lifecycle.journal.transaction(ACTOR, (view, append) => {
      const state = this.state(view(), run)
      append(
        run,
        budgetClockPayload(
          state,
          this.grant(state, findBudget(state)?.startedAt === undefined),
          this.clock(),
          this.planLimits(state),
        ),
      )
    })
    return this.enforce(run)
  }
  usage(run: string, value: BudgetUsage) {
    return this.record(run, 'usage', value)
  }
  failure(run: string, value: BudgetFailure) {
    return this.record(run, 'failure', { ...value, findings: [...value.findings].sort() })
  }
  progress(run: string, value: BudgetProgress) {
    return this.record(run, 'progress', value)
  }
  repair(run: string, value: BudgetCounter) {
    this.start(run)
    let exhausted: string | null = null
    this.lifecycle.journal.transaction(ACTOR, (view, append) => {
      const state = this.state(view(), run),
        grant = this.grant(state)
      const budget = effectiveBudget(state, grant, this.clock(), this.planLimits(state))
      const prior = budget.facet.counters.find((entry) => entry.key === value.key)
      if (prior) {
        if (contractDigest(prior) !== contractDigest(value))
          throw new DeliveryJournalError('budget-counter-conflict')
        return
      }
      if (budget.problem || budget.facet.counters.length >= budget.limits.integrationRepairs) {
        exhausted = budget.problem ?? 'integration-repair-limit'
        return
      }
      append(run, {
        schema: 'wholeloop/delivery-budget-event@1',
        action: 'counter',
        basis: state.basis.digest,
        counter: value,
      })
    })
    if (exhausted) this.stop(run, exhausted)
    return this.inspect(run)
  }

  captureArtifact(run: string, input: Uint8Array): ArtifactCaptureResult {
    if (input.byteLength > 8 * 1024 * 1024) throw new DeliveryJournalError('artifact-input-size')
    const body = Buffer.from(input),
      digest = createHash('sha256').update(body).digest('hex')
    const artifact: BudgetArtifact = {
      digest,
      bytes: body.length,
      ref: `delivery/artifacts/${run}/${digest}`,
    }
    let credential = false
    try {
      rejectSourceCredentials(body.toString('utf8'))
    } catch {
      credential = true
    }
    this.start(run)
    let omission: 'artifact-byte-limit' | 'credential-bearing' | null = null
    this.lifecycle.journal.transaction(ACTOR, (view, append) => {
      const state = this.state(view(), run),
        grant = this.grant(state),
        budget = effectiveBudget(state, grant, this.clock(), this.planLimits(state))
      if (!grant.effects.includes('report.write') || budget.problem)
        throw new DeliveryJournalError('artifact-admission-refused')
      const prior = budget.facet.artifacts.find((entry) => entry.digest === digest)
      if (prior && !credential) {
        if (prior.bytes !== body.length) throw new DeliveryJournalError('artifact-digest-collision')
        return
      }
      omission = credential
        ? 'credential-bearing'
        : budget.facet.artifacts.reduce((total, entry) => total + entry.bytes, 0) + body.length >
            budget.limits.artifactBytes
          ? 'artifact-byte-limit'
          : null
      if (omission) {
        if (
          !budget.facet.omissions.some(
            (entry) => entry.digest === digest && entry.reason === omission,
          )
        )
          append(run, {
            schema: 'wholeloop/delivery-budget-event@1',
            action: 'artifact-omitted',
            basis: state.basis.digest,
            artifact,
            reason: omission,
          })
      } else
        append(run, {
          schema: 'wholeloop/delivery-budget-event@1',
          action: 'artifact-reserved',
          basis: state.basis.digest,
          artifact,
        })
    })
    if (omission) return { stored: false, artifact, reason: omission }
    this.lifecycle.journal.transaction(ACTOR, (view, append) => {
      const state = this.state(view(), run),
        grant = this.grant(state)
      if (
        effectiveBudget(state, grant, this.clock(), this.planLimits(state)).problem ||
        !grant.effects.includes('report.write')
      )
        throw new DeliveryJournalError('artifact-admission-refused')
      const files = this.lifecycle.journal.files
      if (files.path(artifact.ref) !== resolve(files.root, artifact.ref))
        throw new DeliveryJournalError('aliased-budget-artifact')
      const prior = findBudget(state)?.artifacts.find((entry) => entry.digest === digest)
      if (!prior) throw new DeliveryJournalError('missing-artifact-reservation')
      if (existsSync(files.path(artifact.ref))) {
        const current = readSourceBytes(files.root, artifact.ref, 8 * 1024 * 1024)
        if (!current.equals(body)) throw new DeliveryJournalError('changed-budget-artifact')
      } else {
        if (prior.status === 'observed') throw new DeliveryJournalError('missing-observed-artifact')
        files.atomic(artifact.ref, body)
      }
      if (prior.status !== 'observed')
        append(run, {
          schema: 'wholeloop/delivery-budget-event@1',
          action: 'artifact-observed',
          basis: state.basis.digest,
          artifact,
        })
    })
    return { stored: true, artifact, reason: null }
  }

  inspect(run: string) {
    return this.observation(run).report
  }
  /** Share this fresh read within one controller check, never across polls.
   * Replaying the same journal repeatedly delays cancellation under growing histories. */
  observation(run: string) {
    const state = this.lifecycle.journal.get(run),
      facet = findBudget(state) ?? emptyBudget()
    const authority = state.grant ? this.lifecycle.authority.inspect(state.grant.id) : null
    const computed = authority
      ? effectiveBudget(state, authority.grant, this.clock(), this.planLimits(state))
      : null
    const pushes =
      state.facets
        .find((entry) => entry.schema === 'wholeloop/delivery-effects@1')
        ?.records.filter((entry) => entry.intent.operation === 'git.push' && entry.invocation)
        .length ?? 0
    const report = {
      run,
      state: state.state,
      started: facet.startedAt !== undefined,
      limits: computed?.limits ?? facet.limits ?? null,
      startedAt: facet.startedAt ?? null,
      deadline: facet.startedAt ? (computed?.deadline ?? facet.deadline ?? null) : null,
      elapsedMs: facet.startedAt ? (computed?.facet.elapsedMs ?? facet.elapsedMs) : 0,
      remainingMs: facet.startedAt ? (computed?.remainingMs ?? null) : null,
      problem: authority?.status !== 'active' ? 'inactive-authority' : (computed?.problem ?? null),
      requirements: facet.requirements,
      usage: budgetUsage(facet, unmeteredDeliveryWork(state)),
      reservations: facet.reservations,
      counters: {
        ciPushes: pushes,
        integrationRepairs: facet.counters.length,
        artifactBytes: facet.artifacts.reduce((bytes, entry) => bytes + entry.bytes, 0),
      },
      noProgress: {
        streak: facet.streak,
        signature: facet.signature ?? null,
        findings: facet.failures.at(-1)?.findings ?? [],
      },
      artifacts: facet.artifacts,
      omissions: facet.omissions,
      authority: 'not-granted' as const,
    }
    return { state, authority, report }
  }

  enforce(run: string) {
    const report = this.inspect(run)
    if (report.problem && report.problem !== 'inactive-authority') this.stop(run, report.problem)
    return this.inspect(run)
  }
  private record(
    run: string,
    action: 'usage' | 'failure' | 'progress',
    value: BudgetUsage | BudgetFailure | BudgetProgress,
  ) {
    this.start(run)
    this.lifecycle.journal.transaction(ACTOR, (view, append) => {
      const state = this.state(view(), run),
        facet = findBudget(state)
      const prior = facet?.[
        action === 'usage' ? 'usage' : action === 'failure' ? 'failures' : 'progress'
      ].find((entry) => entry.key === value.key)
      if (prior) {
        if (contractDigest(prior) !== contractDigest(value))
          throw new DeliveryJournalError('budget-observation-conflict')
        return
      }
      append(run, {
        schema: 'wholeloop/delivery-budget-event@1',
        action,
        basis: state.basis.digest,
        [action]: value,
      })
    })
    return this.enforce(run)
  }
  private stop(run: string, reason: string): void {
    const state = this.lifecycle.journal.get(run)
    if (
      ['completed', 'failed', 'blocked', 'exhausted', 'stopped', 'stopping'].includes(state.state)
    )
      return
    const clock = reason === 'clock-invalid'
    if (clock && state.policy.intervention !== 'none' && state.state === 'paused') return
    this.lifecycle.transition(run, {
      to: clock ? (state.policy.intervention === 'none' ? 'blocked' : 'paused') : 'exhausted',
      reason: `Execution budget refused continuation: ${reason}. Retained evidence and limits are unchanged.`,
      ...(clock && state.policy.intervention !== 'none'
        ? {}
        : { outcome: clock ? ('blocked' as const) : ('exhausted' as const) }),
    })
  }
  private state(states: ReadonlyMap<string, DeliveryProjection>, run: string): DeliveryProjection {
    const state = states.get(run)
    if (!state) throw new DeliveryJournalError('unknown-run')
    return state
  }
  private planLimits(state: DeliveryProjection): BudgetLimits {
    const planning = this.lifecycle.authority.planning
    const receipt =
      state.basis.kind === 'plan'
        ? planning.getPlan(state.run, state.basis.revision ?? 0)
        : planning.getEnvelope(state.basis.digest)
    if (receipt.digest !== state.basis.digest) throw new DeliveryJournalError('budget-plan-basis')
    return 'plan' in receipt ? receipt.plan.budgets : receipt.envelope.budgets
  }
  private grant(state: DeliveryProjection, active = true): DeliveryGrant {
    const authority = state.grant ? this.lifecycle.authority.inspect(state.grant.id) : undefined
    if (
      !authority ||
      authority.digest !== state.grant?.digest ||
      (active && authority.status !== 'active')
    )
      throw new DeliveryJournalError('inactive-authority')
    return authority.grant
  }
}
