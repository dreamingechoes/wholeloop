import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { conformanceMatrix, conformanceMatrixMarkdown } from '../../../src/conformance/matrix.js'

const at = '2026-10-20T12:00:00.000Z'
// These are supplied report fixtures, not executions of native models.
function supplied(channel: 'pinned' | 'latest') {
  const pin = channel === 'pinned' ? '1.2.3' : '1.2.4'
  return {
    channel,
    observedAt: '2026-10-20T11:00:00.000Z',
    report: {
      schema: 'wholeloop/conformance-report@1',
      id: `cf-${(channel === 'pinned' ? 'a' : 'b').repeat(24)}`,
      cli: 'claude',
      pin,
      step: 'frame-problem',
      evidence: 'live-process-and-journal',
      status: channel === 'pinned' ? 'PASS' : 'FAIL',
      missing: channel === 'pinned' ? [] : ['note.added:installed-skill-marker'],
      problems: [] as string[],
      subject: 'init-01234567',
      process: {
        status: 'succeeded',
        code: 0 as number | null,
        signal: null as string | null,
        version: pin,
      },
      scenario: 'standalone-frame-v1',
      scenarioDigest: 'c'.repeat(64),
      core: 'd'.repeat(64),
      source: 'e'.repeat(64),
      limitations: ['Supplied fixture only'],
    },
  }
}
const batch = (runs: unknown[] = []) => ({ schema: 'wholeloop/conformance-results@1', runs })

