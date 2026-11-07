// Evaluates behaviour assertions, keeping a missing value distinct from null, zero or empty text.
import { contractDigest } from '../contracts/compatibility.js'
import { observableHeader } from './behavior-input.js'
import type { AcceptanceAssertion } from './contracts.js'

export interface BehaviorRequestObservation {
  id: string
  status: number
  headers: Record<string, string>
  text: string
  json?: unknown
  jsonError?: boolean
}
export interface BehaviorObservation {
  application?: { code: number; stdout: string; stderr: string }
  requests: BehaviorRequestObservation[]
}
interface ObservedValue {
  present: boolean
  value?: unknown
}
function pointer(root: unknown, path: string): ObservedValue {
  if (root === undefined) return { present: false }
  if (!path) return { present: true, value: root }
  if (!path.startsWith('/')) return { present: false }
  let current: unknown = root
  for (const encoded of path.slice(1).split('/')) {
    if (/~(?:[^01]|$)/.test(encoded)) return { present: false }
    const key = encoded.replace(/~1/g, '/').replace(/~0/g, '~')
    if (
      ['__proto__', 'constructor', 'prototype'].includes(key) ||
      !current ||
      typeof current !== 'object' ||
      !Object.hasOwn(current, key)
    )
      return { present: false }
    current = (current as Record<string, unknown>)[key]
  }
  return { present: true, value: current }
}
export function observeAssertion(
  assertion: AcceptanceAssertion,
  observation: BehaviorObservation,
  target?: string,
) {
  const request = target
    ? observation.requests.find((r) => r.id === target)
    : observation.requests.at(-1)
  let value: ObservedValue = { present: false },
    available = true,
    malformed = false
  switch (assertion.subject) {
    case 'exit':
      if (observation.application && Number.isInteger(observation.application.code))
        value = { present: true, value: observation.application.code }
      else available = false
      break
    case 'stdout':
    case 'stderr':
      if (observation.application && typeof observation.application[assertion.subject] === 'string')
        value = pointer(observation.application[assertion.subject], assertion.path ?? '')
      else available = false
      break
    case 'status':
      if (
        request &&
        Number.isInteger(request.status) &&
        request.status >= 100 &&
        request.status <= 599
      )
        value = pointer(request.status, assertion.path ?? '')
      else available = false
      break
    case 'header':
      if (request && observableHeader(assertion.path))
        value = pointer(request.headers, assertion.path ?? '')
      else available = false
      break
    case 'json':
      if (request) {
        if (request.jsonError || !Object.hasOwn(request, 'json')) malformed = true
        else value = pointer(request.json, assertion.path ?? '')
      } else if (observation.application) {
        try {
          value = pointer(JSON.parse(observation.application.stdout), assertion.path ?? '')
        } catch {
          malformed = true
        }
      } else available = false
      break
    default:
      available = false
  }
  if (!available) return { id: assertion.id, status: 'unavailable' as const, observed: value }
  if (malformed) return { id: assertion.id, status: 'failed' as const, observed: value }
  let passed = false
  if (assertion.operator === 'present') passed = value.present
  else if (assertion.operator === 'absent') passed = !value.present
  else if (value.present && assertion.expected !== undefined) {
    const expected = JSON.parse(assertion.expected) as unknown
    if (assertion.operator === 'equals')
      passed = contractDigest(value.value) === contractDigest(expected)
    else if (typeof value.value === 'string' && typeof expected === 'string')
      passed = value.value.includes(expected)
    else if (Array.isArray(value.value))
      passed = value.value.some((entry) => contractDigest(entry) === contractDigest(expected))
  }
  // Missing values carry a separate bit. JSON null, zero and empty text are observed values.
  return {
    id: assertion.id,
    status: passed ? ('passed' as const) : ('failed' as const),
    observed: value,
  }
}
