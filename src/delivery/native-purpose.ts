import type { DecisionId } from '../decisions/policy.js'
import { DeliveryJournalError } from './events.js'
import { NativeReadOnlyAttempts } from './native-readonly-attempts.js'
import { validateDeliveryShape } from './plan.js'
import purposeSchema from './schemas/native-purpose-v1.json' with { type: 'json' }
import type { WorkerAssignment, WorkerContext } from './worker-protocol.js'

export const NATIVE_PURPOSE_SCHEMA = purposeSchema
export interface NativePurposeLease {
  schema: 'wholeloop/delivery-native-purpose@1'
  grant: string
  decision: DecisionId
  key: string
  contextRoot: string
  provenance: 'fixture' | 'host-observed'
  assignment: WorkerAssignment
}
/** Delegated decision attempts keep their existing exact authorization and v1 lease. */
export class NativePurposeAttempts extends NativeReadOnlyAttempts<NativePurposeLease> {
  claim(input: {
    run: string
    grant: string
    decision: DecisionId
    key: string
    role: 'planner' | 'challenger'
    brief: string
    environment: WorkerAssignment['environment']
    contextRoot: string
    context: WorkerContext[]
    provenance: 'fixture' | 'host-observed'
    deadline?: string
  }): NativePurposeLease {
    return this.claimAttempt({
      ...input,
      cell: `decision:${input.decision}:${input.key}`,
      authorize: (grant) => {
        if (
          !grant.decisions.includes(input.decision) ||
          !grant.policy.delegations.some((item) => item.id === input.decision) ||
          !grant.effects.includes('report.write')
        )
          throw new DeliveryJournalError('purpose-not-delegated')
      },
      create: (assignment) => ({
        schema: 'wholeloop/delivery-native-purpose@1',
        grant: input.grant,
        decision: input.decision,
        key: input.key,
        contextRoot: input.contextRoot,
        provenance: input.provenance,
        assignment,
      }),
    })
  }
  protected path(attempt: string) {
    if (!/^attempt-[a-f0-9]{16}$/.test(attempt)) throw new DeliveryJournalError('purpose-attempt')
    return `delivery/native-purposes/${attempt}.json`
  }
  protected validate(value: unknown) {
    validateDeliveryShape(value, purposeSchema)
  }
}
