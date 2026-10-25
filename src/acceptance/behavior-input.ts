import { type AcceptanceCase, AcceptanceError, acceptanceShape } from './contracts.js'
import schema from './schemas/behavior-input-v1.json' with { type: 'json' }

export const BEHAVIOR_INPUT_SCHEMA = schema
export const BEHAVIOR_RESPONSE_HEADERS = [
  'content-type',
  'content-length',
  'location',
  'etag',
  'cache-control',
] as const
export function observableHeader(path: string | undefined) {
  return BEHAVIOR_RESPONSE_HEADERS.some((name) => path === `/${name}`)
}
export interface BehaviorStep {
  id: string
  kind: 'request' | 'restart'
  method?: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS'
  path?: string
  body?: string
  headers?: { accept?: string; 'content-type'?: string }
}
export interface BehaviorInput {
  schema: 'wholeloop/behavior-input@1'
  kind: 'cli' | 'api'
  service: string
  stdin?: string
  command?: string
  port?: number
  steps?: BehaviorStep[]
  targets?: { assertion: string; step: string }[]
}
export function behaviorInput(test: AcceptanceCase): BehaviorInput {
  let value: unknown
  try {
    value = JSON.parse(test.runner.input)
  } catch {
    throw new AcceptanceError('invalid-behavior-input')
  }
  acceptanceShape(value, schema)
  const input = value as BehaviorInput
  if (
    input.kind !== test.runner.kind ||
    test.runner.capability !== (input.kind === 'cli' ? 'process.exec' : 'http.request')
  )
    throw new AcceptanceError('behavior-capability-mismatch')
  if (input.kind === 'cli') {
    if (
      !input.command ||
      input.steps !== undefined ||
      input.port !== undefined ||
      input.targets !== undefined
    )
      throw new AcceptanceError('ambiguous-cli-input')
  } else {
    if (
      input.command !== undefined ||
      input.stdin !== undefined ||
      !input.steps?.length ||
      !input.steps.some((s) => s.kind === 'request')
    )
      throw new AcceptanceError('ambiguous-api-input')
    if (new Set(input.steps.map((s) => s.id)).size !== input.steps.length)
      throw new AcceptanceError('duplicate-behavior-step')
    for (const step of input.steps) {
      if (step.kind === 'restart') {
        if (Object.keys(step).some((key) => !['id', 'kind'].includes(key)))
          throw new AcceptanceError('ambiguous-restart-step')
      } else {
        if (!step.method || !step.path) throw new AcceptanceError('missing-request-shape')
        ownedRequestUrl('http://127.0.0.1:1', step.path)
        if (['GET', 'HEAD'].includes(step.method) && step.body !== undefined)
          throw new AcceptanceError('unexpected-request-body')
      }
    }
    if (new Set(input.targets?.map((t) => t.assertion)).size !== (input.targets?.length ?? 0))
      throw new AcceptanceError('duplicate-assertion-target')
    for (const target of input.targets ?? [])
      if (
        !test.assertions.some((a) => a.id === target.assertion) ||
        !input.steps.some((s) => s.id === target.step && s.kind === 'request')
      )
        throw new AcceptanceError('unknown-assertion-target')
  }
  for (const assertion of test.assertions) {
    // Excluded credential headers are unobserved, not absent. Never let a projection prove their absence.
    if (assertion.subject === 'header' && !observableHeader(assertion.path))
      throw new AcceptanceError('unavailable-header-assertion')
    const allowed =
      input.kind === 'cli' ? ['exit', 'stdout', 'stderr', 'json'] : ['status', 'header', 'json']
    if (!allowed.includes(assertion.subject))
      throw new AcceptanceError('unsupported-behavior-assertion')
    if (assertion.path !== undefined && assertion.path !== '') {
      if (
        !['json', 'header'].includes(assertion.subject) ||
        !assertion.path.startsWith('/') ||
        /~(?:[^01]|$)/.test(assertion.path)
      )
        throw new AcceptanceError('invalid-assertion-path')
      if (
        assertion.path
          .slice(1)
          .split('/')
          .some((part) =>
            ['__proto__', 'constructor', 'prototype'].includes(
              part.replace(/~1/g, '/').replace(/~0/g, '~'),
            ),
          )
      )
        throw new AcceptanceError('unsafe-assertion-path')
    }
  }
  return structuredClone(input)
}
export function ownedRequestUrl(origin: string, path: string) {
  if (
    !path.startsWith('/') ||
    path.startsWith('//') ||
    /[\\\r\n\0#]/.test(path) ||
    /%(?:5c|0[0ad]|23)/i.test(path)
  )
    throw new AcceptanceError('wrong-request-origin')
  let url: URL
  try {
    url = new URL(path, origin)
  } catch {
    throw new AcceptanceError('invalid-request-url')
  }
  if (url.origin !== origin || url.username || url.password || url.hash)
    throw new AcceptanceError('wrong-request-origin')
  return url.href
}