describe('conformance observation matrix', () => {
  it('renders every target/channel unrun when no observations exist', () => {
    const matrix = conformanceMatrix(batch(), at)
    expect(matrix.rows).toHaveLength(14)
    expect(
      matrix.rows.every((row) => row.status === 'UNRUN' && row.freshness === 'unobserved'),
    ).toBe(true)
    expect(matrix.regressionCandidates).toEqual([])
    expect(matrix.limitations.join(' ')).toContain('not independently re-executed')
    const markdown = conformanceMatrixMarkdown(matrix)
    expect(markdown).toContain(`As of ${at}`)
    expect(markdown).toContain('| cursor | latest | — | — | unrun | UNRUN | — |')
    expect(markdown).not.toContain('| PASS |')
  })
  it('identifies a fresh comparable assertion regression with a deterministic deduplication key', () => {
    const runs = [supplied('pinned'), supplied('latest')]
    const matrix = conformanceMatrix(batch(runs), at)
    expect(matrix.regressionCandidates).toEqual([
      expect.objectContaining({
        cli: 'claude',
        baseline: '1.2.3',
        latest: '1.2.4',
        assertions: ['note.added:installed-skill-marker'],
        key: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    ])
    expect(conformanceMatrix(batch([...runs].reverse()), at)).toEqual(matrix)
    const candidate = matrix.regressionCandidates[0]
    expect(candidate?.baselineRun).not.toBe(candidate?.latestRun)
  })
  it.each([
    'simulation',
    'stale',
    'core',
    'source',
    'scenarioDigest',
    'version',
    'same-version',
    'launch',
    'timeout',
  ])('does not promote %s evidence into a native regression', (kind) => {
    const baseline = supplied('pinned'),
      latest = supplied('latest')
    if (kind === 'simulation') {
      baseline.report.status = 'FIXTURE_PASS'
      baseline.report.evidence = 'simulation'
    } else if (kind === 'stale') baseline.observedAt = '2026-10-17T11:00:00.000Z'
    else if (kind === 'core' || kind === 'source' || kind === 'scenarioDigest')
      latest.report[kind] = 'f'.repeat(64)
    else if (kind === 'version') latest.report.process.version = '1.2.5'
    else if (kind === 'same-version')
      latest.report.process.version = latest.report.pin = baseline.report.pin
    else {
      latest.report.process.status = kind === 'timeout' ? 'timeout' : 'crashed'
      latest.report.process.code = null
      latest.report.process.signal = 'SIGTERM'
    }
    expect(conformanceMatrix(batch([baseline, latest]), at).regressionCandidates).toEqual([])
  })
  it('labels stale and simulated observations without implying current native support', () => {
    const run = supplied('pinned')
    run.observedAt = '2026-10-17T11:00:00.000Z'
    run.report.status = 'FIXTURE_PASS'
    run.report.evidence = 'simulation'
    const matrix = conformanceMatrix(batch([run]), at)
    expect(conformanceMatrixMarkdown(matrix)).toContain('| simulation | STALE / FIXTURE_PASS |')
    expect(matrix.rows.find((row) => row.channel === 'latest')?.status).toBe('UNRUN')
  })
  it('deduplicates and sorts failure assertion codes before keying a candidate', () => {
    const latest = supplied('latest')
    latest.report.problems = ['workspace-changed', 'invalid-framing-artifact', 'workspace-changed']
    const first = conformanceMatrix(batch([supplied('pinned'), latest]), at)
    latest.report.problems.reverse()
    expect(conformanceMatrix(batch([latest, supplied('pinned')]), at)).toEqual(first)
  })
  it.each([
    'duplicate-channel',
    'duplicate-run',
    'future',
    'cli',
    'pin',
    'assertion',
    'hash',
    'id',
    'status',
    'simulation-pass',
    'missing-version',
    'missing-process',
    'failed-pass',
    'empty-fail',
  ])('rejects inconsistent or unsafe %s reports without echoing their contents', (kind) => {
    const run = supplied('pinned'),
      other = supplied('latest')
    const runs = [run, other]
    if (kind === 'duplicate-channel') other.channel = run.channel
    else if (kind === 'duplicate-run') other.report.id = run.report.id
    else if (kind === 'future') run.observedAt = '2026-10-21T11:00:00.000Z'
    else if (kind === 'cli') run.report.cli = 'unknown'
    else if (kind === 'pin') run.report.pin = 'secret|injected\nrow'
    else if (kind === 'assertion') other.report.missing = ['secret|injected\nrow']
    else if (kind === 'hash') run.report.core = 'unknown'
    else if (kind === 'id') run.report.id = 'not-a-run'
    else if (kind === 'status') run.report.status = 'GREEN'
    else if (kind === 'simulation-pass') run.report.evidence = 'simulation'
    else if (kind === 'missing-version') Reflect.deleteProperty(run.report.process, 'version')
    else if (kind === 'missing-process') Reflect.deleteProperty(run.report, 'process')
    else if (kind === 'failed-pass') run.report.process.code = 1
    else other.report.missing = []
    expect(() => conformanceMatrix(batch(runs), at)).toThrow()
    try {
      conformanceMatrix(batch(runs), at)
    } catch (error) {
      expect(String(error)).not.toContain('secret')
    }
  })
  it.each([
    null,
    {},
    { schema: 'wholeloop/conformance-results@2', runs: [] },
    batch(Array(15).fill(null)),
  ])('rejects unknown or oversized input %#', (input) =>
    expect(() => conformanceMatrix(input, at)).toThrow(),
  )
  it('rejects ambiguous timestamps and a latest failure without a passing baseline', () => {
    expect(() => conformanceMatrix(batch(), '2026-10-20')).toThrow()
    expect(conformanceMatrix(batch([supplied('latest')]), at).regressionCandidates).toEqual([])
  })
  it('executes the compiled read-only renderer, candidate exit and bounded redacted refusals', () => {
    const root = mkdtempSync(join(tmpdir(), 'wholeloop-matrix-'))
    const file = join(root, 'results.json')
    const cli = (args: string[]) =>
      spawnSync(
        process.execPath,
        [resolve('dist/wl.mjs'), 'conformance', 'matrix', file, '--at', at, ...args],
        { cwd: root, encoding: 'utf8' },
      )
    try {
      writeFileSync(file, JSON.stringify(batch()))
      const empty = cli(['--json'])
      expect(empty.status, empty.stderr).toBe(0)
      expect(JSON.parse(empty.stdout).rows).toHaveLength(14)
      expect(readdirSync(root)).toEqual(['results.json'])
      writeFileSync(file, JSON.stringify(batch([supplied('pinned'), supplied('latest')])))
      const before = readFileSync(file, 'utf8')
      const rendered = cli(['--markdown'])
      expect(rendered.status, rendered.stderr).toBe(4)
      expect(rendered.stdout).toContain('| live-process-and-journal | PASS |')
      expect(readFileSync(file, 'utf8')).toBe(before)
      expect(cli(['--json', '--markdown']).status).toBe(4)
      writeFileSync(file, 'secret-not-json')
      const invalid = cli(['--json'])
      expect(invalid.status).toBe(4)
      expect(invalid.stdout + invalid.stderr).not.toContain('secret-not-json')
      writeFileSync(file, ' '.repeat(1024 * 1024 + 1))
      expect(cli(['--json']).status).toBe(4)
      const alias = join(root, 'alias.json')
      symlinkSync(file, alias)
      const refused = spawnSync(
        process.execPath,
        [resolve('dist/wl.mjs'), 'conformance', 'matrix', alias, '--json'],
        { encoding: 'utf8' },
      )
      expect(refused.status).toBe(4)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
