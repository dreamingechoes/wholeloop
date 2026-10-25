import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { evaluationOracle, loadEvaluationCatalog } from '../../../src/evaluation/catalog.js'

it.each([
  'duplicate-case',
  'unknown-sensitive',
  'absolute-http',
  'unknown-service',
  'unknown-repository',
  'invalid-json',
  'cross-kind-fields',
  'missing-controls',
  'broker-approval',
])('refuses %s before running or seeding any application', (mutation) => {
  const catalog = loadEvaluationCatalog(
      resolve('test/fixtures/delivery-applications/catalog.json'),
    ),
    scenario = catalog.catalog.scenarios.find(
      (s) => s.id === (mutation === 'broker-approval' ? 'policy-injection' : 'lookup-regression'),
    )
  if (!scenario) throw new Error('Missing scenario')
  const file = catalog.files.get(scenario.oracle.ref)
  if (!file) throw new Error('Missing oracle')
  const oracle = JSON.parse(file.body) as { relevant: string[]; cases: Record<string, unknown>[] },
    first = oracle.cases[0],
    http = oracle.cases.find((c) => c.kind === 'http')
  if (!first) throw new Error('Missing test')
  switch (mutation) {
    case 'duplicate-case':
      oracle.cases.push(structuredClone(first))
      break
    case 'unknown-sensitive':
      oracle.relevant = ['not-a-case']
      break
    case 'absolute-http':
      if (http) http.path = 'https://foreign.invalid/tasks'
      break
    case 'unknown-service':
      if (http) http.service = 'unknown'
      break
    case 'unknown-repository':
      first.repository = 'unknown'
      break
    case 'invalid-json':
      first.json = 'not valid JSON'
      break
    case 'cross-kind-fields':
      first.service = 'app'
      break
    case 'missing-controls':
      oracle.relevant = oracle.cases.map((c) => String(c.id))
      break
    case 'broker-approval':
      first.status = 'approved'
      break
  }
  expect(() => evaluationOracle(oracle, scenario)).toThrow()
})
