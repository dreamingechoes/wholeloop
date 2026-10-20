import { createHash } from 'node:crypto'
import { isObject } from '../config/schema.js'
import { CONFORMANCE_TARGETS } from './contracts.js'
import { MATRIX_CHANNELS, matrixObservation, matrixTimestamp } from './matrix-input.js'

const maxAge = 48 * 60 * 60 * 1000

/** Supplied reports are observations, not an independent re-execution or attestation. */
export function conformanceMatrix(input: unknown, asOf: string) {
  if (
    !matrixTimestamp(asOf) ||
    !isObject(input) ||
    input.schema !== 'wholeloop/conformance-results@1' ||
    !Array.isArray(input.runs) ||
    input.runs.length > CONFORMANCE_TARGETS.length * MATRIX_CHANNELS.length
  )
    throw new Error('Use bounded wholeloop/conformance-results@1 observations and a UTC timestamp')
  const observations = input.runs.map(matrixObservation)
  const seen = new Set<string>()
  const ids = new Set<string>()
  for (const run of observations) {
    const key = `${run.cli}/${run.channel}`
    if (seen.has(key)) throw new Error('Duplicate CLI/channel conformance observation')
    seen.add(key)
    if (ids.has(run.id)) throw new Error('A conformance run cannot supply two matrix observations')
    ids.add(run.id)
    if (Date.parse(run.observedAt) > Date.parse(asOf))
      throw new Error('Conformance observation is in the future')
  }
  const rows = CONFORMANCE_TARGETS.flatMap((cli) =>
    MATRIX_CHANNELS.map((channel) => {
      const run = observations.find((run) => run.cli === cli && run.channel === channel)
      return {
        cli,
        channel,
        status: run?.status ?? 'UNRUN',
        evidence: run?.evidence ?? 'unrun',
        pin: run?.pin ?? null,
        version: run?.version ?? null,
        observedAt: run?.observedAt ?? null,
        freshness: !run
          ? 'unobserved'
          : Date.parse(asOf) - Date.parse(run.observedAt) > maxAge
            ? 'stale'
            : 'current',
        assertions: run?.assertions ?? [],
      }
    }),
  )
  const regressionCandidates = CONFORMANCE_TARGETS.flatMap((cli) => {
    const baseline = observations.find((run) => run.cli === cli && run.channel === 'pinned')
    const latest = observations.find((run) => run.cli === cli && run.channel === 'latest')
    if (
      !baseline ||
      !latest ||
      baseline.status !== 'PASS' ||
      latest.status !== 'FAIL' ||
      latest.evidence !== 'live-process-and-journal' ||
      !latest.processSucceeded ||
      latest.version !== latest.pin ||
      baseline.pin === latest.pin ||
      ![baseline, latest].every((run) => Date.parse(asOf) - Date.parse(run.observedAt) <= maxAge) ||
      !(['core', 'source', 'scenario', 'scenarioDigest'] as const).every(
        (key) => baseline[key] === latest[key],
      )
    )
      return []
    const binding = {
      cli,
      baseline: baseline.pin,
      latest: latest.pin,
      core: latest.core,
      source: latest.source,
      scenario: latest.scenario,
      scenarioDigest: latest.scenarioDigest,
      assertions: latest.assertions,
    }
    return [
      {
        key: createHash('sha256').update(JSON.stringify(binding)).digest('hex'),
        ...binding,
        baselineRun: baseline.id,
        latestRun: latest.id,
      },
    ]
  })
  return {
    schema: 'wholeloop/conformance-matrix@1',
    asOf,
    maxAgeHours: 48,
    rows,
    regressionCandidates,
    limitations: [
      'Supplied reports are not independently re-executed or authenticated by this renderer.',
      'Only standalone framing is covered; no native permission, hook, MCP or semantic quality claim follows.',
      'Simulation, missing observations and stale results never establish current native conformance.',
      'Regression candidates require fresh comparable successful processes; authentication and launch failures need separate diagnosis.',
    ],
  }
}

export function conformanceMatrixMarkdown(matrix: ReturnType<typeof conformanceMatrix>) {
  return [
    `As of ${matrix.asOf}; observations older than ${matrix.maxAgeHours} hours are stale.`,
    '',
    '| CLI | Channel | Requested pin | Observed version | Evidence | Status | Observed at |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...matrix.rows.map(
      (row) =>
        `| ${row.cli} | ${row.channel} | ${row.pin ?? '—'} | ${row.version ?? '—'} | ${row.evidence} | ${row.freshness === 'stale' ? 'STALE / ' : ''}${row.status} | ${row.observedAt ?? '—'} |`,
    ),
  ].join('\n')
}
