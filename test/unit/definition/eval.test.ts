import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  type DefinitionCorpus,
  definitionReport,
  loadDefinitionCorpus,
  parsePredictions,
} from '../../../src/definition/eval.js'

const file = fileURLToPath(new URL('../../evals/definition/corpus.json', import.meta.url))
const baseline = JSON.parse(
  readFileSync(new URL('../../evals/definition/baseline.json', import.meta.url), 'utf8'),
)
function fixture(run: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-definition-eval-'))
  try {
    run(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('reproducible definition evaluation', () => {
  it('reproduces the committed baseline and keeps semantic misses visible', () => {
    const corpus = loadDefinitionCorpus(file)
    const report = definitionReport(corpus)
    expect(report).toEqual(baseline)
    expect(report.cases).toBe(30)
    expect(report.totals).toMatchObject({ tp: 18, fp: 0, fn: 2, recall: 0.9, falseAlarmRate: 0 })
    expect(
      report.outcomes.filter((outcome) => outcome.missed.length).map((outcome) => outcome.case),
    ).toEqual(['semantic-http-conflict', 'semantic-unrelated-deliveries'])
    expect(definitionReport(loadDefinitionCorpus(file))).toEqual(report)
  })

  it('calculates misses, false alarms and undefined ratios independently of the detector', () => {
    const corpus: DefinitionCorpus = {
      seed: 'arithmetic-fixture',
      sha256: 'fixed',
      cases: [
        {
          id: 'defective',
          mode: 'criteria',
          artifact: 'first.json',
          expected: ['vague-wording'],
          why: 'Positive label',
          content: '{}',
        },
        {
          id: 'clean',
          mode: 'criteria',
          artifact: 'second.json',
          expected: [],
          why: 'Negative label',
          content: '{}',
        },
      ],
    }
    const report = definitionReport(corpus, {
      evaluator: 'scripted-confusion-fixture',
      results: [
        { case: 'defective', defects: [] },
        { case: 'clean', defects: ['vague-wording'] },
      ],
    })
    expect(report.classes.find((row) => row.defect === 'vague-wording')).toEqual({
      defect: 'vague-wording',
      tp: 0,
      fp: 1,
      tn: 0,
      fn: 1,
      recall: 0,
      falseAlarmRate: 1,
      precision: 0,
    })
    expect(report.classes.find((row) => row.defect === 'missing-source')).toMatchObject({
      tp: 0,
      fp: 0,
      tn: 2,
      fn: 0,
      recall: null,
      precision: null,
      falseAlarmRate: 0,
    })
    expect(report.outcomes[1]?.falseAlarms).toEqual(['vague-wording'])
  })

  it('scores complete external predictions and refuses mismatched, missing or duplicate results', () => {
    const corpus = loadDefinitionCorpus(file)
    const value = {
      schema: 'wholeloop/definition-predictions@1',
      corpusSha256: corpus.sha256,
      evaluator: 'scripted-perfect-labels',
      results: corpus.cases.map((entry) => ({ case: entry.id, defects: entry.expected })),
    }
    expect(definitionReport(corpus, parsePredictions(value, corpus)).totals).toMatchObject({
      tp: 20,
      fp: 0,
      fn: 0,
      recall: 1,
      falseAlarmRate: 0,
    })
    for (const changed of [
      { ...value, corpusSha256: 'another-seed' },
      { ...value, results: value.results.slice(1) },
      { ...value, results: [value.results[0], ...value.results.slice(0, -1)] },
      { ...value, results: [{ case: 'unknown-case', defects: [] }, ...value.results.slice(1)] },
      {
        ...value,
        results: [
          { case: value.results[0]?.case, defects: ['invented-class'] },
          ...value.results.slice(1),
        ],
      },
    ])
      expect(() => parsePredictions(changed, corpus)).toThrow()
  })

  it('binds labels and exact artifact bytes into the digest and rejects unsafe corpus references', () =>
    fixture((dir) => {
      const artifact = join(dir, 'criteria.json')
      const manifest = join(dir, 'corpus.json')
      const entry = {
        id: 'sample',
        mode: 'criteria',
        artifact: 'criteria.json',
        expected: [],
        why: 'Corpus fixture',
      }
      const write = (change = {}) =>
        writeFileSync(
          manifest,
          JSON.stringify({
            schema: 'wholeloop/definition-corpus@1',
            seed: 'fixed',
            cases: [{ ...entry, ...change }],
          }),
        )
      writeFileSync(artifact, '{}')
      write()
      const original = loadDefinitionCorpus(manifest).sha256
      writeFileSync(artifact, '{ }')
      expect(loadDefinitionCorpus(manifest).sha256).not.toBe(original)
      write({ expected: ['vague-wording'] })
      expect(loadDefinitionCorpus(manifest).sha256).not.toBe(original)
      for (const change of [
        { artifact: '../outside.json' },
        { artifact },
        { expected: ['unknown'] },
        { expected: ['vague-wording', 'vague-wording'] },
      ]) {
        write(change)
        expect(() => loadDefinitionCorpus(manifest)).toThrow()
      }
      symlinkSync(file, join(dir, 'outside.json'))
      write({ artifact: 'outside.json' })
      expect(() => loadDefinitionCorpus(manifest)).toThrow('escapes')
    }))

  it('runs the compiled CLI twice with byte-identical output and scores supplied predictions', () =>
    fixture((dir) => {
      const cli = (...args: string[]) =>
        spawnSync(
          process.execPath,
          [resolve('dist/wl.mjs'), 'eval', 'definitions', file, ...args, '--json'],
          { cwd: dir, encoding: 'utf8' },
        )
      const a = cli()
      const b = cli()
      expect(a.status).toBe(0)
      expect(a.stdout).toBe(b.stdout)
      expect(JSON.parse(a.stdout)).toEqual(baseline)
      const corpus = loadDefinitionCorpus(file)
      const predictions = join(dir, 'predictions.json')
      writeFileSync(
        predictions,
        JSON.stringify({
          schema: 'wholeloop/definition-predictions@1',
          corpusSha256: corpus.sha256,
          evaluator: 'scripted-label-fixture',
          results: corpus.cases.map((entry) => ({ case: entry.id, defects: entry.expected })),
        }),
      )
      const response = cli('--predictions', predictions)
      expect(response.status).toBe(0)
      expect(JSON.parse(response.stdout).totals.recall).toBe(1)
    }))
})
