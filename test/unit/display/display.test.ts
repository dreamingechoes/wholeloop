// Synthetic observations exercise presentation independently of native accounts and worker quota.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bundledCanonical } from '../../../src/adapters/canonical.js'
import { ADAPTERS, generateAdapter } from '../../../src/adapters/generate.js'
import { COMMANDS } from '../../../src/cli/commands.js'
import { emitStep } from '../../../src/cli/presentation.js'
import { validate } from '../../../src/config/schema.js'
import { progressText, renderDisplay } from '../../../src/display/render.js'
import schema from '../../../src/display/schemas/display-v1.json' with { type: 'json' }
import { isStepCommand, STEP_LABELS, stepDisplay } from '../../../src/display/step.js'
import { bannedTerms } from '../../../src/display/terms.js'
import { beginPlan, flowPlan } from '../../../src/flow/plan.js'
import { STEPS } from '../../../src/flow/registry.js'
import { event } from '../../../src/state/events.js'

describe('one core display for every step', () => {
  it.each(STEPS)('$name retains its layout and omits internal preparation', (step) => {
    const begin = stepDisplay(
      'step begin',
      beginPlan(step, { input: 'Find past orders', owner: 'Alex' }),
      [step.name],
    )
    const prefixes = {
      brief: 'brief',
      initiative: 'init',
      scope: 'scope',
      slice: 'slice',
      part: 'part',
      review: 'review',
    }
    const subject = `${prefixes[step.kind]}-00000000`
    const run = 'run-0000000000000000'
    const artifact = `items/${subject}/artifacts/${step.name}/${run}.md`
    const completed = event(
      subject,
      {
        type: 'step.completed',
        data: {
          step: step.name,
          run,
          artifact: { path: artifact, content: '# Formatting fixture' },
        },
      },
      '2026-11-21T12:00:00.000Z',
    )
    const complete = stepDisplay('step complete', {
      schema: 'wholeloop/step-complete@1',
      step: step.name,
      subject,
      artifact,
      receipt: { undo: 'Internal storage detail.' },
      next: flowPlan([completed], subject),
    })
    for (const display of [begin, complete]) {
      expect(validate(display, schema)).toEqual([])
      expect(bannedTerms(display.text)).toEqual([])
      expect(display.text).not.toMatch(/"schema"|Style|preflight|Internal storage detail/)
      expect(display.text.split('\n').every((line) => [...line].length <= 80)).toBe(true)
    }
    expect({ begin, complete }).toMatchSnapshot()
  })

  it.each(COMMANDS.filter(({ path }) => isStepCommand(path)))(
    '$path preserves every machine field and adds the same human text',
    ({ path, schema: id }) => {
      const payload = {
        schema: id,
        subject: 'item-fixture',
        status: 'planned',
        opaque: { basis: 'a'.repeat(64) },
      }
      const outputs: string[] = []
      const io = { out: (text: string) => outputs.push(text), err: () => {} }
      emitStep(path, payload, io, true)
      const result = JSON.parse(outputs.pop() ?? '')
      expect(result).toMatchObject(payload)
      expect(validate(result.display, schema)).toEqual([])
      emitStep(path, payload, io, false)
      expect(outputs.pop()).toBe(result.display.text)
      expect(result.display.text).not.toContain('aaaaaa')
    },
  )

  it('retains a chosen source limitation and the source selection in the plan display', () => {
    const display = stepDisplay('research plan', {
      schema: 'wholeloop/research-plan@1',
      status: 'planned',
      selection: { sources: ['native-code', 'metrics'] },
      openQuestions: [
        {
          question: 'What evidence can metrics provide?',
          missing: 'No validated query is available',
          who: 'Alex',
        },
      ],
      jobs: [],
    })
    expect(display.rows).toContainEqual({ label: 'Sources', value: 'native-code · metrics' })
    expect(display.open).toContain(
      'What evidence can metrics provide? — No validated query is available',
    )
    expect(display.text).not.toContain('PASS')
  })

  it('shows a recorded build plan and its unresolved assumption without inventing approval', () => {
    const display = stepDisplay('build plan', {
      schema: 'wholeloop/build-plan@1',
      subject: 'slice-fixture',
      plan: {
        steps: ['Add an orders filter'],
        tests: ['Reject an inverted range'],
        assumptions: [
          {
            text: 'The API accepts both bounds',
            status: 'unknown',
            evidence: 'Endpoint behavior is not checked',
          },
        ],
      },
      pending: ['approve-build-plan'],
    })
    expect(display.rows).toContainEqual({ label: 'Plan', value: 'Add an orders filter' })
    expect(display.rows).toContainEqual({ label: 'Test', value: 'Reject an inverted range' })
    expect(display.open).toContain('Approve the build plan')
    expect(display.open.join(' ')).toContain('Endpoint behavior is not checked')
    expect(display.next).toEqual([])
  })
  it('preserves measurement actuals and missing evidence, publication pending and unperformed flags', () => {
    const metrics = stepDisplay('measure report', {
      schema: 'wholeloop/impact-report@1',
      metrics: [
        {
          id: 'time',
          name: 'Time to find',
          unit: 's',
          observation: { status: 'observed', value: 18 },
          verdict: 'met',
        },
        {
          id: 'support',
          name: 'Support tickets',
          unit: 'count',
          observation: { status: 'unknown', missing: 'Source is not connected' },
          verdict: 'unknown',
        },
      ],
    })
    expect(metrics.rows).toContainEqual({ label: 'Time to find', value: '18 s · met' })
    expect(metrics.open).toContain('Support tickets: Source is not connected')
    const launch = stepDisplay('launch report', {
      schema: 'wholeloop/launch-report@1',
      publication: [
        {
          key: 'support',
          title: 'Support guide',
          path: 'launch/support.md',
          status: 'pending',
          provider: 'docs',
          operation: 'docs.create',
          sent: false,
        },
      ],
    })
    expect(launch.open).toContain('Support guide: publication pending.')
    expect(launch.produced).toContain('launch/support.md')
    const ramp = stepDisplay('ramp report', {
      schema: 'wholeloop/ramp-report@1',
      recommendation: 'hold',
      changedFlag: false,
    })
    expect(ramp.rows).toContainEqual({ label: 'Recommendation', value: 'hold' })
    expect(ramp.rows).toContainEqual({ label: 'Flag change', value: 'Not performed' })
    const learning = stepDisplay('learn decide', {
      schema: 'wholeloop/learning-decision@1',
      report: { decision: { outcome: 'iterate', reason: 'The target was not met' } },
    })
    expect(learning.rows).toContainEqual({ label: 'Decision', value: 'iterate' })
    expect(learning.rows).toContainEqual({ label: 'Reason', value: 'The target was not met' })
    expect({ metrics, launch, ramp, learning }).toMatchSnapshot()
  })

  it('preserves unrelated machine formats and refuses malformed step payloads', () => {
    const outputs: string[] = []
    const io = { out: (text: string) => outputs.push(text), err: () => {} }
    const payload = { schema: 'wholeloop/docs-check@1', problems: [] }
    emitStep('docs check', payload, io, true)
    expect(JSON.parse(outputs.pop() ?? '')).toEqual(payload)
    for (const value of [null, 'not JSON', [], {}])
      expect(() => emitStep('research plan', value, io, true)).toThrow()
  })
  it('serializes opaque machine data once and never inspects it for human text', () => {
    let reads = 0
    const payload = {
      schema: 'wholeloop/research-submit@1',
      subject: 'brief-fixture',
      opaque: {
        get observation() {
          reads++
          return 'retained'
        },
      },
    }
    const outputs: string[] = []
    const io = { out: (text: string) => outputs.push(text), err: () => {} }
    emitStep('research submit', payload, io, true)
    expect(reads).toBe(1)
    expect(outputs).toHaveLength(1)
    expect(JSON.parse(outputs[0] ?? '').opaque.observation).toBe('retained')
    reads = 0
    emitStep('research submit', payload, io, false)
    expect(reads).toBe(0)
    expect(outputs).toHaveLength(2)
  })

  it('keeps the answer first, uncertainty explicit and a pending decision out of Next', () => {
    const display = stepDisplay('research complete', {
      schema: 'wholeloop/research-complete@1',
      receipt: {
        subject: 'brief-fixture',
        answer: 'Filters hide old orders.',
        recommendation: 'Add search.',
        confidence: 'low',
        notChecked: ['No time-to-find baseline.'],
        artifact: 'brief.md',
        next: { next: 'write-spec', available: true, pending: [{ id: 'approve-spec' }] },
      },
      profile: { style: 'Do not show this.' },
      bindings: { private: true },
      preflight: ['Do not show this.'],
    })
    expect(display.rows.slice(0, 3)).toEqual([
      { label: 'Answer', value: 'Filters hide old orders.' },
      { label: 'Recommendation', value: 'Add search.' },
      { label: 'Confidence', value: 'low' },
    ])
    expect(display.open).toEqual(['No time-to-find baseline.', 'Approve the specification'])
    expect(display.next).toEqual([])
    expect(display.text).not.toContain('Do not show this.')
    expect(display).toMatchSnapshot()
  })

  it('retains failed findings, missing observations, source choices and unconnected providers', () => {
    const gate = stepDisplay('gate verdict', {
      schema: 'wholeloop/gate-verdict@1',
      gate: 'verify',
      verdict: 'FAIL',
      current: false,
      report: { missing: ['AC-2'], kept: [{ finding: { text: 'The end date is excluded.' } }] },
    })
    expect(gate.text).toContain('FAIL')
    expect(gate.text).toContain('AC-2')
    expect(gate.open).toContain('The end date is excluded.')
    expect(gate.open).toContain('The observed work has changed; check it again before continuing.')
    const sources = stepDisplay('research plan', {
      schema: 'wholeloop/research-sources@1',
      status: 'needs-sources',
      candidates: [
        { id: 'native-web', name: 'Web', access: 'native' },
        { id: 'analytics', name: 'Analytics', access: 'configured in another client' },
      ],
      unusable: [
        { server: 'extra', label: 'not usable yet', guide: 'docs/extending/providers.md' },
      ],
      jobs: [],
    })
    expect(sources.text).toContain('configured in another client')
    expect(sources.open).toEqual([
      'extra: not usable yet; docs/extending/providers.md',
      'Which sources may I use, and where should I remember your choice?',
    ])
    expect({ gate, sources }).toMatchSnapshot()
  })
})

