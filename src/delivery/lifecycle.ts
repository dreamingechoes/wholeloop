// Delivery run lifecycle transitions, including correction revisions.
import { contractDigest } from '../contracts/compatibility.js'
import { originalCiFailure } from '../runner/ci-failure.js'
import { ciRepairAdmission } from '../runner/ci-repair.js'
import { deliveryRunner } from '../runner/events.js'
import { RunnerStore } from '../runner/store.js'
import { DeliveryAuthority } from './authority.js'
import { type BudgetLimits, findBudget } from './budget-events.js'
import {
  type ControlPayload,
  type DeliveryActor,
  DeliveryJournalError,
  type DeliveryPayload,
  type DeliveryProjection,
  type RegistrationPayload,
} from './events.js'
import { DeliveryJournal } from './journal.js'
import { checkPlanEnvelope } from './plan.js'

const CONTROLLER: DeliveryActor = { kind: 'controller', name: 'wholeloop' }
/** What an envelope grant must already allow to start a none continuation (ADR-0198). */
export const ENVELOPE_CONTINUATION_EFFECTS = ['code.write', 'git.commit', 'test.run'] as const
/** A CI correction also pushes the repaired head to the original pull request (ADR-0248). */
export const ENVELOPE_CI_CONTINUATION_EFFECTS = [
  ...ENVELOPE_CONTINUATION_EFFECTS,
  'git.push',
] as const
/** The authority a recorded continuation receipt names, or undefined when there is none. */
function continuationAuthority(
  lifecycle: DeliveryLifecycle,
  run: string,
  revision: number,
): string | undefined {
  try {
    const text = lifecycle.authority.planning.sources.files.read(
      `delivery/continuations/${run}/${revision}.json`,
    )
    const value: unknown = text === undefined ? undefined : JSON.parse(text)
    return typeof value === 'object' && value !== null && 'authority' in value
      ? String(value.authority)
      : undefined
  } catch {
    return undefined
  }
}
export class DeliveryLifecycle {
  readonly journal: DeliveryJournal
  readonly authority: DeliveryAuthority
  constructor(store?: string, now?: () => string) {
    this.journal = new DeliveryJournal(store, now)
    this.authority = new DeliveryAuthority(this.journal.files.root, now)
  }

