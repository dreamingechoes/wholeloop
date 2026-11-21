// Fresh workers must be able to answer from their job alone, without other workers' votes.

import { describe, expect, it } from 'vitest'
import { validate } from '../../../src/config/schema.js'
import { gateAssignments, type SuiteObservation } from '../../../src/gates/assignments.js'
import { type GatePlan, type GateResult, validateGatePlan } from '../../../src/gates/contracts.js'
import { researchAssignments } from '../../../src/research/assignments.js'
import {
  type AngleResult,
  type ResearchPlan,
  validatePlan,
} from '../../../src/research/contracts.js'
import resultSchema from '../../../src/research/schemas/result-v1.json' with { type: 'json' }
import type { ReviewContext } from '../../../src/review/contracts.js'

const research: ResearchPlan = {
  schema: 'wholeloop/research-plan@1',
  subject: 'brief-0123abcd',
  run: 'run-0000000000000000',
  question: 'Which behavior rejects empty requests?',
  owner: 'Fixture owner',
  verifiers: 3,
  refutations: 2,
  angles: ['code', 'web'].map((kind) => ({
    id: `native-${kind}:source.${kind}`,
    provider: `native-${kind}`,
    capability: `source.${kind}`,
    operation: `source.${kind}.query`,
    available: true,
    evidence: 'Declared fixture source',
  })),
  openQuestions: [],
}
const answer: AngleResult = {
  angle: research.angles[0]?.id ?? '',
  status: 'ok',
  openQuestions: [],
  claims: [
    {
      id: 'reject-empty',
      text: 'Empty requests are rejected.',
      confidence: 'high',
      loadBearing: true,
      evidence: [{ ref: 'fixture:handler:1', excerpt: 'Empty input returns status 400.' }],
    },
  ],
}
const gate: GatePlan = {
  schema: 'wholeloop/gate-round@1',
  subject: 'slice-0123abcd',
  run: 'gate-0000000000000000',
  gate: 'review',
  round: 1,
  budget: 3,
  policy: 'a'.repeat(64),
  repository: '/fixture/repository',
  base: { ref: 'main', sha: 'b'.repeat(40) },
  snapshot: { branch: 'feature/example', head: 'c'.repeat(40), digest: 'd'.repeat(64) },
  inputs: { paths: ['handler.ts'], languages: ['typescript'], slots: [] },
  units: ['correctness', 'security'].map((id) => ({
    id,
    lens: id,
    asks: `Inspect ${id} of the changed handler.`,
    prompt: 'Use concrete evidence only.',
    failSafe: true,
    origin: `builtin:${id}`,
  })),
  excluded: [],
  verifiers: 3,
  refutations: 2,
}
const review: ReviewContext = {
  input: {
    run: gate.run,
    round: 1,
    before: 'b'.repeat(40),
    after: 'c'.repeat(40),
    objects: '/fixture/private-store',
    files: [],
    diffDigest: 'e'.repeat(64),
    rubric: { ref: 'default', origin: 'harness', digest: 'f'.repeat(64) },
  },
  diff: '-accept empty\n+reject empty',
  rubric: {
    ref: 'default',
    origin: 'harness',
    digest: 'f'.repeat(64),
    content: 'Report concrete correctness and security defects.',
  },
  current: true,
  previousFindings: [
    {
      unit: 'correctness',
      finding: {
        id: 'prior',
        location: 'handler.ts:1',
        text: 'Prior owned blocker',
        evidence: ['Observed fixture'],
      },
    },
    {
      unit: 'security',
      finding: {
        id: 'other',
        location: 'handler.ts:2',
        text: 'Other lens blocker',
        evidence: ['Observed fixture'],
      },
    },
  ],
}
const finding: GateResult = {
  unit: 'correctness',
  status: 'ok',
  evidence: ['Observed fixture patch'],
  findings: [
    {
      id: 'empty',
      location: 'handler.ts:1',
      text: 'Empty input is accepted.',
      evidence: ['Observed fixture condition'],
    },
  ],
}
const suite: SuiteObservation = {
  run: gate.run,
  round: 1,
  current: true,
  result: {
    status: 'passed',
    unchanged: true,
    commands: [
      {
        ref: 'package.json#test',
        exitCode: 0,
        signal: '',
        stdout: 'a'.repeat(64),
        stderr: 'b'.repeat(64),
      },
    ],
  },
  output: [{ ref: 'package.json#test', stdout: 'Fixture suite passed', stderr: '' }],
}
const view = <T extends { resultSchema: unknown; resultContract: string }>(job: T) => ({
  ...job,
  resultSchema: job.resultContract,
})