describe('bounded progress and terminal text', () => {
  it.each(['running', 'finished', 'failed', 'unavailable'] as const)(
    '%s is one observed line with elapsed time',
    (status) => {
      const progress = { label: 'AC-1', status, elapsedMs: 65123 }
      const display = renderDisplay({
        header: '',
        rows: [],
        progress: [progress],
        produced: [],
        open: [],
        next: [],
      })
      expect(display.text).toBe(progressText(progress))
      expect(display.text).toBe(`AC-1 — ${status} · 1:05`)
      expect(validate(display, schema)).toEqual([])
      expect(display).toMatchSnapshot()
    },
  )
  it('wraps long prose, paths and wide text without terminal escape or layout injection', () => {
    const display = renderDisplay({
      header: '\u001b[31mResearch\u001b[0m\nInjected',
      rows: [
        { label: 'An unusually long source name', value: '界'.repeat(90) },
        { label: 'Answer', value: 'e\u0301'.repeat(150) },
      ],
      produced: ['a/'.repeat(150)],
      open: ['\u0000Unavailable\rResult'],
      next: [],
    })
    expect(display.header).toBe('Research Injected')
    expect(display.open).toEqual(['Unavailable Result'])
    expect(display.text).not.toContain('\u001b')
    expect(display.text).toContain('An unusually long source name')
    for (const line of display.text.split('\n').filter((line) => line.includes('界')))
      expect(
        [...line].reduce((width, char) => width + (char === '界' ? 2 : 1), 0),
      ).toBeLessThanOrEqual(80)
    const line = progressText({ label: '界'.repeat(100), status: 'finished', elapsedMs: 0 })
    expect(line).toContain('… — finished · 0:00')
    expect(line.split('\n')).toHaveLength(1)
  })
  it('aligns values after wide labels by terminal cells', () => {
    const display = renderDisplay({
      header: 'Sources',
      rows: [
        { label: '界', value: 'native' },
        { label: 'Owner', value: 'Alex' },
      ],
      produced: [],
      open: [],
      next: [],
    })
    expect(display.text.split('\n').slice(1)).toEqual(['界       native', 'Owner    Alex'])
  })
  it('wraps ordinary prose at word boundaries instead of splitting a final word', () => {
    const display = renderDisplay({
      header: 'Research',
      rows: [
        {
          label: 'Answer',
          value: 'Returning customers need search and filters to find older orders.',
        },
        {
          label: 'Recommendation',
          value: 'Add search to the orders list, then measure time to find an order.',
        },
      ],
      produced: [],
      open: [],
      next: [],
    })
    expect(display.text).toContain('older\n                 orders.')
    expect(display.text).not.toMatch(/order\ns|ord\n/)
  })
  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, 0.1, Number.MAX_SAFE_INTEGER + 1])(
    'refuses invalid elapsed time %s',
    (elapsedMs) => {
      expect(() => progressText({ label: 'AC-1', status: 'finished', elapsedMs })).toThrow()
    },
  )
})

