import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  gateEvaluationInputs,
  gateEvaluationReport,
  loadGateCorpus,
  parseGatePredictions,
} from '../../../src/gates/eval.js'

const file = fileURLToPath(new URL('../../evals/gates/corpus.json', import.meta.url))
const baseline = JSON.parse(readFileSync(join(dirname(file), 'baseline.json'), 'utf8'))
const predictions = () =>
  JSON.parse(readFileSync(join(dirname(file), 'baseline-predictions.json'), 'utf8'))
const report = (value = predictions()) => {
  const corpus = loadGateCorpus(file)
  return gateEvaluationReport(corpus, parseGatePredictions(value, corpus))
}
function fixture(run: (root: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-gate-eval-'))
  try {
    cpSync(dirname(file), join(dir, 'corpus'), { recursive: true })
    run(join(dir, 'corpus'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('per-lens evaluation before and after refutation', () => {
  it('reproduces the fixed synthetic baseline and reports fail-safe false positives honestly', () => {
    const actual = report()
    expect(actual).toEqual(baseline)
    expect(actual.cases).toBe(24)
    expect(actual.provenance).toBe('synthetic')
    expect(actual.totals.before).toMatchObject({
      tp: 6,
      fp: 6,
      tn: 6,
      fn: 6,
      recall: 0.5,
      coverage: 1,
    })
    expect(actual.totals.after).toMatchObject({
      tp: 6,
      fp: 2,
      tn: 10,
      fn: 6,
      recall: 0.5,
      falseAlarmRate: 1 / 6,
    })
    expect(actual.lenses.find((entry) => entry.lens === 'correctness')?.after.fp).toBe(1)
    expect(actual.lenses.find((entry) => entry.lens === 'simplicity')?.after.fp).toBe(0)
    expect(report()).toEqual(actual)
  })

  it('keeps unavailable observations unknown rather than turning them into negatives or misses', () => {
    const input = predictions()
    input.results[0].result = {
      unit: 'correctness',
      status: 'unavailable',
      evidence: [],
      findings: [],
      reason: 'Synthetic worker unavailable',
    }
    input.results[0].votes = []
    const actual = report(input)
    expect(actual.totals.before).toMatchObject({ tp: 5, fn: 6, unknown: 1, coverage: 23 / 24 })
    expect(actual.totals.after.unknown).toBe(1)
    expect(actual.outcomes[0]?.missing).toEqual(['correctness'])
    for (const entry of input.results) {
      entry.result = {
        unit: entry.result.unit,
        status: 'unavailable',
        evidence: [],
        findings: [],
        reason: 'No observation',
      }
      entry.votes = []
    }
    expect(report(input).totals.before).toMatchObject({
      tp: 0,
      fp: 0,
      tn: 0,
      fn: 0,
      unknown: 24,
      recall: null,
      precision: null,
      falseAlarmRate: null,
      coverage: 0,
    })
  })

  it('shows that incorrect unanimous refutations can lose real defects and that full fail-safe refutation drops a false alarm', () => {
    const input = predictions()
    input.results[0].votes = input.results[0].votes.map((vote: Record<string, unknown>) => ({
      ...vote,
      outcome: 'refute',
    }))
    input.results[2].votes[2].outcome = 'refute'
    const actual = report(input)
    expect(actual.totals.after).toMatchObject({ tp: 5, fn: 7, fp: 1, tn: 11 })
    expect(actual.outcomes[0]?.dropped).toEqual(['correctness:finding'])
  })

  it('respects larger verifier quorums without treating silent slots as refutations', () => {
    const input = predictions()
    input.verifiers = 5
    expect(report(input).totals.after.fp).toBe(6)
    expect(report(input).verificationCoverage).toBe(3 / 5)
    const sample = input.results[6]
    sample.votes.push({ ...sample.votes[0], verifier: 4 })
    expect(report(input).totals.after.fp).toBe(5)
  })

  it('rejects missing cases, duplicate slots, unknown findings/lenses and mismatched digests', () => {
    for (const change of [
      (value: ReturnType<typeof predictions>) => {
        value.results.pop()
      },
      (value: ReturnType<typeof predictions>) => {
        value.results[1] = value.results[0]
      },
      (value: ReturnType<typeof predictions>) => {
        value.results[0].votes.push(value.results[0].votes[0])
      },
      (value: ReturnType<typeof predictions>) => {
        value.results[0].votes[0].verifier = 9
      },
      (value: ReturnType<typeof predictions>) => {
        value.results[0].votes[0].finding = 'correctness:unknown'
      },
      (value: ReturnType<typeof predictions>) => {
        value.results[0].result.unit = 'unknown-lens'
      },
      (value: ReturnType<typeof predictions>) => {
        value.corpusSha256 = 'a'.repeat(64)
      },
      (value: ReturnType<typeof predictions>) => {
        value.provenance = 'unlabelled'
      },
    ]) {
      const input = predictions()
      change(input)
      expect(() => report(input)).toThrow()
    }
  })

  it('exports blind inputs without gold labels/reasons and preserves explicit recorded provenance', () => {
    const inputs = gateEvaluationInputs(loadGateCorpus(file))
    expect(inputs.cases).toHaveLength(24)
    expect(inputs.cases.some((entry) => entry.content.includes('account.name'))).toBe(true)
    expect(JSON.stringify(inputs)).not.toContain('"defect":')
    expect(JSON.stringify(inputs)).not.toContain('"why":')
    const input = predictions()
    input.provenance = 'recorded'
    input.evaluator = 'caller-supplied-observations'
    expect(report(input).provenance).toBe('recorded') // Metadata records a claim; it does not authenticate an evaluator.
  })

  it('binds labels and exact snippet bytes, rejects path escapes and requires positive/negative coverage', () =>
    fixture((root) => {
      const path = join(root, 'corpus.json')
      const manifest = JSON.parse(readFileSync(path, 'utf8'))
      const before = loadGateCorpus(path)
      writeFileSync(join(root, manifest.cases[0].artifact), 'Changed snippet\n')
      expect(loadGateCorpus(path).sha256).not.toBe(before.sha256)
      expect(() => parseGatePredictions(predictions(), loadGateCorpus(path))).toThrow(
        'exact corpus digest',
      )
      manifest.cases[0].artifact = '../outside.txt'
      writeFileSync(path, JSON.stringify(manifest))
      expect(() => loadGateCorpus(path)).toThrow('Invalid gate case')
      manifest.cases[0].artifact = 'escape.txt'
      writeFileSync(join(root, '../outside.txt'), 'Harmless external fixture\n')
      symlinkSync(join(root, '../outside.txt'), join(root, 'escape.txt'))
      writeFileSync(path, JSON.stringify(manifest))
      expect(() => loadGateCorpus(path)).toThrow('escapes its corpus')
      manifest.cases = manifest.cases.filter((entry: { lens: string }) => entry.lens !== 'security')
      manifest.cases[0].artifact = manifest.cases[1].artifact
      writeFileSync(path, JSON.stringify(manifest))
      expect(() => loadGateCorpus(path)).toThrow('Each built-in lens')
    }))

  it('produces byte-identical compiled CLI reports and refuses scoring without observations', () => {
    const call = (...args: string[]) =>
      spawnSync(
        process.execPath,
        [resolve('dist/wl.mjs'), 'eval', 'gates', file, ...args, '--json'],
        { encoding: 'utf8' },
      )
    const args = ['--predictions', join(dirname(file), 'baseline-predictions.json')]
    const first = call(...args)
    expect(first.status).toBe(0)
    expect(JSON.parse(first.stdout)).toEqual(baseline)
    expect(call(...args).stdout).toBe(first.stdout)
    expect(call().status).toBe(2)
    const blind = call('--inputs')
    expect(blind.status).toBe(0)
    expect(JSON.parse(blind.stdout).schema).toBe('wholeloop/gate-eval-inputs@1')
  })
})
