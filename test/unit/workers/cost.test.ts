// Cost previews count actual unfinished work, without claiming measured usage or changing coverage.
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { runResearch } from '../../../harness/workflows/research.js'
import { bundledCanonical } from '../../../src/adapters/canonical.js'
import { ADAPTERS, generateAdapter } from '../../../src/adapters/generate.js'
import { challengePlan } from '../../../src/definition/challenge.js'
import { stepDisplay } from '../../../src/display/step.js'
import { gateAssignments } from '../../../src/gates/assignments.js'
import type { GatePlan, GateResult } from '../../../src/gates/contracts.js'
import { researchAssignments } from '../../../src/research/assignments.js'
import type { AngleResult, ResearchPlan } from '../../../src/research/contracts.js'
import { assignmentCost, costText, workerCost } from '../../../src/workers/cost.js'

const research: ResearchPlan = {
  schema: 'wholeloop/research-plan@1',
  subject: 'brief-0123abcd',
  run: 'run-0000000000000000',
  question: 'Where is empty input handled?',
  owner: 'Fixture owner',
  verifiers: 3,
  refutations: 2,
  angles: ['code', 'web'].map((source) => ({
    id: `native-${source}:source.${source}`,
    provider: `native-${source}`,
    capability: `source.${source}`,
    operation: `source.${source}.query`,
    available: true,
    evidence: 'Synthetic declared source',
  })),
  openQuestions: [],
}
const observation = (angle: string): AngleResult => ({
  angle,
  status: 'ok',
  claims: [
    {
      id: 'found',
      text: 'Empty input is rejected.',
      confidence: 'high',
      loadBearing: true,
      evidence: [
        { ref: 'https://example.com/fixture', excerpt: 'Synthetic empty-input observation' },
      ],
    },
  ],
  openQuestions: [],
})

it('counts requested tiers and declared UTF-8 bytes while leaving unmeasured costs unknown', () => {
  const cost = workerCost(['researcher', 'verifier'], [{}, { text: 'é' }])
  expect(cost).toMatchObject({
    workers: 2,
    modelTiers: [
      { tier: 'deep', workers: 1 },
      { tier: 'standard', workers: 1 },
    ],
    estimate: {
      unit: 'worker-calls',
      value: 2,
      declaredInputBytes: 15,
      tokens: null,
      durationMs: null,
      price: null,
    },
  })
  expect(costText(cost)).toContain('Tokens, time and price unknown')
  expect(workerCost(['custom-role']).modelTiers).toEqual([{ tier: 'unknown', workers: 1 }])
  expect(workerCost(['reviewer']).estimate.declaredInputBytes).toBeNull()
  const first = cost.modelTiers[0]
  if (!first) throw new Error('Expected a requested tier')
  first.workers = 99
  expect(workerCost(['researcher']).modelTiers).toEqual([{ tier: 'deep', workers: 1 }])
})

it('counts only unfinished investigation and independent examination assignments', () => {
  const initial = researchAssignments(research, [], [])
  expect(initial.cost.workers).toBe(2)
  const angle = research.angles[0]?.id ?? '',
    result = observation(angle)
  const partial = researchAssignments(research, [result], [])
  expect(partial.jobs).toHaveLength(1)
  expect(partial.examinations).toHaveLength(3)
  expect(partial.cost).toMatchObject({ workers: 4, modelTiers: [{ tier: 'deep', workers: 4 }] })
  const next = researchAssignments(
    research,
    [result],
    [
      {
        claim: `${angle}:found`,
        verifier: 1,
        outcome: 'confirm',
        reason: 'Observed synthetic evidence',
        evidence: [],
      },
    ],
  )
  expect(next.cost.workers).toBe(3)
  expect(next.cost.estimate.declaredInputBytes).toBeGreaterThan(0)
  expect(research).not.toHaveProperty('cost')
  const display = stepDisplay('research plan', { ...research, ...partial })
  expect(display.rows.filter(({ label }) => label === 'Workers')).toEqual([
    { label: 'Workers', value: '4' },
  ])
  expect(display.text).toContain('deep × 4')
  expect(display.text).toContain('4 worker calls')
  expect(display.text).toContain('price remain unknown')
})

it.each(['supportive', 'balanced', 'adversarial'] as const)(
  'prices one framing challenger without weakening %s coverage',
  (challenge) => {
    const content = readFileSync('test/fixtures/framing/frame.md', 'utf8'),
      plan = challengePlan('problem', content, { challenge })
    expect(plan.cost).toMatchObject({
      workers: 1,
      modelTiers: [{ tier: 'deep', workers: 1 }],
      estimate: { value: 1 },
    })
    expect(plan.coverage).toHaveLength(4)
    expect(stepDisplay('challenge plan', plan, ['problem']).text).toContain('1 worker call')
  },
)

