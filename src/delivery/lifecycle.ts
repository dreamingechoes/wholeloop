import { contractDigest } from '../contracts/compatibility.js'
import { DeliveryAuthority } from './authority.js'
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
export class DeliveryLifecycle {
  readonly journal: DeliveryJournal
  readonly authority: DeliveryAuthority
  constructor(store?: string, now?: () => string) {
    this.journal = new DeliveryJournal(store, now)
    this.authority = new DeliveryAuthority(this.journal.files.root, now)
  }

  track(input: {
    run: string
    revision?: number
    envelope?: string
    grant?: string
  }): DeliveryProjection {
    this.journal.transaction(CONTROLLER, (view, append) => {
      let registration: RegistrationPayload
      if (input.envelope !== undefined) {
        if (input.revision !== undefined) throw new DeliveryJournalError('ambiguous-registration')
        const receipt = this.authority.planning.getEnvelope(input.envelope)
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
        if (plan.envelope)
          checkPlanEnvelope(plan, this.authority.planning.getEnvelope(plan.envelope).envelope)
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
        }
      }
      const current = view().get(input.run)
      if (current?.basis.digest !== registration.basis.digest) append(input.run, registration)
      if (input.grant) {
        const receipt = this.authority.inspect(input.grant)
        const state = view().get(input.run)
        if (
          !state ||
          receipt.grant.basis.digest !==
            (receipt.grant.basis.kind === 'envelope' ? state.envelope : state.basis.digest)
        )
          throw new DeliveryJournalError('grant-basis')
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
