import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import { isObject } from '../config/schema.js'
import { collectImpact } from '../impact/evidence.js'
import { type MeasurementPlan, measurementDigest } from '../launch/measurement.js'
import type { LoadedProvider, Registry } from '../providers/load.js'
import { validateProvider } from '../providers/manifest.js'
import type { OperationResult, ProviderHost } from '../providers/operations.js'
import { OPERATIONS } from '../providers/taxonomy.js'
import { queryDigest, type RampPlan } from '../ramp/contracts.js'
import { collectRampEvidence } from '../ramp/evidence.js'

export interface GroundingCase {
  id: string
  step: 'ramp-exposure' | 'measure-impact'
  metric: string
  query: string
  operation: string
  unit: string
  response: OperationResult
  truth: { status: 'observed' | 'unknown'; value?: number; reason: string }
}
export interface GroundingPrediction {
  id: string
  step: GroundingCase['step']
  metric: string
  status: 'observed' | 'unknown'
  unit: string
  queryDigest: string
  value?: number
  sourceRef?: string
  bodyDigest?: string
  reason?: string
}
interface Corpus {
  schema: 'wholeloop/grounding-corpus@1'
  seed: string
  at: string
  cases: GroundingCase[]
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim()
export function groundingCorpus(file: string) {
  let bytes: string
  let value: unknown
  try {
    bytes = readFileSync(file, 'utf8')
    if (Buffer.byteLength(bytes) > 1024 * 1024) throw new Error('Oversized corpus')
    value = JSON.parse(bytes)
  } catch {
    throw new Error('Cannot read valid grounding corpus JSON under 1 MiB; contents omitted')
  }
  if (
    !isObject(value) ||
    Object.keys(value).some((key) => !['schema', 'seed', 'at', 'cases'].includes(key)) ||
    value.schema !== 'wholeloop/grounding-corpus@1' ||
    !text(value.seed) ||
    !text(value.at) ||
    !Number.isFinite(Date.parse(value.at)) ||
    value.at !== new Date(Date.parse(value.at)).toISOString() ||
    !Array.isArray(value.cases) ||
    !value.cases.length
  )
    throw new Error('Invalid wholeloop/grounding-corpus@1')
  const ids = new Set<string>()
  for (const row of value.cases) {
    if (
      !isObject(row) ||
      Object.keys(row).some(
        (key) =>
          !['id', 'step', 'metric', 'query', 'operation', 'unit', 'response', 'truth'].includes(
            key,
          ),
      ) ||
      !text(row.id) ||
      ids.has(row.id) ||
      !['ramp-exposure', 'measure-impact'].includes(String(row.step)) ||
      !text(row.metric) ||
      !text(row.query) ||
      !text(row.unit) ||
      !text(row.operation) ||
      !row.operation.startsWith('source.') ||
      !OPERATIONS.has(row.operation) ||
      !isObject(row.response) ||
      !isObject(row.truth) ||
      Object.keys(row.truth).some((key) => !['status', 'value', 'reason'].includes(key)) ||
      !['observed', 'unknown'].includes(String(row.truth.status)) ||
      !text(row.truth.reason)
    )
      throw new Error(
        'Grounding cases need unique identities, exact source queries/units and explicit truth labels',
      )
    if (
      row.truth.status === 'observed' &&
      (typeof row.truth.value !== 'number' || !Number.isFinite(row.truth.value))
    )
      throw new Error('Observed labels need a finite authored datapoint')
    if (row.truth.status === 'unknown' && row.truth.value !== undefined)
      throw new Error('A trap label cannot invent a datapoint')
    ids.add(row.id)
  }
  return { corpus: value as unknown as Corpus, digest: hash(bytes) }
}
function sandbox() {
  const manifest = {
    schema: 1 as const,
    id: 'grounding-sandbox',
    name: 'Grounding sandbox',
    description: 'Synthetic dataset reads with no network or query execution',
    capabilities: ['source.errors' as const],
    access: { native: true as const },
    operations: { 'source.errors.query': { tool: 'sandbox.read' } },
    degrade: { 'source.errors.query': 'open-question' as const },
  }
  validateProvider(manifest)
  const provider: LoadedProvider = { manifest, origin: 'fixture', guidance: {}, guidanceText: {} }
  return { providers: [provider], problems: [] } satisfies Registry
}
/** The baseline executes the actual production collectors; the scripted backend supplies data only. */
export async function groundingPredictions(corpus: Corpus): Promise<GroundingPrediction[]> {
  const registry = sandbox()
  const predictions: GroundingPrediction[] = []
  for (const row of corpus.cases) {
    const window = {
      start: new Date(Date.parse(corpus.at) - 86400000).toISOString(),
      end: new Date(corpus.at).toISOString(),
      timezone: 'UTC',
    }
    const host: ProviderHost = {
      invoke: async (call) => {
        if (
          call.tool !== 'sandbox.read' ||
          call.operation !== row.operation ||
          call.args.query !== row.query ||
          !isDeepStrictEqual(call.args.window, window)
        )
          throw new Error('Sandbox query identity/window mismatch')
        return structuredClone(row.response)
      },
    }
    const source = { provider: 'grounding-sandbox', operation: row.operation, query: row.query }
    let actual: {
      status: string
      value?: number
      ref?: string
      bodyDigest?: string
      missing?: string
    }
    if (row.step === 'ramp-exposure') {
      const plan: RampPlan = {
        schema: 'wholeloop/ramp-plan@1',
        environment: 'sandbox',
        confirmedBy: 'fixture-label-author',
        stages: [
          {
            key: 'check',
            audience: 'all',
            enabled: false,
            exposure: 0,
            exit: 'Read the exact sandbox datapoint',
            checks: [
              {
                key: row.metric,
                ...source,
                unit: row.unit,
                operator: 'lte',
                threshold: 20,
                required: true,
                lookbackHours: 24,
                timezone: 'UTC',
              },
            ],
          },
        ],
      }
      const evidence = await collectRampEvidence(
        'run-0000000000000000',
        plan,
        0,
        registry,
        undefined,
        'fixture-owner',
        host,
        corpus.at,
      )
      actual = evidence.checks[0] ?? { status: 'unknown', missing: 'Missing collector observation' }
    } else {
      const plan: MeasurementPlan = {
        schema: 'wholeloop/measurement-plan@1',
        impact: 'Evaluate synthetic grounding, not production impact.',
        metrics: [
          {
            id: row.metric,
            name: 'Sandbox metric',
            unit: row.unit,
            source,
            baseline: {
              status: 'unknown',
              missing: 'No baseline is claimed by this corpus',
              who: 'fixture-label-author',
            },
            target: { operator: 'lte', value: 20 },
            window: { days: 1, timezone: 'UTC' },
          },
        ],
        rollout: {
          strategy: 'manual',
          stages: [
            { name: 'sandbox', audience: 'fixture', exposure: 100, exit: 'No real exposure' },
          ],
          rollback: 'No actual rollout occurs',
        },
      }
      const revision = 'grounding-sandbox'
      const evidence = await collectImpact(
        {
          run: 'run-0000000000000000',
          source: { ref: 'fixture', revision, digest: measurementDigest({ revision, plan }), plan },
          checkpoint: 'launch',
          launchedAt: corpus.at,
          afterDays: 0,
          at: corpus.at,
          qualitative: [],
          guidance: { ref: 'fixture', origin: 'harness', digest: '0'.repeat(64) },
        },
        registry,
        'fixture-owner',
        host,
      )
      actual = evidence.metrics[0] ?? {
        status: 'unknown',
        missing: 'Missing collector observation',
      }
    }
    const observed =
      actual.status === 'observed' || actual.status === 'pass' || actual.status === 'fail'
    predictions.push({
      id: row.id,
      step: row.step,
      metric: row.metric,
      status: observed ? 'observed' : 'unknown',
      unit: row.unit,
      queryDigest: queryDigest(row.query),
      ...(observed
        ? {
            value: actual.value ?? Number.NaN,
            sourceRef: actual.ref ?? '',
            bodyDigest: actual.bodyDigest ?? '',
          }
        : { reason: actual.missing ?? 'No observed scalar' }),
    })
  }
  return predictions
}
function predictionsInput(value: unknown, corpus: Corpus, digest: string) {
  if (
    !isObject(value) ||
    Object.keys(value).some(
      (key) => !['schema', 'corpusDigest', 'evaluator', 'cases'].includes(key),
    ) ||
    value.schema !== 'wholeloop/grounding-predictions@1' ||
    value.corpusDigest !== digest ||
    !isObject(value.evaluator) ||
    Object.keys(value.evaluator).some((key) => !['name', 'provenance', 'note'].includes(key)) ||
    !text(value.evaluator.name) ||
    !['synthetic', 'host-recorded'].includes(String(value.evaluator.provenance)) ||
    !text(value.evaluator.note) ||
    !Array.isArray(value.cases)
  )
    throw new Error(
      'Predictions must identify evaluator/provenance and the exact grounding corpus digest',
    )
  const ids = new Set<string>()
  for (const row of value.cases) {
    if (
      !isObject(row) ||
      Object.keys(row).some(
        (key) =>
          ![
            'id',
            'step',
            'metric',
            'status',
            'unit',
            'queryDigest',
            'value',
            'sourceRef',
            'bodyDigest',
            'reason',
          ].includes(key),
      ) ||
      !text(row.id) ||
      ids.has(row.id) ||
      !corpus.cases.some((entry) => entry.id === row.id) ||
      !['observed', 'unknown'].includes(String(row.status)) ||
      !['ramp-exposure', 'measure-impact'].includes(String(row.step)) ||
      !text(row.metric) ||
      !text(row.unit) ||
      !text(row.queryDigest) ||
      !/^[a-f0-9]{64}$/.test(row.queryDigest)
    )
      throw new Error('Supply one complete explicit prediction per corpus case')
    if (
      row.status === 'observed' &&
      (typeof row.value !== 'number' ||
        !Number.isFinite(row.value) ||
        !text(row.sourceRef) ||
        !text(row.bodyDigest) ||
        row.reason !== undefined)
    )
      throw new Error(
        'Numeric assertions require a finite value and explicit query/source/body provenance',
      )
    if (
      row.status === 'unknown' &&
      (!text(row.reason) ||
        row.value !== undefined ||
        row.sourceRef !== undefined ||
        row.bodyDigest !== undefined)
    )
      throw new Error('Unknown predictions need reasons without invented values/provenance')
    ids.add(row.id)
  }
  if (ids.size !== corpus.cases.length)
    throw new Error('Predictions must cover every corpus case, including traps')
  return { evaluator: value.evaluator, cases: value.cases as unknown as GroundingPrediction[] }
}
export async function groundingEval(file: string, external?: unknown) {
  const { corpus, digest } = groundingCorpus(file)
  const input = external ?? {
    schema: 'wholeloop/grounding-predictions@1',
    corpusDigest: digest,
    evaluator: {
      name: 'core-grounding-collectors@1',
      provenance: 'synthetic',
      note: 'Actual ramp/impact collectors against an isolated scripted dataset; no model, network or production query ran.',
    },
    cases: await groundingPredictions(corpus),
  }
  const predictions = predictionsInput(input, corpus, digest)
  const cases = corpus.cases.map((row) => {
    const prediction = predictions.cases.find((entry) => entry.id === row.id)
    if (!prediction) throw new Error('Missing validated prediction')
    const identity =
      prediction.step === row.step &&
      prediction.metric === row.metric &&
      prediction.unit === row.unit &&
      prediction.queryDigest === queryDigest(row.query)
    const grounded =
      identity &&
      prediction.status === 'observed' &&
      row.truth.status === 'observed' &&
      prediction.value === row.truth.value &&
      prediction.sourceRef === row.response.ref &&
      prediction.bodyDigest === hash(row.response.body ?? '')
    const passed =
      identity && (row.truth.status === 'unknown' ? prediction.status === 'unknown' : grounded)
    return {
      id: row.id,
      step: row.step,
      metric: row.metric,
      expected: row.truth.status,
      prediction,
      grounded,
      passed,
      evidence: {
        query: row.query,
        queryDigest: queryDigest(row.query),
        unit: row.unit,
        source: row.response.ref,
        bodyDigest: hash(row.response.body ?? ''),
      },
      issue: passed
        ? null
        : prediction.status === 'observed'
          ? 'ungrounded-numeric-assertion'
          : 'missing-or-mismatched-observation',
    }
  })
  return {
    schema: 'wholeloop/grounding-eval@1',
    seed: corpus.seed,
    corpusDigest: digest,
    evaluator: predictions.evaluator,
    passed: cases.every((row) => row.passed),
    cases,
    perStep: ['ramp-exposure', 'measure-impact'].map((step) => {
      const rows = cases.filter((row) => row.step === step)
      return {
        step,
        cases: rows.length,
        numericAssertions: rows.filter((row) => row.prediction.status === 'observed').length,
        groundedAssertions: rows.filter((row) => row.grounded).length,
        trapMetrics: rows.filter((row) => row.expected === 'unknown').length,
        unknownTraps: rows.filter(
          (row) => row.expected === 'unknown' && row.prediction.status === 'unknown' && row.passed,
        ).length,
        failures: rows.filter((row) => !row.passed).length,
      }
    }),
    coverage: {
      evaluated: ['ramp-exposure', 'measure-impact'],
      notEvaluated: ['frame-problem', 'research', 'prepare-launch', 'decide-next'],
    },
    limitations:
      'Structured numeric grounding and deliberate missing-data traps only. Free-form narrative, qualitative statistics, model behavior and production source truth require separate host evaluation.',
  }
}

export function groundingInputs(file: string) {
  const { corpus, digest } = groundingCorpus(file)
  return {
    schema: 'wholeloop/grounding-inputs@1',
    seed: corpus.seed,
    corpusDigest: digest,
    at: corpus.at,
    supportedOperations: ['source.errors.query'],
    requirements:
      'Return one explicit observed value with exact unit/query/source/body hash or unknown with a reason for every case. Use only the supplied complete compatible source observations; unsupported operations have no observed result. Return wholeloop/grounding-predictions@1 with evaluator/provenance and the exact corpusDigest.',
    cases: [...corpus.cases]
      .sort((a, b) => hash(`${corpus.seed}/${a.id}`).localeCompare(hash(`${corpus.seed}/${b.id}`)))
      .map(({ truth: _truth, response, ...row }) => ({
        ...row,
        read:
          row.operation === 'source.errors.query'
            ? response
            : {
                status: 'unavailable',
                reason: 'The sandbox provider does not implement this operation',
              },
      })),
  }
}
