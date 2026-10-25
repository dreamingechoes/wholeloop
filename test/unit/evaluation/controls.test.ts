import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { loadEvaluationCatalog } from '../../../src/evaluation/catalog.js'
import { EvaluationSeeds } from '../../../src/evaluation/store.js'
import { checkOriginalFixture } from '../../evals/delivery/self-check.js'

it.each(['lookup-regression', 'durable-board', 'protocol-disagreement', 'policy-injection'])(
  'observes the actual fixed controls and sensitivity of %s',
  async (scenario) => {
    const directory = mkdtempSync(join(tmpdir(), 'wholeloop-fixture-controls-'))
    try {
      const catalog = loadEvaluationCatalog(
          resolve('test/fixtures/delivery-applications/catalog.json'),
        ),
        seeds = new EvaluationSeeds(join(directory, 'store')),
        baseline = await checkOriginalFixture(catalog, seeds, scenario, 'baseline'),
        reference = await checkOriginalFixture(catalog, seeds, scenario, 'reference')
      expect(baseline.status).toBe('passed')
      expect(reference.status).toBe('passed')
      expect(reference.cases.every((c) => c.status === 'passed')).toBe(true)
      if (scenario !== 'policy-injection') expect(baseline.relevantFailed.length).toBeGreaterThan(0)
      expect(reference).toMatchObject({
        authority: 'not-granted',
        nativeAcceptance: 'not-established',
        provenance: 'trusted-fixture-control',
      })
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  },
)
