import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { stringify } from 'yaml'
import { CHALLENGE_MODES, challengePlan } from '../../../src/definition/challenge.js'
import {
  type Assertion,
  type Criterion,
  lintCriteria,
  parseCriteria,
} from '../../../src/definition/criteria.js'
import { FlowEngine } from '../../../src/flow/engine.js'
import { SCOPE_SECTIONS } from '../../../src/scopes/contract.js'
import { checkSpec, parseSpec } from '../../../src/spec/contract.js'
import { StateStore } from '../../../src/state/store.js'

const spec = readFileSync(new URL('../../fixtures/spec/spec.md', import.meta.url), 'utf8')
const frame = readFileSync(new URL('../../fixtures/framing/frame.md', import.meta.url), 'utf8')
const assertion = (operator: Assertion['operator'], value: number): Assertion => ({
  subject: 'response-time',
  context: 'authenticated existing order',
  unit: 'ms',
  operator,
  value,
})
const criterion = (id: string, bound?: Assertion): Criterion => ({
  id,
  text: 'Return the order matching the supplied identifier.',
  test: 'Submit a known identifier and compare the returned order ID.',
  ...(bound ? { assertion: bound } : {}),
})
const criteria = [
  criterion('upper', assertion('lt', 200)),
  criterion('lower', assertion('gte', 200)),
]
const criteriaFile = (entries: Criterion[]) =>
  JSON.stringify({ schema: 'wholeloop/criteria@1', criteria: entries })
const scopeFile = `---\n${stringify({ schema: 'wholeloop/scope-plan@1', metricIds: ['retrieval-time'], scopes: [{ key: 'main', title: 'Order search', goal: 'Retrieve orders by ID', metrics: ['retrieval-time'], delivery: { mode: 'feature', flag: 'orders_search_v1' }, complexity: { level: 'simple', why: 'One endpoint' } }] })}---\n${SCOPE_SECTIONS.map((section) => `## ${section}\n\nOwner reviews the cut.\n`).join('\n')}`

