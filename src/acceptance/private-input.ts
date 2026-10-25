import { safeSourceText } from '../delivery/input.js'
import { type BehaviorInput, behaviorInput } from './behavior-input.js'
import {
  type AcceptanceAssertion,
  type AcceptanceCase,
  AcceptanceError,
  acceptanceShape,
} from './contracts.js'
import schema from './schemas/private-acceptance-v1.json' with { type: 'json' }
import inputSchema from './schemas/private-case-input-v1.json' with { type: 'json' }

export const PRIVATE_ACCEPTANCE_SCHEMA = schema
export const PRIVATE_CASE_INPUT_SCHEMA = inputSchema
export interface PrivateAcceptancePlan {
  schema: 'wholeloop/private-acceptance@1'
  run: string
  revision: number
  plan: string
  source: string
  case: string
  behavior: BehaviorInput
  assertions: AcceptanceAssertion[]
  sensitivity: {
    mode: 'regression' | 'new-feature' | 'not-applicable'
    relevant: string[]
    mutation?: { service: string; command: string }
  }
}
export function privateDefinition(value: unknown): PrivateAcceptancePlan {
  acceptanceShape(value, schema)
  safeSourceText(JSON.stringify(value), 1024 * 1024)
  const input = value as PrivateAcceptancePlan
  const test = {
    runner: { kind: 'api', capability: 'http.request', input: JSON.stringify(input.behavior) },
    assertions: input.assertions,
  } as AcceptanceCase
  behaviorInput(test)
  if (
    input.behavior.kind !== 'api' ||
    input.behavior.steps?.some((step) => step.kind !== 'request') ||
    !input.behavior.port
  )
    throw new AcceptanceError('private-runner-unavailable')
  if (
    new Set(input.assertions.map((a) => a.id)).size !== input.assertions.length ||
    new Set(input.sensitivity.relevant).size !== input.sensitivity.relevant.length ||
    input.sensitivity.relevant.some((id) => !input.assertions.some((a) => a.id === id))
  )
    throw new AcceptanceError('private-assertion-identity')
  return structuredClone(input)
}
export function privateCaseReference(test: AcceptanceCase) {
  let input: unknown
  try {
    input = JSON.parse(test.runner.input)
  } catch {
    throw new AcceptanceError('invalid-private-reference')
  }
  acceptanceShape(input, inputSchema)
  if (
    test.runner.kind !== 'api' ||
    test.runner.capability !== 'evaluator.private-http' ||
    test.assertions.length !== 1 ||
    test.assertions[0]?.id !== 'private-outcome' ||
    test.assertions[0]?.subject !== 'state' ||
    test.assertions[0]?.operator !== 'equals' ||
    test.assertions[0]?.path !== '/passed' ||
    test.assertions[0]?.expected !== 'true'
  )
    throw new AcceptanceError('private-case-contract')
  return (input as { manifest: string }).manifest
}
