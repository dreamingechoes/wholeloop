import { contractDigest } from '../contracts/compatibility.js'
import { type BehaviorRequestObservation, observeAssertion } from './assertions.js'
import { AcceptanceError } from './contracts.js'
import { observeHttp } from './http.js'
import { privateDefinition } from './private-input.js'

/** Used only inside the evaluator; no response bodies or hidden expected values leave this boundary. */
export async function evaluatePrivate(
  input: unknown,
  origin: string,
  signal: AbortSignal,
  limit: number,
) {
  const plan = privateDefinition(input)
  if (
    !/^http:\/\/(?:\d{1,3}\.){3}\d{1,3}:\d{1,5}$/.test(origin) ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 8 * 1024 * 1024
  )
    throw new AcceptanceError('private-execution-origin')
  const requests: BehaviorRequestObservation[] = []
  for (const step of plan.behavior.steps ?? [])
    requests.push(await observeHttp(origin, step, signal, limit))
  const assertions = plan.assertions.map((assertion) => {
    const target = plan.behavior.targets?.find((t) => t.assertion === assertion.id)
    const request = target ? requests.find((r) => r.id === target.step) : requests.at(-1)
    return observeAssertion(assertion, { requests: request ? [request] : [] })
  })
  return {
    schema: 'wholeloop/private-evaluation-observation@1',
    definition: contractDigest(plan),
    complete: true,
    assertions: assertions.map((a) => ({
      id: a.id,
      status: a.status,
      evidence: contractDigest(a.observed),
    })),
    requests: requests.map((r) => ({ id: r.id, evidence: contractDigest(r) })),
  }
}
