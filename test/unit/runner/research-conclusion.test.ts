// Unattended research ends with an authored answer bound to its exact evidence (P9-23).
import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readSourceFile } from '../../../src/delivery/input.js'
import { conclusionBasis, type ResearchConclusion } from '../../../src/research/conclusion.js'
import type { AngleResult, ResearchPlan } from '../../../src/research/contracts.js'
import { DeliveryRunner } from '../../../src/runner/engine.js'
import { RESEARCH_LIMITS, researchSynthesis } from '../../../src/runner/research-stages.js'
import type { RunnerStore } from '../../../src/runner/store.js'
import {
  angle,
  type ConclusionScript,
  conclude,
  runnerResearchFixture as setup,
} from '../../support/runner-research.js'

const docs: AngleResult = {
  angle: 'docs:source.web',
  status: 'ok',
  claims: [
    {
      id: 'index',
      text: 'A title index serves search.',
      confidence: 'high',
      loadBearing: true,
      evidence: [{ ref: 'https://docs.example/index', excerpt: 'A title index serves search.' }],
    },
  ],
  openQuestions: [],
}
const open: AngleResult = {
  ...docs,
  openQuestions: [
    { question: 'How large is the index?', missing: 'index size', who: 'search owner' },
  ],
}
function stored(store: RunnerStore, digest: string) {
  const record = store.stage(digest, 'research')
  if (!record) throw new Error('Research stage required')
  const base = `delivery/runner-research/${record.invocation}`,
    synthesis = JSON.parse(readSourceFile(store.files.root, `${base}/synthesis.json`, 65536)) as {
      outcome: string
      artifact: { ref: string } | null
    },
    entries = readdirSync(store.files.path(`${base}/entries`))
      .filter((name) => name.endsWith('.json'))
      .sort()
      .map(
        (name) =>
          JSON.parse(readSourceFile(store.files.root, `${base}/entries/${name}`, 2 << 20)) as {
            kind: string
            outcome: string
            reason: string
          },
      )
  return {
    record,
    synthesis,
    conclusions: entries.filter((entry) => entry.kind === 'conclusion'),
    text: synthesis.artifact
      ? readSourceFile(store.files.root, synthesis.artifact.ref, 8 * 1024 * 1024)
      : '',
  }
}
const single = { angles: [angle('docs')], scripts: { 'docs:source.web': [docs] } }

