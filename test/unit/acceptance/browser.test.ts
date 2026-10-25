import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { browserInput, ownedBrowserUrl } from '../../../src/acceptance/browser-input.js'
import {
  browserPage,
  browserPng,
  browserTabs,
  browserTarget,
} from '../../../src/acceptance/browser-observation.js'
import {
  BROWSER_REFERENCE,
  browserToolContract,
  validateBrowserTools,
} from '../../../src/acceptance/browser-reference.js'
import tools from '../../fixtures/browser/tools.json' with { type: 'json' }
import { acceptanceFixture } from '../../support/acceptance.js'
import { entry } from '../../support/delivery.js'

const page =
  '### Page\n- Page URL: http://web:3000/\n### Snapshot\n```yaml\n- heading "Task list" [ref=e1]\n- textbox "Task title" [ref=e2]\n- button "Add task" [ref=e3]\n```'
describe('grounded native browser observations', () => {
  it('selects exact observed roles and names without interpreting selectors or guessing duplicate controls', () => {
    const observed = browserPage(page, 'http://web:3000')
    expect(browserTarget(observed.snapshot, { role: 'textbox', name: 'Task title' })).toBe('e2')
    expect(() => browserTarget(observed.snapshot, { role: 'textbox', name: '.*' })).toThrow(
      'missing-or-ambiguous',
    )
    expect(() =>
      browserTarget(`${observed.snapshot}\n- textbox "Task title" [ref=e4]`, {
        role: 'textbox',
        name: 'Task title',
      }),
    ).toThrow('missing-or-ambiguous')
  })
  it.each([
    page.replace('http://web:3000/', 'http://foreign:3000/'),
    page.replace('### Snapshot', '- Page URL: http://web:3000/\n### Snapshot'),
    page.replace('```yaml', '[truncated]\n```yaml'),
    page.replace('```yaml', '```json'),
    page.slice(0, -3),
  ])('refuses incomplete, duplicated or foreign native page metadata', (text) => {
    expect(() => browserPage(text, 'http://web:3000')).toThrow()
  })
  it('requires one owned current tab and refuses stale or foreign context projections', () => {
    expect(
      browserTabs('### Result\n- 0: (current) [Task list](http://web:3000/)', 'http://web:3000'),
    ).toBe('http://web:3000/')
    expect(() =>
      browserTabs(
        '### Result\n- 0: (current) [Task list](http://foreign:3000/)',
        'http://web:3000',
      ),
    ).toThrow('wrong-origin')
    expect(() =>
      browserTabs(
        '### Result\n- 0: (current) [](http://web:3000/)\n- 1: [](http://web:3000/)',
        'http://web:3000',
      ),
    ).toThrow('context-unobserved')
    expect(() =>
      browserTabs('### Result\n- 1: (current) [](http://web:3000/)', 'http://web:3000'),
    ).toThrow('context-unobserved')
  })
  it.each([
    '//foreign/path',
    'https://foreign/path',
    '/\\foreign',
    '/bad\nheader',
    '/%0apath',
    '/%5cforeign',
  ])('refuses an unowned browser route %j', (path) => {
    expect(() => ownedBrowserUrl('http://web:3000', path)).toThrow()
  })
  it('compares canonical default HTTP ports without treating an owned page as foreign', () => {
    expect(ownedBrowserUrl('http://web:80', '/')).toBe('http://web/')
    expect(
      browserPage(page.replaceAll('http://web:3000/', 'http://web/'), 'http://web:80').url,
    ).toBe('http://web/')
    expect(browserTabs('### Result\n- 0: (current) [](http://web/)', 'http://web:80')).toBe(
      'http://web/',
    )
  })
  it('preserves an explicitly declared SPA hash route and query', () => {
    expect(ownedBrowserUrl('http://web:3000', '/?title=two#/tasks')).toBe(
      'http://web:3000/?title=two#/tasks',
    )
  })
  it('validates an actual isolated-browser PNG and rejects partial or mislabelled captures', () => {
    const bytes = readFileSync('test/fixtures/browser/page.png')
    const actual = browserPng(bytes.toString('base64'), 'image/png')
    expect(actual.bytes.equals(bytes)).toBe(true)
    expect(actual.width).toBeGreaterThan(0)
    expect(actual.height).toBeGreaterThan(0)
    const corrupted = Buffer.from(bytes)
    corrupted[50] = (corrupted[50] ?? 0) ^ 1
    expect(() => browserPng(corrupted.toString('base64'), 'image/png')).toThrow(
      'capture-incomplete',
    )
    expect(() => browserPng(bytes.subarray(0, -12).toString('base64'), 'image/png')).toThrow(
      'capture-incomplete',
    )
    expect(() => browserPng(bytes.toString('base64'), 'image/jpeg')).toThrow('capture-unavailable')
    expect(() => browserPng(`${bytes.toString('base64')}!`, 'image/png')).toThrow(
      'capture-incomplete',
    )
  })
})

