import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  groundingCorpus,
  groundingEval,
  groundingInputs,
  groundingPredictions,
} from '../../../src/grounding/eval.js'

const file = resolve('test/evals/grounding/corpus.json')
const baseline = () =>
  JSON.parse(readFileSync(resolve('test/evals/grounding/baseline.json'), 'utf8'))
async function predictions() {
  const { corpus, digest } = groundingCorpus(file)
  return {
    schema: 'wholeloop/grounding-predictions@1',
    corpusDigest: digest,
    evaluator: {
      name: 'synthetic-fixture@1',
      provenance: 'synthetic',
      note: 'Controlled judge inputs, not model output.',
    },
    cases: await groundingPredictions(corpus),
  }
}

describe('sandboxed numeric grounding evaluation', () => {
  it('exports opaque deterministically shuffled source inputs without labels or ineligible datapoints', () => {
    const inputs = groundingInputs(file)
    expect(inputs).toEqual(groundingInputs(file))
    expect(inputs.cases.map((row) => row.id)).not.toEqual(
      groundingCorpus(file).corpus.cases.map((row) => row.id),
    )
    expect(JSON.stringify(inputs)).not.toContain('truth')
    expect(
      inputs.cases
        .filter((row) => row.operation !== 'source.errors.query')
        .every((row) => 'status' in row.read && row.read.status === 'unavailable'),
    ).toBe(true)
    const cli = spawnSync(
      process.execPath,
      [resolve('dist/wl.mjs'), 'eval', 'grounding', file, '--inputs', '--json'],
      { encoding: 'utf8' },
    )
    expect(cli.status, cli.stderr).toBe(0)
    expect(JSON.parse(cli.stdout)).toEqual(inputs)
  })

  it('reproduces the fixed baseline through actual ramp and impact collectors, including genuine zero and signed values', async () => {
    const report = await groundingEval(file)
    expect(report).toEqual(baseline())
    expect(report.passed).toBe(true)
    expect(report.corpusDigest).toBe(
      '7342426d30c616b89f69e3a5a9533002bed2dd0992f20030625718bf7ae78899',
    )
    expect(report.perStep).toEqual(
      ['ramp-exposure', 'measure-impact'].map((step) => ({
        step,
        cases: 10,
        numericAssertions: 3,
        groundedAssertions: 3,
        trapMetrics: 7,
        unknownTraps: 7,
        failures: 0,
      })),
    )
    expect(report.cases.filter((row) => row.prediction.value === 0)).toHaveLength(2)
    expect(report.cases.filter((row) => row.prediction.value === -2)).toHaveLength(2)
    expect(report.coverage.notEvaluated).toContain('research')
  })

  it.each(['value', 'sourceRef', 'queryDigest', 'bodyDigest', 'unit'] as const)(
    'rejects a numeric assertion with changed %s provenance',
    async (field) => {
      const input = await predictions()
      const row = input.cases[0]
      if (!row) throw new Error('Missing fixture prediction')
      if (field === 'value') row.value = 18
      else if (field === 'sourceRef') row.sourceRef = 'https://example.com/different-query'
      else if (field === 'unit') row.unit = 'seconds'
      else row[field] = 'f'.repeat(64)
      const report = await groundingEval(file, input)
      expect(report.passed).toBe(false)
      expect(report.cases.filter((entry) => !entry.passed)).toHaveLength(1)
      expect(report.cases[0]?.issue).toBe('ungrounded-numeric-assertion')
    },
  )

  it('catches every trap when an evaluator invents reassuring zero values', async () => {
    const input = await predictions()
    const { corpus } = groundingCorpus(file)
    input.cases = input.cases.map((row) => {
      if (row.status !== 'unknown') return row
      const truth = corpus.cases.find((entry) => entry.id === row.id)
      const { reason: _reason, ...rest } = row
      return {
        ...rest,
        status: 'observed',
        value: 0,
        sourceRef: truth?.response.ref ?? '',
        bodyDigest: '0'.repeat(64),
      }
    })
    const report = await groundingEval(file, input)
    expect(report.passed).toBe(false)
    expect(report.perStep.map((row) => row.failures)).toEqual([7, 7])
    expect(report.cases.filter((row) => row.issue === 'ungrounded-numeric-assertion')).toHaveLength(
      14,
    )
  })

  it('does not give a perfect score to an evaluator that silently drops an observed zero', async () => {
    const input = await predictions()
    const row = input.cases[1]
    if (!row) throw new Error('Missing fixture zero')
    const { value: _value, sourceRef: _ref, bodyDigest: _digest, ...rest } = row
    input.cases[1] = { ...rest, status: 'unknown', reason: 'Missing external observation' }
    const report = await groundingEval(file, input)
    expect(report.passed).toBe(false)
    expect(report.cases[1]?.issue).toBe('missing-or-mismatched-observation')
  })

  it('requires exact digest, explicit evaluator and complete duplicate-free case coverage', async () => {
    const input = await predictions()
    for (const invalid of [
      { ...input, corpusDigest: '0'.repeat(64) },
      { ...input, evaluator: { name: 'Unknown' } },
      { ...input, cases: input.cases.slice(1) },
      { ...input, cases: [...input.cases, input.cases[0]] },
    ])
      await expect(groundingEval(file, invalid)).rejects.toThrow()
    const unknown = input.cases.find((row) => row.status === 'unknown')
    if (!unknown) throw new Error('Missing trap prediction')
    unknown.value = 0
    await expect(groundingEval(file, input)).rejects.toThrow('Unknown predictions')
  })

  it('binds exact dataset bytes and rejects malformed labels or destination operations', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wholeloop-grounding-'))
    try {
      const raw = readFileSync(file, 'utf8')
      const copy = join(dir, 'corpus.json')
      writeFileSync(copy, `${raw}\n`)
      expect(groundingCorpus(copy).digest).not.toBe(groundingCorpus(file).digest)
      for (const change of ['duplicate', 'destination', 'unknown-value', 'timestamp']) {
        const data = JSON.parse(raw)
        if (change === 'duplicate') data.cases.push(data.cases[0])
        else if (change === 'destination') data.cases[0].operation = 'comms.draft'
        else if (change === 'timestamp') data.at = '2026-10-01'
        else {
          data.cases[0].truth.status = 'unknown'
          data.cases[0].truth.value = 0
        }
        writeFileSync(copy, JSON.stringify(data))
        expect(() => groundingCorpus(copy)).toThrow()
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('runs byte-identical compiled baselines and exits with failure for external hallucinated observations', async () => {
    const cli = (...args: string[]) =>
      spawnSync(
        process.execPath,
        [resolve('dist/wl.mjs'), 'eval', 'grounding', file, ...args, '--json'],
        { encoding: 'utf8' },
      )
    const first = cli()
    const second = cli()
    expect(first.status, first.stderr).toBe(0)
    expect(second.stdout).toBe(first.stdout)
    expect(JSON.parse(first.stdout)).toEqual(baseline())
    const dir = mkdtempSync(join(tmpdir(), 'wholeloop-grounding-cli-'))
    try {
      const input = await predictions()
      const row = input.cases[0]
      if (!row) throw new Error('Missing fixture prediction')
      row.value = 999
      const external = join(dir, 'predictions.json')
      writeFileSync(external, JSON.stringify(input))
      const result = cli('--predictions', external)
      expect(result.status, result.stderr).toBe(4)
      expect(JSON.parse(result.stdout).passed).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
