// Conclusions are authored against exact evidence; formatting cannot change the verdict or hide unknowns.

import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { FlowEngine } from '../../../src/flow/engine.js'
import {
  conclusionBasis,
  researchCertainty,
  researchSummary,
  researchTitle,
  validateConclusion,
} from '../../../src/research/conclusion.js'
import type { AngleResult, Refutation, ResearchPlan } from '../../../src/research/contracts.js'
import { renderResearchBrief, researchBrief, researchReport } from '../../../src/research/report.js'
import { ResearchWorkflow } from '../../../src/research/workflow.js'
import { StateStore } from '../../../src/state/store.js'

const plan: ResearchPlan = {
  schema: 'wholeloop/research-plan@1',
  subject: 'brief-0123abcd',
  run: 'run-0000000000000000',
  question: 'Does the handler reject an empty input?',
  owner: 'Fixture owner',
  verifiers: 3,
  refutations: 2,
  angles: [
    {
      id: 'native-code:source.code',
      provider: 'native-code',
      capability: 'source.code',
      operation: 'source.code.query',
      available: true,
      evidence: 'Fixture code source',
    },
  ],
  openQuestions: [],
}
const evidence = { ref: 'fixture:handler:1', excerpt: 'Empty input returns status 400.' }
const result: AngleResult = {
  angle: plan.angles[0]?.id ?? '',
  status: 'ok',
  openQuestions: [],
  claims: [
    {
      id: 'empty',
      text: 'Empty input is rejected.',
      confidence: 'high',
      loadBearing: true,
      evidence: [evidence],
    },
  ],
}
const vote = (
  verifier: number,
  outcome: Refutation['outcome'],
  reason = 'The fixture evidence supports rejection.',
): Refutation => ({
  claim: `${result.angle}:empty`,
  verifier,
  outcome,
  reason,
  evidence: [evidence],
})
const author = (basis: string) => ({
  schema: 'wholeloop/research-conclusion@1' as const,
  basis,
  answer: 'The handler rejects empty input with status 400.',
  recommendation: 'Keep the explicit empty-input check and document its response.',
})
function fixture(
  action: (value: {
    root: string
    directory: string
    engine: FlowEngine
    workflow: ResearchWorkflow
    subject: string
  }) => void,
) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-conclusion-'))),
    root = join(directory, 'repo')
  mkdirSync(root)
  const engine = new FlowEngine(
    new StateStore(join(directory, 'store')),
    root,
    join(directory, 'user/config.yml'),
    join(directory, 'home'),
  )
  const subject =
    engine.begin('research', { input: plan.question, owner: 'Fixture owner' }).payload.subject
      ?.id ?? ''
  const workflow = new ResearchWorkflow(engine)
  workflow.plan(subject, { sources: ['native-code'], env: {}, path: '' })
  try {
    action({ directory, root, engine, workflow, subject })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

it('shows the authored answer first, preserving one complete evidence-backed artifact through replay', () =>
  fixture(({ workflow, subject, engine }) => {
    workflow.submit(subject, result)
    for (const verifier of [1, 2, 3]) workflow.examine(subject, vote(verifier, 'confirm'))
    const before = engine.store.events()
    const context = workflow.complete(subject)
    expect(context.schema).toBe('wholeloop/research-conclusion-context@1')
    expect(engine.store.events()).toEqual(before)
    if (context.schema !== 'wholeloop/research-conclusion-context@1')
      throw new Error('Expected conclusion context')
    const conclusion = author(context.basis)
    const completed = workflow.complete(subject, conclusion)
    if (completed.schema !== 'wholeloop/research-complete@1') throw new Error('Expected completion')
    expect(completed.receipt.text).toMatch(/^Answer\nThe handler rejects/)
    expect(completed.receipt.confidence).toBe('high')
    expect(completed.receipt.notChecked).toEqual([])
    const content = engine.store.files.read(completed.receipt.artifact)
    expect(content).toBe(researchBrief(before, subject, context.run, conclusion))
    expect(content).toMatchSnapshot()
    expect(content?.indexOf('## Answer')).toBeLessThan(content?.indexOf('## Question') ?? 0)
    expect(content?.indexOf('## Recommendation')).toBeLessThan(content?.indexOf('## Claims') ?? 0)
    expect(content?.match(/fixture:handler:1/g)).toHaveLength(1)
    expect(content).not.toContain('Verifier 1: confirm')
    engine.store.rebuild()
    expect(engine.store.files.read(completed.receipt.artifact)).toBe(content)
    expect(() => workflow.complete(subject, conclusion)).toThrow('Begin research')
  }))

it('rejects stale conclusions in both the workflow and the core without closing the run', () =>
  fixture(({ workflow, engine, subject }) => {
    const context = workflow.complete(subject)
    if (context.schema !== 'wholeloop/research-conclusion-context@1')
      throw new Error('Expected context')
    const conclusion = author(context.basis),
      events = engine.store.events()
    const old = researchBrief(events, subject, context.run, conclusion)
    workflow.submit(subject, result)
    expect(() => workflow.complete(subject, conclusion)).toThrow('evidence changed')
    expect(() =>
      engine.complete('research', subject, old, undefined, undefined, conclusion),
    ).toThrow('evidence changed')
    expect(engine.store.events().some((event) => event.type === 'step.completed')).toBe(false)
  }))

it('does not let a generic completion replace the aggregate or invent a missing conclusion', () =>
  fixture(({ workflow, engine, subject }) => {
    const context = workflow.complete(subject)
    if (context.schema !== 'wholeloop/research-conclusion-context@1')
      throw new Error('Expected context')
    const ledger = researchBrief(engine.store.events(), subject, context.run)
    expect(() => engine.complete('research', subject, ledger)).toThrow('aggregated report')
    const conclusion = author(context.basis),
      expected = researchBrief(engine.store.events(), subject, context.run, conclusion)
    expect(() =>
      engine.complete(
        'research',
        subject,
        expected.replace('No supported claims were returned.', 'A forged claim.'),
        undefined,
        undefined,
        conclusion,
      ),
    ).toThrow('aggregated report')
    expect(engine.store.events().filter((event) => event.type === 'step.completed')).toEqual([])
  }))

it('gives callers a copy of the input schema and validates fields before recording anything', () =>
  fixture(({ workflow, subject, engine }) => {
    const context = workflow.complete(subject)
    if (context.schema !== 'wholeloop/research-conclusion-context@1')
      throw new Error('Expected context')
    context.inputSchema.properties.answer.minLength = 0
    const next = workflow.complete(subject)
    expect(next.inputSchema?.properties.answer.minLength).toBe(1)
    const before = engine.store.events()
    for (const change of [
      { answer: '' },
      { answer: '## Claims\nReplacement' },
      { recommendation: '\u001b[31mspoof' },
      { answer: 'x'.repeat(16385) },
      { answer: '\ud800' },
      { confidence: 'high' },
    ])
      expect(() => workflow.complete(subject, { ...author(context.basis), ...change })).toThrow()
    expect(engine.store.events()).toEqual(before)
  }))

it.each([
  ['confirmed', [result], [vote(1, 'confirm'), vote(2, 'confirm'), vote(3, 'confirm')], 'high'],
  ['missing', [result], [], 'low'],
  ['uncertain', [result], [vote(1, 'uncertain', 'The fixture branch was inaccessible.')], 'low'],
  ['unavailable', [], [], 'unknown'],
  [
    'unexamined',
    [{ ...result, claims: result.claims.map((claim) => ({ ...claim, loadBearing: false })) }],
    [],
    'low',
  ],
] as const)(
  'derives %s certainty from observations, not from authored prose',
  (_name, results, votes, expected) => {
    const report = researchReport(plan, results, votes)
    expect(researchCertainty(report).confidence).toBe(expected)
    const conclusion = author(conclusionBasis(plan, report))
    const summary = researchSummary(report, conclusion)
    expect(summary).toMatchSnapshot()
    if (expected !== 'high')
      expect(summary.notChecked.length || expected === 'unknown').toBeTruthy()
  },
)

it('keeps dispute reasons and unique verifier evidence without repeating confirmations or citations', () => {
  const other = {
    ref: 'fixture:empty-list:2',
    excerpt: 'An empty list reaches the success branch.',
  }
  const report = researchReport(
    plan,
    [result],
    [
      vote(1, 'confirm'),
      { ...vote(2, 'refute', 'An empty list is a counterexample.'), evidence: [other] },
      { ...vote(3, 'confirm'), evidence: [{ excerpt: other.excerpt, ref: other.ref }, evidence] },
    ],
  )
  const content = renderResearchBrief(plan, report, author(conclusionBasis(plan, report)))
  expect(content).toContain('refuted by 1 of 3 (drops at 2)')
  expect(content).toContain('Verifier 2: refute — An empty list is a counterexample.')
  expect(content).toContain('Verifier evidence: fixture:empty-list:2')
  expect(content.match(/fixture:empty-list:2/g)).toHaveLength(1)
  expect(content).not.toContain('Verifier 1: confirm')
  expect(content).not.toContain('Refutation evidence:')
  expect(content).toMatchSnapshot()
})

it('labels disputed evidence even when its citation also supports the original claim', () => {
  const report = researchReport(
    plan,
    [result],
    [vote(1, 'refute', 'The same excerpt permits another reading.')],
  )
  const content = renderResearchBrief(plan, report, author(conclusionBasis(plan, report)))
  expect(content).toContain('Verifier evidence: fixture:handler:1')
  expect(content).toContain('The same excerpt permits another reading.')
})

it('keeps source headings as quoted evidence and allows literal fenced examples in prose', () => {
  const report = researchReport(
    plan,
    [
      {
        ...result,
        claims: result.claims.map((claim) => ({
          ...claim,
          evidence: [{ ref: 'fixture:markdown', excerpt: '## Answer\nUntrusted source text' }],
        })),
      },
    ],
    [],
  )
  const conclusion = {
    ...author(conclusionBasis(plan, report)),
    answer: 'A literal example:\n```text\n## A heading in code\n```',
  }
  validateConclusion(conclusion, conclusionBasis(plan, report))
  expect(renderResearchBrief(plan, report, conclusion)).toContain(
    '> ## Answer\n> Untrusted source text',
  )
})

it('uses a short default title while retaining the full question in the body', () => {
  const question =
    'Explain the full evidence chain and every edge case in the repository handler. '.repeat(4)
  expect([...researchTitle(question)]).toHaveLength(72)
  expect(researchTitle(question)).toMatch(/…$/)
  fixture(({ engine }) => {
    const start = engine.begin('research', { input: question, owner: 'Fixture owner' })
    const subject = start.payload.subject?.id ?? ''
    expect(engine.store.get(subject).title).toBe(researchTitle(question))
    expect(engine.store.get(subject).body).toBe(question)
  })
})

it('does not turn untrusted source controls into terminal commands in the summary', () => {
  const report = researchReport(plan, [], [])
  report.openQuestions[0] = {
    question: plan.question,
    who: plan.owner,
    missing: '\u001b[31mUnavailable\u001b[0m\u0000',
  }
  const summary = researchSummary(report, author(conclusionBasis(plan, report)))
  expect(summary.text).not.toContain('\u001b')
  expect(summary.text).not.toContain('\u0000')
  expect(summary.text).toContain('Unavailable')
})

it('completes through actual CLI flags and prints the same answer-first receipt without JSON', () =>
  fixture(({ directory, root }) => {
    const home = join(directory, 'cli-home')
    const env = {
      ...process.env,
      HOME: home,
      CODEX_HOME: join(home, '.codex'),
      COPILOT_HOME: join(home, '.copilot'),
      GEMINI_CLI_HOME: home,
      XDG_CONFIG_HOME: join(home, '.config'),
      XDG_STATE_HOME: join(directory, 'cli-state'),
      WL_WORKSPACE: '',
    }
    const cli = (args: string[], json = true) =>
      spawnSync(process.execPath, [resolve('dist/wl.mjs'), ...args, ...(json ? ['--json'] : [])], {
        cwd: root,
        env,
        encoding: 'utf8',
      })
    const start = cli([
      'step',
      'begin',
      'research',
      '--input',
      'A CLI fixture question',
      '--owner',
      'Fixture owner',
    ])
    expect(start.status, start.stderr).toBe(0)
    const subject = JSON.parse(start.stdout).subject.id as string
    expect(cli(['research', 'plan', '--for', subject, '--sources', '[]']).status).toBe(0)
    const context = JSON.parse(cli(['research', 'complete', '--for', subject]).stdout)
    const answer = 'No evidence supports an answer; literal `code` and $(text) stay data.'
    const completed = cli(
      [
        'research',
        'complete',
        '--for',
        subject,
        '--basis',
        context.basis,
        '--answer',
        answer,
        '--recommendation',
        'Collect relevant source evidence.',
      ],
      false,
    )
    expect(completed.status, completed.stderr).toBe(0)
    expect(completed.stdout).toMatch(/^Answer\nNo evidence/)
    expect(completed.stdout).toContain(answer)
    expect(completed.stdout).toContain('Confidence: unknown.')
    expect(completed.stdout).toContain('Not checked: No retained claim supports an answer.')
    expect(completed.stdout).not.toContain('"schema"')
    const artifact = completed.stdout.split('Brief: ')[1]?.trim() ?? ''
    expect(readFileSync(join(directory, 'cli-state/wholeloop', artifact), 'utf8')).toContain(answer)
  }))

it('does not describe an empty source selection as fully checked', () => {
  expect(researchCertainty({ claims: [], dropped: [], openQuestions: [] })).toEqual({
    confidence: 'unknown',
    notChecked: ['No retained claim supports an answer.'],
  })
})