const gate: GatePlan = {
  schema: 'wholeloop/gate-round@1',
  subject: 'slice-0123abcd',
  run: 'gate-0000000000000000',
  gate: 'verify',
  round: 1,
  budget: 3,
  policy: 'synthetic',
  repository: '/tmp/wholeloop-cost-fixture',
  base: { ref: 'main', sha: 'a'.repeat(40) },
  snapshot: { digest: 'b'.repeat(64), head: 'a'.repeat(40), branch: 'feature/fixture' },
  inputs: { paths: [], languages: [], slots: [] },
  excluded: [],
  verifiers: 3,
  refutations: 2,
  units: ['suite', 'testability', 'criterion-a', 'criterion-b'].map((id) => ({
    id,
    lens: 'acceptance',
    asks: 'Does empty input return 400?',
    prompt: 'Observe only',
    failSafe: true,
    origin: 'agreed:criteria',
  })),
}
function costOf(assignments: ReturnType<typeof gateAssignments>) {
  if (!('cost' in assignments)) throw new Error('Expected current assignments and their estimate')
  return assignments.cost
}
it('excludes deterministic gate work and completed results while counting outstanding refuters', () => {
  const results: GateResult[] = ['suite', 'testability'].map((unit) => ({
    unit,
    status: 'ok',
    findings: [],
    evidence: ['Synthetic observation'],
  }))
  const suite = {
    run: gate.run,
    round: 1,
    current: true,
    result: { status: 'passed' as const, commands: [], unchanged: true },
    output: [],
  }
  const initial = gateAssignments(gate, { results, votes: [], suite })
  expect(costOf(initial).workers).toBe(2)
  results.push({
    unit: 'criterion-a',
    status: 'ok',
    evidence: ['Observed'],
    findings: [
      {
        id: 'boundary',
        location: 'fixture:1',
        text: 'Empty input reaches a null dereference',
        evidence: ['Synthetic observation'],
      },
    ],
  })
  const pending = gateAssignments(gate, { results, votes: [], suite })
  expect(pending.jobs).toHaveLength(1)
  expect(pending.examinations).toHaveLength(3)
  expect(costOf(pending)).toMatchObject({
    workers: 4,
    modelTiers: [{ tier: 'standard', workers: 4 }],
  })
  const reduced = gateAssignments(gate, {
    results,
    votes: [
      {
        finding: 'criterion-a:boundary',
        verifier: 1,
        outcome: 'confirm',
        reason: 'Observed',
        evidence: [],
      },
    ],
    suite,
  })
  expect(costOf(reduced).workers).toBe(3)
  expect(
    gateAssignments(gate, { results, votes: [], suite: { ...suite, current: false } }).jobs,
  ).toEqual([])
  expect(gate).not.toHaveProperty('cost')
})

it('previews both research phases before any matching worker is invoked', async () => {
  const order: string[] = []
  await runResearch(
    research,
    {
      preview(cost) {
        order.push(`cost:${cost.workers}`)
      },
      async investigate(angle) {
        order.push('investigate')
        return observation(angle.id)
      },
      async challenge(claim, verifier) {
        order.push('challenge')
        return {
          claim,
          verifier,
          outcome: 'confirm',
          reason: 'Observed synthetic evidence',
          evidence: [],
        }
      },
    },
    { submit() {}, examine() {} },
  )
  expect(order.slice(0, 3)).toEqual(['cost:2', 'investigate', 'investigate'])
  expect(order[3]).toBe('cost:6')
  expect(order.slice(4)).toEqual(Array(6).fill('challenge'))
})

it('does not start work when its before-start presentation fails', async () => {
  let calls = 0
  await expect(
    runResearch(
      research,
      {
        preview() {
          throw new Error('Cost view unavailable')
        },
        async investigate(angle) {
          calls++
          return observation(angle.id)
        },
        async challenge(claim, verifier) {
          calls++
          return { claim, verifier, outcome: 'confirm', reason: 'Observed', evidence: [] }
        },
      },
      { submit() {}, examine() {} },
    ),
  ).rejects.toThrow('Cost view unavailable')
  expect(calls).toBe(0)
  expect(assignmentCost([])).toMatchObject({
    workers: 0,
    modelTiers: [],
    estimate: { value: 0, declaredInputBytes: 0, price: null },
  })
})

it.each(ADAPTERS)(
  '$id renders the common before-start cost rule and framing refresh',
  (adapter) => {
    const generated = generateAdapter(
      adapter.id,
      bundledCanonical(),
      '#!/usr/bin/env node\n',
      '0.0.0',
    )
    const protocol =
      [...generated.files].find(([path]) => path.endsWith('/protocols/worker-handoffs.md'))?.[1]
        .content ?? ''
    expect(protocol).toContain('fanout-cost-before-start')
    expect(generated.files.get(adapter.paths('skill', 'frame-problem'))?.content).toContain(
      'display cost estimate before dispatch',
    )
  },
)