describe('deterministic criteria lint', () => {
  it('checks labelled good and bad definition fixtures with identical dial coverage', () => {
    const good = readFileSync(
      new URL('../../fixtures/definition/good.json', import.meta.url),
      'utf8',
    )
    const bad = readFileSync(
      new URL('../../fixtures/definition/contradictory.json', import.meta.url),
      'utf8',
    )
    expect(lintCriteria(parseCriteria(JSON.parse(good)))).toEqual([])
    const findings = (['supportive', 'balanced', 'adversarial'] as const).map(
      (challenge) => challengePlan('criteria', bad, { challenge }).problems,
    )
    expect(findings[0]?.[0]).toContain('contradictory')
    expect(findings).toEqual([findings[0], findings[0], findings[0]])
  })

  it.each([
    ['lt', 10, 'gte', 10, true],
    ['lte', 10, 'gt', 10, true],
    ['gt', 10, 'lt', 9, true],
    ['gte', 10, 'lte', 10, false],
    ['gte', 9, 'lte', 10, false],
    ['gt', 10, 'gt', 20, false],
    ['eq', 10, 'ne', 10, true],
    ['eq', 10, 'eq', 11, true],
    ['ne', 10, 'ne', 11, false],
    ['ne', 10, 'lt', 10, false],
    ['eq', 10, 'lte', 10, false],
    ['eq', 10, 'lt', 10, true],
    ['lt', 10, 'eq', 10, true],
    ['lt', -1, 'gte', -1, true],
  ] as const)('checks %s %s against %s %s', (a, av, b, bv, conflict) => {
    const findings = lintCriteria([
      criterion('a', assertion(a, av)),
      criterion('b', assertion(b, bv)),
    ])
    expect(findings.some((finding) => finding.rule === 'contradictory-pair')).toBe(conflict)
  })

  it('does not infer equivalence across contexts, units, subjects or free text', () => {
    for (const change of [
      { context: 'unauthorized order' },
      { unit: 'seconds' },
      { subject: 'queue-time' },
    ]) {
      expect(
        lintCriteria([
          criterion('a', assertion('lt', 10)),
          criterion('b', { ...assertion('gt', 20), ...change }),
        ]),
      ).toEqual([])
    }
    expect(
      lintCriteria([
        { ...criterion('a'), text: 'Always return success' },
        { ...criterion('b'), text: 'Never return success' },
      ]),
    ).toEqual([])
    expect(lintCriteria([{ ...criterion('a'), text: 'Show the breakfast order ID' }])).toEqual([])
  })

  it('rejects vague wording, whitespace tests, duplicate IDs and unnamed assertions', () => {
    expect(
      lintCriteria([
        { ...criterion('a'), text: 'The interface is fast and intuitive', test: ' ' },
        criterion('a', { ...assertion('lt', 10), unit: ' ' }),
      ]).map((finding) => finding.rule),
    ).toEqual(['vague-wording', 'missing-test', 'duplicate-id', 'invalid-assertion'])
    expect(() =>
      parseCriteria({
        schema: 'wholeloop/criteria@1',
        criteria: [{ ...criterion('a'), assertion: { ...assertion('lt', 10), value: 'ten' } }],
      }),
    ).toThrow('expected number')
  })

  it('enforces structural contradictions on spec completion without mutating the journal', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wholeloop-criteria-'))
    try {
      const parsed = parseSpec(spec)
      const story = parsed.stories[0]
      if (!story) throw new Error('Expected story')
      story.criteria = criteria
      const content = `---\n${stringify(parsed)}---\n${spec.replace(/^---\n[\s\S]*?\n---\n/, '')}`
      expect(checkSpec(content).join('\n')).toContain('contradictory numeric assertions')
      const engine = new FlowEngine(
        new StateStore(join(dir, 'state')),
        dir,
        join(dir, 'user.yml'),
        dir,
      )
      const id =
        engine.begin('write-spec', {
          input: 'Order search',
          owner: 'Alex',
          impact: 'Reduce retrieval time',
        }).payload.subject?.id ?? ''
      const before = engine.store.events()
      expect(() => engine.complete('write-spec', id, content)).toThrow('contradictory')
      expect(engine.store.events()).toEqual(before)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('challenger modes and style', () => {
  const inputs = {
    problem: frame,
    spec,
    criteria: criteriaFile([criterion('a')]),
    scopes: scopeFile,
  }
  for (const mode of CHALLENGE_MODES) {
    it(`${mode} preserves coverage and findings across challenge dials`, () => {
      const plans = (['supportive', 'balanced', 'adversarial'] as const).map((challenge) =>
        challengePlan(mode, inputs[mode], { challenge }),
      )
      expect(plans.map((plan) => plan.instructions)).toMatchSnapshot()
      expect(plans.map((plan) => plan.style.questions)).toEqual([1, 2, 3])
      expect(plans.map((plan) => plan.problems)).toEqual([[], [], []])
      for (const plan of plans) {
        expect(plan.coverage).toEqual(plans[0]?.coverage)
        expect(plan.source).toEqual(plans[0]?.source)
      }
    })
  }

  it('reports malformed input and missing sections without asserting semantic approval', () => {
    expect(challengePlan('criteria', '{', { challenge: 'balanced' }).problems).toHaveLength(1)
    expect(challengePlan('problem', '# Empty', { challenge: 'supportive' }).problems).toHaveLength(
      9,
    )
    expect(
      challengePlan('criteria', criteriaFile(criteria), { challenge: 'adversarial' }).problems.join(
        '\n',
      ),
    ).toContain('contradictory')
    const plan = challengePlan('scopes', scopeFile, {
      challenge: 'balanced',
      context: { sourceSpec: 'current.md', metrics: ['retrieval-time'], stories: [] },
    })
    expect(plan.problems.join('\n')).toContain('pin the current')
  })

  it('runs every mode and structural failure through the compiled CLI without state writes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wholeloop-challenge-'))
    try {
      const cli = (...args: string[]) => {
        const response = spawnSync(process.execPath, [resolve('dist/wl.mjs'), ...args, '--json'], {
          cwd: dir,
          env: {
            ...process.env,
            XDG_CONFIG_HOME: join(dir, 'config'),
            XDG_STATE_HOME: join(dir, 'state'),
            WL_WORKSPACE: '',
          },
          encoding: 'utf8',
        })
        return { code: response.status, value: JSON.parse(response.stdout) }
      }
      expect(cli('challenge', 'schema').value.criteriaSchema.$id).toBe('wholeloop/criteria@1')
      for (const mode of CHALLENGE_MODES) {
        const file = join(dir, `${mode}.txt`)
        writeFileSync(file, inputs[mode])
        expect(cli('challenge', 'plan', mode, '--file', file)).toMatchObject({
          code: 0,
          value: { mode, problems: [] },
        })
      }
      const file = join(dir, 'invalid.json')
      writeFileSync(file, criteriaFile(criteria))
      expect(
        cli('challenge', 'plan', 'criteria', '--file', file, '--challenge', 'adversarial'),
      ).toMatchObject({ code: 4, value: { style: { questions: 3 } } })
      expect(cli('challenge', 'plan', 'unknown', '--file', file).code).toBe(2)
      expect(new StateStore(join(dir, 'state/wholeloop')).events()).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
