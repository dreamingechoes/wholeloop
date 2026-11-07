// Browser-case input for acceptance and the URLs it may open.
import { BEHAVIOR_RESPONSE_HEADERS, ownedRequestUrl } from './behavior-input.js'
import { type AcceptanceCase, AcceptanceError, acceptanceShape } from './contracts.js'
import schema from './schemas/browser-input-v1.json' with { type: 'json' }

export const BROWSER_INPUT_SCHEMA = schema
export interface BrowserStep {
  id: string
  kind:
    | 'navigate'
    | 'fill'
    | 'click'
    | 'press'
    | 'reload'
    | 'fresh'
    | 'restart'
    | 'check'
    | 'capture'
  path?: string
  target?: { role: string; name: string }
  text?: string
  key?: string
  assertion?: string
  mode?: 'present' | 'absent'
  expectPath?: string
  label?: string
}
export interface BrowserInput {
  schema: 'wholeloop/browser-input@1'
  service: string
  port: number
  browser: { service: string; reference: 'playwright-mcp@0.0.83'; tools: string }
  grounding: { file: string; sha256: string }[]
  persistence: 'not-applicable' | 'backend-roundtrip'
  backend?: { path: string }
  steps: BrowserStep[]
}
export function browserInput(test: AcceptanceCase): BrowserInput {
  let value: unknown
  try {
    value = JSON.parse(test.runner.input)
  } catch {
    throw new AcceptanceError('invalid-browser-input')
  }
  acceptanceShape(value, schema)
  const input = value as BrowserInput
  if (
    test.runner.kind !== 'browser' ||
    test.runner.capability !== 'browser.journey' ||
    input.service === input.browser.service
  )
    throw new AcceptanceError('browser-capability-mismatch')
  if (
    new Set(input.steps.map((s) => s.id)).size !== input.steps.length ||
    new Set(input.grounding.map((g) => g.file)).size !== input.grounding.length
  )
    throw new AcceptanceError('duplicate-browser-input')
  const checks = new Set<string>(),
    labels = new Set<string>()
  let opened = false,
    restarted = false,
    freshAfterRestart = false,
    checkedAfterFresh = false
  for (const step of input.steps) {
    const required: Record<BrowserStep['kind'], string[]> = {
      navigate: ['path'],
      fill: ['target', 'text'],
      click: ['target'],
      press: ['key'],
      reload: [],
      fresh: [],
      restart: [],
      check: ['assertion', 'text', 'mode'],
      capture: ['label'],
    }
    const fields = required[step.kind]
    if (
      Object.keys(step).some(
        (key) =>
          !['id', 'kind', ...(step.kind === 'navigate' ? [] : ['expectPath']), ...fields].includes(
            key,
          ),
      ) ||
      fields.some((key) => !Object.hasOwn(step, key))
    )
      throw new AcceptanceError('ambiguous-browser-step')
    if (step.kind === 'navigate') {
      ownedBrowserUrl('http://127.0.0.1:1', step.path ?? '')
      opened = true
    } else if (!opened) throw new AcceptanceError('browser-not-opened')
    if (step.expectPath !== undefined) ownedBrowserUrl('http://127.0.0.1:1', step.expectPath)
    if (step.kind === 'restart') {
      restarted = true
      freshAfterRestart = false
      checkedAfterFresh = false
    }
    if (step.kind === 'fresh' && restarted) freshAfterRestart = true
    if (step.kind === 'check') {
      if (
        !step.text?.trim() ||
        !step.assertion ||
        checks.has(step.assertion) ||
        !test.assertions.some((a) => a.id === step.assertion && a.subject === 'state')
      )
        throw new AcceptanceError('invalid-browser-check')
      checks.add(step.assertion)
      if (freshAfterRestart) checkedAfterFresh = true
    }
    if (step.kind === 'capture') {
      if (!step.label || labels.has(step.label))
        throw new AcceptanceError('duplicate-browser-capture')
      labels.add(step.label)
    }
  }
  if (!checks.size) throw new AcceptanceError('screenshot-is-not-acceptance')
  for (const assertion of test.assertions) {
    if (assertion.subject === 'state') {
      if (
        !checks.has(assertion.id) ||
        assertion.path !== `/checks/${assertion.id}` ||
        assertion.operator !== 'equals' ||
        assertion.expected !== 'true'
      )
        throw new AcceptanceError('unsupported-browser-state-assertion')
    } else if (!input.backend || !['json', 'status', 'header'].includes(assertion.subject))
      throw new AcceptanceError('missing-browser-backend-observation')
    else if (
      assertion.subject === 'header' &&
      !BEHAVIOR_RESPONSE_HEADERS.some((h) => assertion.path === `/${h}`)
    )
      throw new AcceptanceError('unavailable-header-assertion')
  }
  if (input.backend) ownedRequestUrl('http://127.0.0.1:1', input.backend.path)
  if (
    input.persistence === 'backend-roundtrip' &&
    (!input.backend || !checkedAfterFresh || !test.assertions.some((a) => a.subject === 'json'))
  )
    throw new AcceptanceError('browser-persistence-unobserved')
  return structuredClone(input)
}

export function ownedBrowserUrl(origin: string, path: string) {
  if (
    !path.startsWith('/') ||
    path.startsWith('//') ||
    /[\\\r\n\0]/.test(path) ||
    /%(?:5c|0[0ad])/i.test(path)
  )
    throw new AcceptanceError('browser-wrong-origin')
  let url: URL
  try {
    url = new URL(path, origin)
  } catch {
    throw new AcceptanceError('browser-invalid-url')
  }
  if (url.origin !== new URL(origin).origin || url.username || url.password)
    throw new AcceptanceError('browser-wrong-origin')
  return url.href
}