describe('self-contained research assignments', () => {
  it('includes the exact source, question, bound response and final destination without mutating the plan', () => {
    validatePlan(research)
    const before = structuredClone(research)
    const { jobs } = researchAssignments(research, [], [])
    expect(jobs).toHaveLength(2)
    const job = jobs[0]
    if (!job) throw new Error('Missing fixture job')
    expect(view(job)).toMatchSnapshot()
    expect(job.question).toBe(research.question)
    expect(job.returnTo).toEqual({ role: 'conductor', channel: 'final-message' })
    expect(validate(answer, job.resultSchema)).toEqual([])
    expect(validate({ ...answer, angle: 'another-source' }, job.resultSchema)).not.toEqual([])
    expect(validate({ angle: answer.angle }, job.resultSchema)).not.toEqual([])
    expect(research).toEqual(before)
    expect(job.resultSchema).not.toHaveProperty('$id')
    if (job.resultSchema.properties)
      delete (job.resultSchema.properties as Record<string, unknown>).angle
    expect(researchAssignments(research, [], []).jobs[0]?.resultSchema.properties).toEqual({
      ...resultSchema.properties,
      angle: { ...resultSchema.properties.angle, const: answer.angle },
    })
  })
  it('gives each verifier the original claim and evidence without another verdict or confidence derived from votes', () => {
    const claim = `${answer.angle}:reject-empty`
    const votes = [
      {
        claim,
        verifier: 1,
        outcome: 'uncertain' as const,
        reason: 'Private earlier verdict',
        evidence: [],
      },
    ]
    const jobs = researchAssignments(research, [answer], votes)
    expect(jobs.jobs).toHaveLength(1)
    expect(jobs.examinations.map((job) => job.verifier)).toEqual([2, 3])
    const job = jobs.examinations[0]
    if (!job) throw new Error('Missing examination')
    expect(view(job)).toMatchSnapshot()
    expect(job.input.claim.confidence).toBe('high')
    expect(JSON.stringify(job)).not.toContain('Private earlier verdict')
    const result = {
      claim,
      verifier: 2,
      outcome: 'confirm',
      reason: 'Evidence supports the fixture claim.',
      evidence: [],
    }
    expect(validate(result, job.resultSchema)).toEqual([])
    expect(validate({ ...result, verifier: 3 }, job.resultSchema)).not.toEqual([])
    expect(
      researchAssignments(
        research,
        [answer],
        [1, 2].map((verifier) => ({
          claim,
          verifier,
          outcome: 'refute',
          reason: 'Observed counterexample',
          evidence: answer.claims[0]?.evidence ?? [],
        })),
      ).examinations,
    ).toEqual([])
  })
})

describe('self-contained gate assignments', () => {
  it('pins an inspection to its unit and private patch without unrelated findings or store paths', () => {
    validateGatePlan(gate)
    const { jobs } = gateAssignments(gate, { results: [], votes: [], review })
    const job = jobs[0]
    if (!job) throw new Error('Missing inspection')
    expect(jobs).toHaveLength(2)
    expect(view(job)).toMatchSnapshot()
    expect(JSON.stringify(job)).not.toContain('Other lens blocker')
    expect(JSON.stringify(job)).not.toContain('/fixture/private-store')
    const result = {
      unit: 'correctness',
      status: 'ok',
      findings: [],
      evidence: ['Inspected fixture patch'],
    }
    expect(validate(result, job.resultSchema)).toEqual([])
    expect(validate({ ...result, unit: 'security' }, job.resultSchema)).not.toEqual([])
  })
  it('returns only pending independent refutations with their exact finding and no other votes', () => {
    const { jobs, examinations } = gateAssignments(gate, {
      results: [finding],
      votes: [
        {
          finding: 'correctness:empty',
          verifier: 1,
          outcome: 'uncertain',
          reason: 'Private earlier gate vote',
          evidence: [],
        },
      ],
      review,
    })
    expect(jobs.map((job) => job.input.unit.id)).toEqual(['security'])
    expect(examinations).toHaveLength(2)
    const job = examinations[0]
    if (!job) throw new Error('Missing refutation')
    expect(view(job)).toMatchSnapshot()
    expect(JSON.stringify(job)).not.toContain('Private earlier gate vote')
    const result = {
      finding: 'correctness:empty',
      verifier: 2,
      outcome: 'confirm',
      reason: 'Observed fixture',
      evidence: [],
    }
    expect(validate(result, job.resultSchema)).toEqual([])
    expect(validate({ ...result, finding: 'security:empty' }, job.resultSchema)).not.toEqual([])
  })
  it('requires current observed inputs, excludes core-owned units and keeps cached raw output explicitly absent', () => {
    expect(gateAssignments(gate, { results: [], votes: [] }).jobs).toEqual([])
    expect(
      gateAssignments(gate, { results: [], votes: [], review: { ...review, current: false } }).jobs,
    ).toEqual([])
    expect(() =>
      gateAssignments(gate, {
        results: [],
        votes: [],
        review: { ...review, input: { ...review.input, round: 2 } },
      }),
    ).toThrow('different gate')
    const unit = gate.units[0]
    if (!unit) throw new Error('Missing fixture unit')
    const verify = {
      ...gate,
      gate: 'verify' as const,
      units: [...gate.units, ...['suite', 'testability'].map((id) => ({ ...unit, id }))],
    }
    expect(gateAssignments(verify, { results: [], votes: [] }).jobs).toEqual([])
    const first = gateAssignments(verify, { results: [], votes: [], suite })
    expect(first.jobs.map((job) => job.input.unit.id)).toEqual(['correctness', 'security'])
    expect(first.jobs[0]?.input.suite?.rawOutputAvailable).toBe(true)
    const cached = gateAssignments(verify, {
      results: [],
      votes: [],
      suite: { ...suite, output: [] },
    })
    expect(cached.jobs[0]?.input.suite?.rawOutputAvailable).toBe(false)
    expect(() =>
      gateAssignments(verify, {
        results: [],
        votes: [],
        suite: { ...suite, run: 'gate-1111111111111111' },
      }),
    ).toThrow('different gate')
  })
})