it.each(STEPS)(
  'compiled $name starts with the same human and JSON display in an empty fixture home',
  (step) => {
    const directory = mkdtempSync(join(tmpdir(), 'wholeloop-display-'))
    try {
      const env = {
        ...process.env,
        HOME: directory,
        XDG_STATE_HOME: join(directory, 'state'),
        XDG_CONFIG_HOME: join(directory, 'config'),
        CODEX_HOME: join(directory, 'codex'),
        GEMINI_CLI_HOME: directory,
        COPILOT_HOME: join(directory, 'copilot'),
        WL_WORKSPACE: '',
        NO_COLOR: '1',
      }
      const call = (json: boolean) =>
        spawnSync(
          process.execPath,
          [resolve('dist/wl.mjs'), 'step', 'begin', step.name, ...(json ? ['--json'] : [])],
          { cwd: directory, env, encoding: 'utf8' },
        )
      const machine = call(true),
        human = call(false)
      expect(machine.status, machine.stderr).toBe(2)
      expect(human.status, human.stderr).toBe(2)
      const result = JSON.parse(machine.stdout)
      expect(validate(result.display, schema)).toEqual([])
      expect(result.display.header).toBe(STEP_LABELS[step.name])
      if (result.schema === 'wholeloop/error@1') {
        expect(human.stderr).toContain(result.message)
        expect(human.stdout).toBe('')
      } else expect(human.stdout.trimEnd()).toBe(result.display.text)
      expect(human.stdout).not.toContain('"schema"')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  },
)

it('keeps preparation to one header and retains undo declarations without claiming cleanup', () => {
  const header = renderDisplay({
    header: 'Find orders '.repeat(50),
    rows: [{ label: 'Owner', value: 'Alex' }],
    produced: [],
    open: [],
    next: [],
  })
  expect(header.text.split('\n')).toHaveLength(2)
  expect(header.header).toHaveLength(80)
  const display = stepDisplay('env report', {
    schema: 'wholeloop/env-report@1',
    subject: 'item-fixture',
    entries: [
      {
        write: {
          resource: 'fixture database',
          effect: 'Created a table',
          by: 'Alex',
          undo: { cwd: '/tmp/fixture', argv: ['fixture-db', 'drop', 'orders archive'] },
        },
      },
    ],
    executed: false,
  })
  expect(display.text).toContain('Created a table')
  expect(display.text).toContain('"orders archive"')
  expect(display.open).toContain('Undo commands are declarations; no cleanup was executed.')
  expect(display).toMatchSnapshot()
})

it.each([
  { gate: 'review', adapter: 'invalid-fixture', header: 'Review' },
  { gate: 'verify', adapter: 'review', header: 'Verify' },
])(
  'compiled $gate errors use the requested step without mistaking an adapter for the gate',
  ({ gate, adapter, header }) => {
    const directory = mkdtempSync(join(tmpdir(), 'wholeloop-display-error-'))
    try {
      const result = spawnSync(
        process.execPath,
        [
          resolve('dist/wl.mjs'),
          'fanout',
          'run',
          gate,
          '--for',
          'review-ffffffff',
          '--engine',
          'headless',
          '--adapter',
          adapter,
          '--json',
        ],
        {
          cwd: directory,
          env: { ...process.env, HOME: directory, XDG_STATE_HOME: join(directory, 'state') },
          encoding: 'utf8',
        },
      )
      expect(result.status).toBe(3)
      expect(result.stderr).toBe('')
      const payload = JSON.parse(result.stdout)
      expect(payload.schema).toBe('wholeloop/error@1')
      expect(payload.display.header).toBe(header)
      expect(payload.display.open.join(' ')).toContain('other adapters remain unimplemented')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  },
)

it('keeps an unknown check identity neutral instead of guessing verification', () => {
  const display = stepDisplay('gate verdict', {
    schema: 'wholeloop/error@1',
    message: 'Choose a check',
  })
  expect(display.header).toBe('Checks')
})

it('compiled specification checks show every actual problem in human output', () => {
  const directory = mkdtempSync(join(tmpdir(), 'wholeloop-display-spec-'))
  try {
    const file = join(directory, 'spec.md')
    writeFileSync(file, '# Incomplete\n')
    const call = (json: boolean) =>
      spawnSync(
        process.execPath,
        [resolve('dist/wl.mjs'), 'spec', 'check', file, ...(json ? ['--json'] : [])],
        {
          cwd: directory,
          env: { ...process.env, HOME: directory, XDG_STATE_HOME: join(directory, 'state') },
          encoding: 'utf8',
        },
      )
    const machine = call(true),
      human = call(false)
    expect(machine.status, machine.stderr).toBe(4)
    expect(human.status, human.stderr).toBe(4)
    const result = JSON.parse(machine.stdout)
    expect(result.problems).toContain('Missing or empty required section: Problem')
    expect(human.stdout.trimEnd()).toBe(result.display.text)
    for (const problem of result.problems)
      expect(human.stdout.replace(/\s+/g, ' ')).toContain(problem)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

it('compiled native progress formats observations without creating a store', () => {
  const directory = mkdtempSync(join(tmpdir(), 'wholeloop-progress-'))
  try {
    const call = (extra: string[]) =>
      spawnSync(
        process.execPath,
        [
          resolve('dist/wl.mjs'),
          'display',
          'progress',
          '--step',
          'research',
          '--worker',
          'Web',
          '--elapsed-ms',
          '65123',
          ...extra,
        ],
        {
          cwd: directory,
          env: { ...process.env, HOME: directory, XDG_STATE_HOME: directory },
          encoding: 'utf8',
        },
      )
    const result = call(['--json'])
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout).display.text).toBe('Web — finished · 1:05')
    expect(call([]).stdout.trim()).toBe('Web — finished · 1:05')
    expect(readdirSync(directory)).toEqual([])
    expect(call(['--elapsed-ms', '-1']).status).not.toBe(0)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

it.each(ADAPTERS)(
  '$id ships the same verbatim display and completion policy to every skill',
  (adapter) => {
    const generated = generateAdapter(
      adapter.id,
      bundledCanonical(),
      '#!/usr/bin/env node\nconsole.log("fixture core")\n',
      '0.0.0',
    )
    const policy = generated.files.get('resources/protocols/output-contract.md')?.content ?? ''
    expect(policy).toContain('show the returned display.text verbatim')
    expect(policy).toContain('never show raw command JSON')
    expect(policy).toContain(
      'Keep coordination acknowledgements and conclusion-writing context private.',
    )
    expect(policy).toContain('one core-formatted line for each observed finish')
    for (const step of STEPS) {
      const skill = generated.files.get(adapter.paths('skill', step.name))?.content ?? ''
      expect(skill, step.name).toContain('output-contract')
      expect(skill, step.name).not.toMatch(/Show the preflight|Show receipt.text|Show the receipt/)
    }
  },
)