describe('authored research conclusion', () => {
  it('opens the brief with the answer, recommendation, confidence and unchecked work', async () => {
    await setup(
      async ({ store, digest, dispatcher, calls, request }) => {
        const receipt = await new DeliveryRunner(store).run(digest, dispatcher)
        expect(receipt).toMatchObject({ state: 'completed', outcome: 'research-report-complete' })
        const { text, conclusions, record } = stored(store, digest)
        expect(text).toMatch(
          /^# Research brief\n\n## Answer\n\nA title index serves search\.\n\n## Recommendation\n\nKeep the title index/,
        )
        expect(text).toContain('Confidence: high.')
        expect(text).toContain('Not checked: None reported.')
        // Every claim, source and receipt line is retained after the authored part.
        expect(text).toContain('### docs:source.web:index')
        expect(text).toContain('https://docs.example/index')
        expect(text).toContain('One conclusion call wrote the answer and recommendation')
        expect(conclusions).toMatchObject([{ outcome: 'observed' }])
        // The author receives the evidence aggregate only; no source is queried again.
        expect(calls.angles).toEqual(['docs:source.web'])
        expect(calls.conclusions).toHaveLength(1)
        expect(Object.keys(calls.conclusions[0] ?? {}).sort()).toEqual([
          'basis',
          'certainty',
          'key',
          'question',
          'report',
        ])
        // Replay recomputes the same brief without calling the author again.
        const before = calls.conclusions.length
        expect(
          (await dispatcher.inspect(request, record, new AbortController().signal)).evidence,
        ).toBe(record.evidence)
        expect(calls.conclusions).toHaveLength(before)
      },
      { ...single },
    )
  })

  it('lists open questions as unchecked work beside an authored answer', async () => {
    await setup(
      async ({ store, digest, dispatcher }) => {
        const receipt = await new DeliveryRunner(store).run(digest, dispatcher)
        expect(receipt).toMatchObject({ outcome: 'completed-with-unknowns' })
        const { text } = stored(store, digest)
        expect(text).toContain('Confidence: low.')
        expect(text).toContain('Not checked: index size')
        expect(text).toContain('How large is the index?')
      },
      {
        angles: [angle('docs')],
        scripts: { 'docs:source.web': [open] },
        uncertainty: 'complete-with-unknowns',
      },
    )
  })

  it.each([
    ['blocked', 'blocked', 'blocked'],
    ['complete-with-unknowns', 'completed', 'completed-with-unknowns'],
  ] as const)(
    'never invents an answer when the author fails, under %s policy',
    async (uncertainty, state, outcome) => {
      await setup(
        async ({ store, digest, dispatcher, calls }) => {
          const receipt = await new DeliveryRunner(store).run(digest, dispatcher)
          expect(receipt).toMatchObject({ state, outcome })
          const { conclusions, text, synthesis } = stored(store, digest)
          // The original try and two repairs, then an honest unavailable entry.
          expect(calls.conclusions).toHaveLength(1 + RESEARCH_LIMITS.repairs)
          expect(conclusions.map((entry) => entry.outcome)).toEqual([
            'crashed',
            'crashed',
            'crashed',
            'unavailable',
          ])
          if (state === 'completed') {
            expect(text).toMatch(
              /^# Research brief\n\n## Answer\n\nNot authored: No valid result after 3 attempt\(s\)\. No answer was inferred/,
            )
            expect(text).not.toContain('## Recommendation')
            expect(text).toContain('### docs:source.web:index')
          } else expect(synthesis.outcome).toBe('blocked')
        },
        { ...single, uncertainty, conclusion: () => 'crash' },
      )
    },
  )

  it.each([
    [
      'stale evidence',
      ((job) => ({
        ...(conclude(job) as ResearchConclusion),
        basis: 'e'.repeat(64),
      })) as ConclusionScript,
      ['unavailable'],
      'The conclusion was written for different evidence.',
    ],
    [
      'a section heading in its prose',
      ((job) => ({
        ...(conclude(job) as ResearchConclusion),
        answer: '# Injected\n\nText.',
      })) as ConclusionScript,
      ['crashed', 'crashed', 'crashed', 'unavailable'],
      'No valid result after 3 attempt(s).',
    ],
  ])('refuses a conclusion with %s', async (_name, script, outcomes, reason) => {
    await setup(
      async ({ store, digest, dispatcher }) => {
        const receipt = await new DeliveryRunner(store).run(digest, dispatcher)
        expect(receipt).toMatchObject({ outcome: 'completed-with-unknowns' })
        const { conclusions, text } = stored(store, digest)
        expect(conclusions.map((entry) => entry.outcome)).toEqual(outcomes)
        expect(conclusions.at(-1)?.reason).toBe(reason)
        expect(text).toContain(`Not authored: ${reason}`)
        expect(text).not.toContain('# Injected')
      },
      { ...single, uncertainty: 'complete-with-unknowns', conclusion: script },
    )
  })

  it('asks for no conclusion when no source produced evidence', async () => {
    await setup(
      async ({ store, digest, dispatcher, calls }) => {
        const receipt = await new DeliveryRunner(store).run(digest, dispatcher)
        expect(receipt).toMatchObject({ state: 'blocked', outcome: 'blocked' })
        expect(calls.conclusions).toEqual([])
      },
      { angles: [angle('docs')], scripts: { 'docs:source.web': ['crash', 'crash', 'crash'] } },
    )
  })
})

describe('research synthesis with a conclusion', () => {
  const plan: ResearchPlan = {
    schema: 'wholeloop/research-plan@1',
    subject: 'search',
    run: 'run-1',
    question: 'How does search work?',
    owner: 'Fixture Owner',
    verifiers: 3,
    refutations: 2,
    angles: [angle('docs')],
    openQuestions: [],
  }
  const angleEntry = {
    version: 1 as const,
    kind: 'angle' as const,
    target: 'docs:source.web',
    attempt: 1,
    outcome: 'observed' as const,
    reason: 'Observed source result.',
    evidence: 'a'.repeat(64),
    value: { ...docs, claims: docs.claims.map((claim) => ({ ...claim, loadBearing: false })) },
  }
  it('keeps version 1 runs unchanged and binds a version 2 conclusion to its exact evidence', () => {
    const legacy = researchSynthesis(plan, [angleEntry], 'blocked')
    expect(legacy).toMatchObject({ outcome: 'complete', missing: undefined })
    expect(legacy.conclusion).toBeUndefined()
    const missing = researchSynthesis(plan, [angleEntry], 'blocked', true)
    expect(missing).toMatchObject({ outcome: 'blocked' })
    expect(missing.missing).toContain('No source produced evidence')
    const basis = conclusionBasis(plan, legacy.report)
    const written = (value: string) => ({
      version: 1 as const,
      kind: 'conclusion' as const,
      target: 'conclusion',
      attempt: 1,
      outcome: 'observed' as const,
      reason: 'Observed source result.',
      evidence: 'b'.repeat(64),
      value: {
        schema: 'wholeloop/research-conclusion@1' as const,
        basis: value,
        answer: 'Yes.',
        recommendation: 'Keep it.',
      },
    })
    expect(researchSynthesis(plan, [angleEntry, written(basis)], 'blocked', true)).toMatchObject({
      outcome: 'complete',
      conclusion: { answer: 'Yes.' },
    })
    expect(
      researchSynthesis(plan, [angleEntry, written('c'.repeat(64))], 'blocked', true).conclusion,
    ).toBeUndefined()
  })
})
