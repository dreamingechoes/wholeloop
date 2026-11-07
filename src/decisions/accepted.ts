// The default plan for accepting delegated machine decisions from current private records.
import { DelegatedDecisions } from './store.js'

/** Existing hosts may provide a stricter policy; the default reads only current private machine records. */
export function acceptedDecisionPlan(store: string, grant: string, plan: string): boolean {
  return new DelegatedDecisions(store).planAccepted(grant, plan)
}