  track(
    input: {
      run: string
      revision?: number
      envelope?: string
      grant?: string
    },
    after?: (state: DeliveryProjection, append: (payload: DeliveryPayload) => void) => void,
  ): DeliveryProjection {
    this.journal.transaction(CONTROLLER, (view, append) => {
      let registration: RegistrationPayload
      let limits: BudgetLimits
      if (input.envelope !== undefined) {
        if (input.revision !== undefined) throw new DeliveryJournalError('ambiguous-registration')
        const receipt = this.authority.planning.getEnvelope(input.envelope)
        limits = receipt.envelope.budgets
        registration = {
          schema: 'wholeloop/delivery-registration-event@1',
          basis: { kind: 'envelope', digest: receipt.digest },
          source: receipt.envelope.source,
          policy: {
            digest: contractDigest(receipt.envelope.policy),
            endpoint: receipt.envelope.policy.endpoint,
            intervention: receipt.envelope.policy.intervention,
          },
          units: [],
        }
      } else {
        if (input.revision === undefined) throw new DeliveryJournalError('missing-plan-revision')
        const receipt = this.authority.planning.getPlan(input.run, input.revision)
        const plan = receipt.plan
        limits = plan.budgets
        if (plan.envelope)
          checkPlanEnvelope(plan, this.authority.planning.getEnvelope(plan.envelope).envelope)
        // A correction revision keeps every earlier correction and adds at most one;
        // the new one is what the journal must find as a retained failure (ADR-0197).
        const earlier =
            plan.revision > 1
              ? (this.authority.planning.getPlan(input.run, plan.revision - 1).plan.corrections ??
                [])
              : [],
          corrections = plan.corrections ?? []
        if (
          corrections.length - earlier.length > 1 ||
          contractDigest(corrections.slice(0, earlier.length)) !== contractDigest(earlier)
        )
          throw new DeliveryJournalError('correction-history')
        const added = corrections.length > earlier.length ? corrections.at(-1) : undefined
        if (
          added &&
          plan.schema === 'wholeloop/delivery-plan@2' &&
          added.revision !== plan.revision
        )
          throw new DeliveryJournalError('correction-producer-revision')
        if (added?.origin === 'ci') {
          const previous = this.authority.planning.getPlan(input.run, plan.revision - 1),
            expected = {
              ...previous.plan,
              schema: 'wholeloop/delivery-plan@2',
              revision: plan.revision,
              previous: previous.digest,
              corrections,
            },
            unit = plan.work.find((entry) => entry.id === added.unit),
            store = new RunnerStore(this.journal.files.root, this.journal.now)
          // A CI repair changes production, never its approved requirements,
          // scope or budget. Requirement changes need their separate revision.
          if (contractDigest(expected) !== receipt.digest || !unit?.repository)
            throw new DeliveryJournalError('ci-correction-exact-predecessor')
          const original = originalCiFailure(store, {
            request: added.request,
            failure: added.failure,
            repository: unit.repository,
          })
          if (original.plan !== previous.digest || !ciRepairAdmission(store, input.run).allowed)
            throw new DeliveryJournalError('ci-correction-original-failure-or-budget')
        }
        registration = {
          schema: 'wholeloop/delivery-registration-event@1',
          basis: { kind: 'plan', digest: receipt.digest, revision: plan.revision },
          source: plan.source,
          policy: {
            digest: contractDigest(plan.policy),
            endpoint: plan.policy.endpoint,
            intervention: plan.policy.intervention,
          },
          units: plan.work.map((unit) => ({
            id: unit.id,
            role: unit.role,
            ...(unit.repository ? { repository: unit.repository } : {}),
          })),
          ...(plan.previous ? { previous: plan.previous } : {}),
          ...(plan.envelope ? { envelope: plan.envelope } : {}),
          ...(added
            ? {
                continues: { request: added.request, stage: added.stage, failure: added.failure },
              }
            : {}),
        }
      }
      const current = view().get(input.run)
      if (current?.basis.digest !== registration.basis.digest) {
        append(input.run, registration)
        const pinned = current ? findBudget(current)?.limits : undefined
        if (pinned) {
          const tightened = Object.fromEntries(
            Object.entries(pinned).map(([key, value]) => [
              key,
              Math.min(value, limits[key as keyof BudgetLimits]),
            ]),
          ) as unknown as BudgetLimits
          if (contractDigest(tightened) !== contractDigest(pinned))
            append(input.run, {
              schema: 'wholeloop/delivery-budget-event@1',
              action: 'limits',
              basis: registration.basis.digest,
              limits: tightened,
            })
        }
      }
      if (input.grant) {
        const receipt = this.authority.inspect(input.grant)
        const state = view().get(input.run)
        if (
          !state ||
          receipt.grant.basis.digest !==
            (receipt.grant.basis.kind === 'envelope' ? state.envelope : state.basis.digest)
        )
          throw new DeliveryJournalError('grant-basis')
        // An envelope grant may start a continuation only if it already carries
        // the repair effects (ADR-0198); the reducer checks the rest. A CI
        // correction also needs git.push and the controller's own continuation
        // record, so an operator's CI proposal never runs under the envelope (ADR-0248).
        const continuation = deliveryRunner(state).continuations?.at(-1)
        if (
          continuation &&
          receipt.grant.basis.kind === 'envelope' &&
          continuation.revision === state.basis.revision &&
          state.grant?.id !== input.grant
        ) {
          const ci = continuation.stage === 'ci',
            effects = ci ? ENVELOPE_CI_CONTINUATION_EFFECTS : ENVELOPE_CONTINUATION_EFFECTS
          if (
            !effects.every((effect) => receipt.grant.effects.includes(effect)) ||
            (ci &&
              continuationAuthority(this, input.run, continuation.revision) !==
                'envelope-grant-continuation')
          )
            throw new DeliveryJournalError('continuation-requires-new-grant')
        }
        const observation = {
          schema: 'wholeloop/delivery-grant-event@1' as const,
          id: input.grant,
          digest: receipt.digest,
          basis: receipt.grant.basis.digest,
          status: receipt.status,
        }
        if (contractDigest(state.grant ?? null) !== contractDigest(observation))
          append(input.run, observation)
      }
      const tracked = view().get(input.run)
      if (after && tracked) after(tracked, (payload) => append(input.run, payload))
    })
    return this.journal.get(input.run)
  }

  transition(
    run: string,
    input: Omit<ControlPayload, 'schema' | 'from' | 'basis'>,
    actor: DeliveryActor = CONTROLLER,
  ): DeliveryProjection {
    this.journal.transaction(actor, (view, append) => {
      const state = view().get(run)
      if (!state) throw new DeliveryJournalError('unknown-run')
      if (['queued', 'running'].includes(input.to)) {
        const observed = state.grant ? this.authority.inspect(state.grant.id) : undefined
        if (observed?.status !== 'active' || observed.digest !== state.grant?.digest)
          throw new DeliveryJournalError('inactive-authority')
      }
      append(run, {
        ...input,
        schema: 'wholeloop/delivery-control-event@1',
        from: state.state,
        basis: state.basis.digest,
      })
    })
    return this.journal.get(run)
  }

  append(run: string, payload: DeliveryPayload): DeliveryProjection {
    this.journal.transaction(CONTROLLER, (view, append) => {
      if (
        payload.schema === 'wholeloop/delivery-attempt-event@1' &&
        ['claimed', 'started'].includes(payload.action)
      ) {
        const state = view().get(run)
        const observed = state?.grant ? this.authority.inspect(state.grant.id) : undefined
        if (observed?.status !== 'active' || observed.digest !== state?.grant?.digest)
          throw new DeliveryJournalError('inactive-authority')
      }
      append(run, payload)
    })
    return this.journal.get(run)
  }
}
