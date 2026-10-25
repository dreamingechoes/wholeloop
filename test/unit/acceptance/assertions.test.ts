import { expect, it } from 'vitest'
import { type BehaviorObservation, observeAssertion } from '../../../src/acceptance/assertions.js'
import { behaviorInput, ownedRequestUrl } from '../../../src/acceptance/behavior-input.js'
import type { AcceptanceAssertion } from '../../../src/acceptance/contracts.js'
import { acceptanceFixture } from '../../support/acceptance.js'
import { entry } from '../../support/delivery.js'

const response = (json: unknown): BehaviorObservation => ({
  requests: [
    {
      id: 'request',
      status: 200,
      headers: { 'content-type': 'application/json' },
      text: JSON.stringify(json),
      json,
    },
  ],
})
const assertion = (
  expected: string,
  operator: AcceptanceAssertion['operator'] = 'equals',
): AcceptanceAssertion => ({
  id: 'value',
  description: 'Observe the exact JSON field.',
  subject: 'json',
  operator,
  path: '/value',
  ...(['present', 'absent'].includes(operator) ? {} : { expected }),
})
it('keeps excluded or unobserved header projections unavailable instead of proving absence', () => {
  const excluded: AcceptanceAssertion = {
    id: 'cookie',
    description: 'Observe a header.',
    subject: 'header',
    operator: 'absent',
    path: '/set-cookie',
  }
  expect(observeAssertion(excluded, response({})).status).toBe('unavailable')
  expect(observeAssertion({ ...excluded, path: '' }, response({})).status).toBe('unavailable')
  expect(observeAssertion({ ...excluded, path: '/etag' }, response({})).status).toBe('passed')
})
it('refuses excluded header assertions before dispatch while allowing an explicitly observed header', () =>
  acceptanceFixture(async ({ plan }) => {
    const test = entry(plan.cases, 0)
    test.runner.input = JSON.stringify({
      schema: 'wholeloop/behavior-input@1',
      kind: 'api',
      service: 'web',
      steps: [{ id: 'read', kind: 'request', method: 'GET', path: '/' }],
    })
    test.assertions = [
      {
        id: 'header',
        description: 'Observe the exact header.',
        subject: 'header',
        operator: 'absent',
        path: '/set-cookie',
      },
    ]
    expect(() => behaviorInput(test)).toThrow('unavailable-header-assertion')
    entry(test.assertions, 0).path = '/etag'
    expect(() => behaviorInput(test)).not.toThrow()
  }))
it.each([
  [{ value: 0 }, '0', 'passed'],
  [{}, '0', 'failed'],
  [{ value: null }, '0', 'failed'],
  [{ value: '' }, '""', 'passed'],
  [{}, '""', 'failed'],
  [{ value: null }, 'null', 'passed'],
] as const)(
  'preserves missing, zero, null and empty values (%j versus %s)',
  (json, expected, status) => {
    expect(observeAssertion(assertion(expected), response(json)).status).toBe(status)
  },
)
it('distinguishes absent JSON properties from an invalid JSON response', () => {
  expect(observeAssertion(assertion('', 'absent'), response({})).status).toBe('passed')
  expect(
    observeAssertion(assertion('', 'absent'), {
      requests: [{ id: 'request', status: 200, headers: {}, text: '{incomplete', jsonError: true }],
    }).status,
  ).toBe('failed')
  expect(observeAssertion(assertion('', 'absent'), { requests: [] }).status).toBe('unavailable')
})
it('observes negative exits and stderr without coercing failed versus missing processes into zero', () => {
  const test: AcceptanceAssertion = {
    id: 'exit',
    description: 'The CLI rejects empty input.',
    subject: 'exit',
    operator: 'equals',
    expected: '7',
  }
  expect(
    observeAssertion(test, {
      application: { code: 7, stdout: '', stderr: 'Invalid title.' },
      requests: [],
    }).status,
  ).toBe('passed')
  expect(observeAssertion({ ...test, expected: '0' }, { requests: [] }).status).toBe('unavailable')
  expect(
    observeAssertion(
      { ...test, subject: 'stderr', operator: 'contains', expected: '"Invalid"' },
      { application: { code: 7, stdout: '', stderr: 'Invalid title.' }, requests: [] },
    ).status,
  ).toBe('passed')
})
it('selects exact request steps and keeps unavailable semantic assertions unavailable', () => {
  const observed = response({ value: 0 })
  observed.requests.push({
    id: 'after',
    status: 200,
    headers: {},
    text: '{"value":1}',
    json: { value: 1 },
  })
  expect(observeAssertion(assertion('0'), observed, 'request').status).toBe('passed')
  expect(observeAssertion(assertion('0'), observed, 'after').status).toBe('failed')
  expect(
    observeAssertion({ ...assertion('', 'absent'), subject: 'semantic' }, observed).status,
  ).toBe('unavailable')
})
it.each([
  '//example.test/tasks',
  'https://example.test/tasks',
  '/\\example.test/tasks',
  '/%5cexample.test',
  '/tasks#hidden',
  '/tasks%0aheader',
])('refuses non-owned or ambiguous URL %s', (path) => {
  expect(() => ownedRequestUrl('http://127.0.0.1:1234', path)).toThrow()
})
it('accepts a relative owned path with exact query bytes', () => {
  expect(ownedRequestUrl('http://127.0.0.1:1234', '/tasks?count=0')).toBe(
    'http://127.0.0.1:1234/tasks?count=0',
  )
})
it('validates a fixed behavior host input and refuses prototype or unsupported assertion paths', () =>
  acceptanceFixture(async ({ plan }) => {
    const test = entry(plan.cases, 0)
    test.runner.input = JSON.stringify({
      schema: 'wholeloop/behavior-input@1',
      kind: 'api',
      service: 'web',
      steps: [{ id: 'find', kind: 'request', method: 'GET', path: '/tasks' }],
    })
    expect(behaviorInput(test).steps).toHaveLength(1)
    entry(test.assertions, 0).path = '/__proto__/value'
    expect(() => behaviorInput(test)).toThrow('unsafe-assertion-path')
    entry(test.assertions, 0).path = '/ids'
    entry(test.assertions, 0).subject = 'semantic'
    expect(() => behaviorInput(test)).toThrow('unsupported-behavior-assertion')
  }))
