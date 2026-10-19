import { createHash } from 'node:crypto'
import { readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { isObject } from '../config/schema.js'
import { inside } from '../state/paths.js'
import { BUILTIN_LENSES } from './builtins.js'
import {
  type GatePlan,
  type GateResult,
  type GateVote,
  validateGatePlan,
  validateGateResult,
  validateGateVote,
} from './contracts.js'
import { gateReport } from './report.js'

export type EvalLens = (typeof BUILTIN_LENSES)[number][0]
export interface GateCase {
  id: string
  lens: EvalLens
  artifact: string
  defect: boolean
  why: string
  content: string
}
export interface GateCorpus {
  seed: string
  sha256: string
  cases: GateCase[]
}
export interface GatePredictions {
  evaluator: string
  provenance: 'synthetic' | 'recorded'
  verifiers: number
  results: { case: string; result: GateResult; votes: GateVote[] }[]
}
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const keys = (value: Record<string, unknown>, expected: string[]) =>
  Object.keys(value).every((key) => expected.includes(key))
const lens = (value: unknown): value is EvalLens => BUILTIN_LENSES.some(([id]) => id === value)

export function loadGateCorpus(file: string): GateCorpus {
  if (statSync(file).size > 1024 * 1024) throw new Error('Gate corpus manifest exceeds 1 MiB')
  const value: unknown = JSON.parse(readFileSync(file, 'utf8'))
  if (
    !isObject(value) ||
    !keys(value, ['schema', 'seed', 'cases']) ||
    value.schema !== 'wholeloop/gate-corpus@1' ||
    typeof value.seed !== 'string' ||
    !value.seed.trim() ||
    !Array.isArray(value.cases) ||
    !value.cases.length ||
    value.cases.length > 1000
  )
    throw new Error('Invalid versioned gate corpus')
  const root = realpathSync(dirname(resolve(file)))
  const cases = value.cases.map((entry): GateCase => {
    if (
      !isObject(entry) ||
      !keys(entry, ['id', 'lens', 'artifact', 'defect', 'why']) ||
      typeof entry.id !== 'string' ||
      !/^[a-z][a-z0-9-]*$/.test(entry.id) ||
      !lens(entry.lens) ||
      typeof entry.artifact !== 'string' ||
      isAbsolute(entry.artifact) ||
      entry.artifact.includes('\\') ||
      entry.artifact.split('/').includes('..') ||
      typeof entry.defect !== 'boolean' ||
      typeof entry.why !== 'string' ||
      !entry.why.trim()
    )
      throw new Error('Invalid gate case or lens label')
    const path = realpathSync(resolve(root, entry.artifact))
    if (!inside(root, path)) throw new Error('Gate artifact escapes its corpus')
    if (!statSync(path).isFile() || statSync(path).size > 1024 * 1024)
      throw new Error('Gate snippet must be a regular file under 1 MiB')
    return {
      id: entry.id,
      lens: entry.lens,
      artifact: entry.artifact,
      defect: entry.defect,
      why: entry.why,
      content: readFileSync(path, 'utf8'),
    }
  })
  if (new Set(cases.map((entry) => entry.id)).size !== cases.length)
    throw new Error('Gate case IDs must be unique')
  if (
    BUILTIN_LENSES.some(
      ([id]) =>
        !cases.some((entry) => entry.lens === id && entry.defect) ||
        !cases.some((entry) => entry.lens === id && !entry.defect),
    )
  )
    throw new Error('Each built-in lens needs labelled defects and look-alike negatives')
  return { seed: value.seed, sha256: digest({ seed: value.seed, cases }), cases }
}
export function parseGatePredictions(value: unknown, corpus: GateCorpus): GatePredictions {
  if (
    !isObject(value) ||
    !keys(value, ['schema', 'corpusSha256', 'evaluator', 'provenance', 'verifiers', 'results']) ||
    value.schema !== 'wholeloop/gate-predictions@1' ||
    value.corpusSha256 !== corpus.sha256 ||
    typeof value.evaluator !== 'string' ||
    !value.evaluator.trim() ||
    !['synthetic', 'recorded'].includes(String(value.provenance)) ||
    ![3, 5, 7, 9].includes(Number(value.verifiers)) ||
    typeof value.verifiers !== 'number' ||
    !Array.isArray(value.results)
  )
    throw new Error('Gate predictions need provenance, quorum and the exact corpus digest')
  const results = value.results.map((entry) => {
    if (
      !isObject(entry) ||
      !keys(entry, ['case', 'result', 'votes']) ||
      typeof entry.case !== 'string' ||
      !Array.isArray(entry.votes)
    )
      throw new Error('Invalid gate prediction envelope')
    const sample = corpus.cases.find((sample) => sample.id === entry.case)
    validateGateResult(entry.result)
    if (!sample || entry.result.unit !== sample.lens || entry.result.execution)
      throw new Error('Gate prediction must match its assigned case lens')
    const assigned = new Set<string>()
    for (const vote of entry.votes) {
      validateGateVote(vote)
      const key = `${vote.finding}/${vote.verifier}`
      if (
        vote.verifier > Number(value.verifiers) ||
        !entry.result.findings.some((finding) => vote.finding === `${sample.lens}:${finding.id}`) ||
        assigned.has(key)
      )
        throw new Error('Refutations need unique assigned slots and observed findings')
      assigned.add(key)
    }
    return { case: entry.case, result: entry.result, votes: entry.votes as GateVote[] }
  })
  if (
    results.length !== corpus.cases.length ||
    new Set(results.map((entry) => entry.case)).size !== results.length
  )
    throw new Error('Provide every gate case exactly once; silence is not a negative result')
  return {
    evaluator: value.evaluator,
    provenance: value.provenance as GatePredictions['provenance'],
    verifiers: value.verifiers,
    results,
  }
}
function evaluationPlan(sample: GateCase, verifiers: number): GatePlan {
  const definition = BUILTIN_LENSES.find(([id]) => id === sample.lens)
  if (!definition) throw new Error('Unknown evaluation lens')
  const plan: GatePlan = {
    schema: 'wholeloop/gate-round@1',
    subject: 'review-00000000',
    run: 'gate-0000000000000000',
    gate: 'review',
    round: 1,
    budget: 3,
    repository: '/eval',
    base: { ref: 'refs/heads/eval-base', sha: '0'.repeat(40) },
    snapshot: { digest: '0'.repeat(64), branch: 'eval/fixture', head: '0'.repeat(40) },
    policy: digest(BUILTIN_LENSES),
    inputs: { paths: [sample.artifact], languages: [], slots: [] },
    units: [
      {
        id: definition[0],
        lens: definition[0],
        asks: definition[1],
        prompt: definition[1],
        failSafe: definition[2],
        origin: `builtin:${definition[0]}`,
      },
    ],
    excluded: [],
    verifiers,
    refutations: Math.floor(verifiers / 2) + 1,
  }
  validateGatePlan(plan)
  return plan
}
export function gateEvaluationInputs(corpus: GateCorpus) {
  return {
    schema: 'wholeloop/gate-eval-inputs@1',
    seed: corpus.seed,
    corpusSha256: corpus.sha256,
    cases: corpus.cases
      .map(({ id, lens, content }) => ({
        id,
        lens,
        content,
        asks: BUILTIN_LENSES.find(([key]) => key === lens)?.[1],
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  }
}
const ratio = (top: number, bottom: number) => (bottom ? top / bottom : null)
function matrix(outcomes: { expected: boolean; predicted: boolean | null }[]) {
  let tp = 0
  let fp = 0
  let tn = 0
  let fn = 0
  let unknown = 0
  for (const { expected, predicted } of outcomes) {
    if (predicted === null) unknown++
    else if (expected && predicted) tp++
    else if (expected) fn++
    else if (predicted) fp++
    else tn++
  }
  return {
    tp,
    fp,
    tn,
    fn,
    unknown,
    recall: ratio(tp, tp + fn),
    precision: ratio(tp, tp + fp),
    falseAlarmRate: ratio(fp, fp + tn),
    coverage: ratio(tp + fp + tn + fn, outcomes.length),
  }
}
/** Scores observations; it neither runs a reviewer nor invents predictions for silent cases. */
export function gateEvaluationReport(corpus: GateCorpus, predictions: GatePredictions) {
  const evaluated = parseGatePredictions(
    { schema: 'wholeloop/gate-predictions@1', corpusSha256: corpus.sha256, ...predictions },
    corpus,
  )
  const outcomes = corpus.cases.map((sample) => {
    const observed = evaluated.results.find((entry) => entry.case === sample.id)
    if (!observed) throw new Error('Missing observation')
    const plan = evaluationPlan(sample, evaluated.verifiers)
    const report = gateReport(plan, [observed.result], observed.votes, plan.snapshot.digest)
    const available = observed.result.status === 'ok'
    return {
      case: sample.id,
      lens: sample.lens,
      expected: sample.defect,
      before: available ? observed.result.findings.length > 0 : null,
      after: available ? report.kept.length > 0 : null,
      kept: report.kept.map((finding) => finding.id),
      dropped: report.dropped.map((finding) => finding.id),
      missing: report.missing,
      verifierResponses: observed.votes.length,
      verifierAssignments: observed.result.findings.length * evaluated.verifiers,
    }
  })
  return {
    schema: 'wholeloop/gate-eval@1',
    seed: corpus.seed,
    corpusSha256: corpus.sha256,
    policySha256: digest(BUILTIN_LENSES),
    evaluator: evaluated.evaluator,
    provenance: evaluated.provenance,
    verifiers: evaluated.verifiers,
    cases: outcomes.length,
    lenses: BUILTIN_LENSES.map(([lens]) => {
      const selected = outcomes.filter((entry) => entry.lens === lens)
      return {
        lens,
        before: matrix(
          selected.map((entry) => ({ expected: entry.expected, predicted: entry.before })),
        ),
        after: matrix(
          selected.map((entry) => ({ expected: entry.expected, predicted: entry.after })),
        ),
      }
    }),
    totals: {
      before: matrix(
        outcomes.map((entry) => ({ expected: entry.expected, predicted: entry.before })),
      ),
      after: matrix(
        outcomes.map((entry) => ({ expected: entry.expected, predicted: entry.after })),
      ),
    },
    verificationCoverage: ratio(
      outcomes.reduce((sum, entry) => sum + entry.verifierResponses, 0),
      outcomes.reduce((sum, entry) => sum + entry.verifierAssignments, 0),
    ),
    outcomes,
  }
}
