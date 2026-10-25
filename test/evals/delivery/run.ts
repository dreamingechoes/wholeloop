import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { acceptanceShape } from '../../../src/acceptance/contracts.js'
import { loadEvaluationCatalog } from '../../../src/evaluation/catalog.js'
import controlsSchema from '../../../src/evaluation/schemas/fixture-controls-v1.json' with {
  type: 'json',
}
import { EvaluationSeeds } from '../../../src/evaluation/store.js'
import { checkOriginalFixture } from './self-check.js'

const destination = process.argv[2],
  manifest = process.argv[3]
if (!destination || !manifest)
  throw new Error('Provide an external result directory and the reviewed catalog')
mkdirSync(destination, { recursive: true })
const report = {
  schema: 'wholeloop/evaluation-fixture-controls@1',
  status: 'failed',
  controller: { os: process.platform, architecture: process.arch, node: process.version },
  scope:
    'Actual trusted original control processes, loopback HTTP and deterministic broker fixtures only; browser journeys, native agents, containment and hosted publication are not certified.',
  catalog: '',
  results: [] as Awaited<ReturnType<typeof checkOriginalFixture>>[],
  reason: '',
}
try {
  const root = dirname(manifest),
    baseline = JSON.parse(readFileSync(join(root, 'baseline.json'), 'utf8')) as {
      files: Record<string, string>
    }
  for (const [ref, expected] of Object.entries(baseline.files))
    assert.equal(
      createHash('sha256')
        .update(readFileSync(join(root, ref)))
        .digest('hex'),
      expected,
      `Changed reviewed literal: ${ref}`,
    )
  const loaded = loadEvaluationCatalog(manifest),
    seeds = new EvaluationSeeds(join(destination, 'state'))
  report.catalog = loaded.digest
  for (const scenario of loaded.catalog.scenarios)
    for (const variant of ['baseline', 'reference'] as const) {
      const result = await checkOriginalFixture(loaded, seeds, scenario.id, variant)
      report.results.push(result)
      console.log(`Observed: ${scenario.id}/${variant}: ${result.status}`)
      assert.equal(result.status, 'passed', JSON.stringify(result))
    }
  report.status = 'passed'
} catch (error) {
  report.reason = error instanceof Error ? error.message : 'Unavailable fixture controls'
  process.exitCode = 1
} finally {
  acceptanceShape(report, controlsSchema)
  writeFileSync(join(destination, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report, null, 2))
}