describe('reviewed MCP schema binding', () => {
  it('matches the observed reference constraints without importing tool-description prose', () => {
    expect(() =>
      validateBrowserTools(tools.server, tools.tools, BROWSER_REFERENCE.digest),
    ).not.toThrow()
    const first = entry(tools.tools, 0)
    expect(
      browserToolContract({
        ...first,
        inputSchema: { ...first.inputSchema, description: 'Different prose only.' },
      }),
    ).toBe(browserToolContract(first))
  })
  it.each(['missing', 'duplicate', 'changed', 'version', 'digest'] as const)(
    'refuses %s reference metadata',
    (mode) => {
      const observed = structuredClone(tools)
      if (mode === 'missing') observed.tools.pop()
      if (mode === 'duplicate') observed.tools.push(structuredClone(entry(observed.tools, 0)))
      if (mode === 'changed') entry(observed.tools, 0).inputSchema.required = ['new-argument']
      if (mode === 'version') observed.server.version = 'unknown'
      expect(() =>
        validateBrowserTools(
          observed.server,
          observed.tools,
          mode === 'digest' ? '0'.repeat(64) : BROWSER_REFERENCE.digest,
        ),
      ).toThrow()
    },
  )
  it('binds actual constraint fields named title or description rather than discarding their schemas', () => {
    const tool = {
      name: 'fixture',
      inputSchema: {
        type: 'object',
        properties: { title: { type: 'string' }, description: { type: 'string' } },
      },
    }
    const title = structuredClone(tool)
    title.inputSchema.properties.title.type = 'number'
    const description = structuredClone(tool)
    description.inputSchema.properties.description.type = 'number'
    expect(browserToolContract(title)).not.toBe(browserToolContract(tool))
    expect(browserToolContract(description)).not.toBe(browserToolContract(tool))
  })
})

it('pins literal UI actions and refuses screenshots, hidden injection or manufactured persistence as acceptance', () =>
  acceptanceFixture(async ({ plan }) => {
    const test = entry(plan.cases, 0)
    test.runner = { kind: 'browser', capability: 'browser.journey', input: '' }
    test.assertions = [
      {
        id: 'created',
        description: 'Observe the task through the actual UI.',
        subject: 'state',
        operator: 'equals',
        path: '/checks/created',
        expected: 'true',
      },
    ]
    const valid = {
      schema: 'wholeloop/browser-input@1',
      service: 'web',
      port: 3000,
      browser: {
        service: 'browser',
        reference: BROWSER_REFERENCE.id,
        tools: BROWSER_REFERENCE.digest,
      },
      grounding: [{ file: 'design', sha256: 'a'.repeat(64) }],
      persistence: 'not-applicable',
      steps: [
        { id: 'open', kind: 'navigate', path: '/' },
        { id: 'clear', kind: 'fill', target: { role: 'textbox', name: 'Task title' }, text: '' },
        { id: 'check', kind: 'check', assertion: 'created', text: 'Durable task', mode: 'present' },
      ],
    }
    test.runner.input = JSON.stringify(valid)
    expect(browserInput(test).steps[1]?.text).toBe('')
    for (const invalid of [
      {
        ...valid,
        steps: [
          { id: 'open', kind: 'navigate', path: '/' },
          { id: 'capture', kind: 'capture', label: 'screen' },
        ],
      },
      { ...valid, persistence: 'backend-roundtrip' },
      {
        ...valid,
        steps: [...valid.steps, { id: 'inject', kind: 'evaluate', text: 'window.hidden=true' }],
      },
      { ...valid, steps: [...valid.steps, valid.steps[0]] },
      { ...valid, device: 'unsupported-phone' },
      { ...valid, browser: { ...valid.browser, port: 8931 } },
    ]) {
      test.runner.input = JSON.stringify(invalid)
      expect(() => browserInput(test)).toThrow()
    }
    test.runner.input = JSON.stringify(valid)
    entry(test.assertions, 0).expected = 'false'
    expect(() => browserInput(test)).toThrow('unsupported-browser-state-assertion')
  }))
