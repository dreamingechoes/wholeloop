// Definition-defect evaluation corpus and scoring, bound to exact artifact bytes.
import { createHash } from 'node:crypto'
import { readFileSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { isObject } from '../config/schema.js'
import { inside } from '../state/paths.js'
import { CHALLENGE_MODES, type ChallengeMode, challengePlan } from './challenge.js'

export const DEFECT_CLASSES = [
  'vague-wording',
  'contradictory-pair',
  'missing-test',
  'duplicate-id',
  'missing-source',
  'missing-window',
  'missing-criteria',
  'unexplained-unknown',
  'metric-ownership',
  'semantic-conflict',
  'independent-delivery',
  'invalid-structure',
] as const
export type DefectClass = (typeof DEFECT_CLASSES)[number]
export interface DefinitionCase {
  id: string
  mode: ChallengeMode
  artifact: string
  expected: DefectClass[]
  why: string
  content: string
}
export interface DefinitionCorpus {
  seed: string
  sha256: string
  cases: DefinitionCase[]
}
export interface Prediction {
  case: string
  defects: DefectClass[]
}
const uniqueStrings = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.every((entry) => typeof entry === 'string') &&
  new Set(value).size === value.length

export function loadDefinitionCorpus(file: string): DefinitionCorpus {
  const raw = readFileSync(file, 'utf8')
  const value: unknown = JSON.parse(raw)
  if (
    !isObject(value) ||
    value.schema !== 'wholeloop/definition-corpus@1' ||
    typeof value.seed !== 'string' ||
    !value.seed.trim() ||
    !Array.isArray(value.cases) ||
    !value.cases.length
  )
    throw new Error('Invalid versioned definition corpus')
  const root = realpathSync(dirname(resolve(file)))
  const cases = value.cases.map((entry): DefinitionCase => {
    if (
      !isObject(entry) ||
      typeof entry.id !== 'string' ||
      !/^[a-z][a-z0-9-]*$/.test(entry.id) ||
      !CHALLENGE_MODES.includes(entry.mode as ChallengeMode) ||
      typeof entry.artifact !== 'string' ||
      isAbsolute(entry.artifact) ||
      entry.artifact.includes('\\') ||
      entry.artifact.split('/').includes('..') ||
      typeof entry.why !== 'string' ||
      !entry.why.trim() ||
      !uniqueStrings(entry.expected) ||
      entry.expected.some((label) => !DEFECT_CLASSES.includes(label as DefectClass))
    )
      throw new Error('Invalid definition case or defect labels')
    const path = realpathSync(resolve(root, entry.artifact))
    if (!inside(root, path)) throw new Error('Corpus artifact escapes its directory')
    return {
      id: entry.id,
      mode: entry.mode as ChallengeMode,
      artifact: entry.artifact,
      expected: entry.expected as DefectClass[],
      why: entry.why,
      content: readFileSync(path, 'utf8'),
    }
  })
  if (new Set(cases.map((entry) => entry.id)).size !== cases.length)
    throw new Error('Corpus case IDs must be unique')
  // Include labels and exact artifact bytes so external predictions cannot be scored against a changed seed.
  return {
    seed: value.seed,
    sha256: createHash('sha256')
      .update(JSON.stringify({ seed: value.seed, cases }))
      .digest('hex'),
    cases,
  }
}

export function detectDefinitionDefects(entry: DefinitionCase): DefectClass[] {
  const problems = challengePlan(entry.mode, entry.content, { challenge: 'balanced' }).problems
  const matchers: [DefectClass, RegExp][] = [
    ['vague-wording', /untestable wording/],
    ['contradictory-pair', /contradictory numeric assertions/],
    ['missing-test', /falsifiable test|\.test:/],
    ['duplicate-id', /ids must be unique/],
    ['missing-source', /spec\.metrics\[\d+\]\.source/],
    ['missing-window', /spec\.metrics\[\d+\]\.window/],
    ['missing-criteria', /spec\.stories\[\d+\]\.criteria/],
    ['unexplained-unknown', /TBD must|unexplained unknown/],
    ['metric-ownership', /Metric .+ has no scope owner/],
  ]
  const found = new Set<DefectClass>()
  for (const problem of problems) {
    const labels = matchers.filter(([, pattern]) => pattern.test(problem)).map(([label]) => label)
    if (!labels.length) found.add('invalid-structure')
    for (const label of labels) found.add(label)
  }
  return DEFECT_CLASSES.filter((label) => found.has(label))
}

export function parsePredictions(
  value: unknown,
  corpus: DefinitionCorpus,
): { evaluator: string; results: Prediction[] } {
  if (
    !isObject(value) ||
    value.schema !== 'wholeloop/definition-predictions@1' ||
    value.corpusSha256 !== corpus.sha256 ||
    typeof value.evaluator !== 'string' ||
    !value.evaluator.trim() ||
    !Array.isArray(value.results)
  )
    throw new Error('Predictions must name the evaluator and match the exact corpus digest')
  const results = value.results.map((entry): Prediction => {
    if (
      !isObject(entry) ||
      typeof entry.case !== 'string' ||
      !corpus.cases.some((item) => item.id === entry.case) ||
      !uniqueStrings(entry.defects) ||
      entry.defects.some((label) => !DEFECT_CLASSES.includes(label as DefectClass))
    )
      throw new Error('Invalid prediction case or defect class')
    return { case: entry.case, defects: entry.defects as DefectClass[] }
  })
  if (
    results.length !== corpus.cases.length ||
    new Set(results.map((entry) => entry.case)).size !== results.length
  )
    throw new Error(
      'Provide exactly one prediction for every corpus case; silence is not a negative result',
    )
  return { evaluator: value.evaluator, results }
}

export function definitionReport(
  corpus: DefinitionCorpus,
  predictions?: { evaluator: string; results: Prediction[] },
) {
  const evaluated = predictions ?? {
    evaluator: 'core-definition-lint@1',
    results: corpus.cases.map((entry) => ({
      case: entry.id,
      defects: detectDefinitionDefects(entry),
    })),
  }
  // Apply the same completeness check to programmatic and CLI callers.
  parsePredictions(
    { schema: 'wholeloop/definition-predictions@1', corpusSha256: corpus.sha256, ...evaluated },
    corpus,
  )
  const outcomes = corpus.cases.map((entry) => {
    const actual =
      evaluated.results.find((prediction) => prediction.case === entry.id)?.defects ?? []
    return {
      case: entry.id,
      expected: entry.expected,
      predicted: DEFECT_CLASSES.filter((label) => actual.includes(label)),
      missed: entry.expected.filter((label) => !actual.includes(label)),
      falseAlarms: actual.filter((label) => !entry.expected.includes(label)),
    }
  })
  const ratio = (numerator: number, denominator: number) =>
    denominator ? numerator / denominator : null
  const classes = DEFECT_CLASSES.map((defect) => {
    let tp = 0
    let fp = 0
    let tn = 0
    let fn = 0
    for (const outcome of outcomes) {
      const expected = outcome.expected.includes(defect)
      const predicted = outcome.predicted.includes(defect)
      if (expected && predicted) tp++
      else if (expected) fn++
      else if (predicted) fp++
      else tn++
    }
    return {
      defect,
      tp,
      fp,
      tn,
      fn,
      recall: ratio(tp, tp + fn),
      falseAlarmRate: ratio(fp, fp + tn),
      precision: ratio(tp, tp + fp),
    }
  })
  const totals = classes.reduce(
    (sum, row) => ({
      tp: sum.tp + row.tp,
      fp: sum.fp + row.fp,
      tn: sum.tn + row.tn,
      fn: sum.fn + row.fn,
    }),
    { tp: 0, fp: 0, tn: 0, fn: 0 },
  )
  return {
    schema: 'wholeloop/definition-eval@1',
    seed: corpus.seed,
    corpusSha256: corpus.sha256,
    evaluator: evaluated.evaluator,
    cases: outcomes.length,
    classes,
    totals: {
      ...totals,
      recall: ratio(totals.tp, totals.tp + totals.fn),
      falseAlarmRate: ratio(totals.fp, totals.fp + totals.tn),
    },
    outcomes,
  }
}
