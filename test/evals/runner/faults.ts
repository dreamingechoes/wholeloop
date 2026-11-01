import { strict as assert } from 'node:assert'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  EXPECTED,
  effectBoundary,
  FAULT_BOUNDARIES,
  FAULT_OPERATIONS,
  type FaultResult,
} from '../../support/faults.js'

const destination = process.argv[2]
if (!destination) throw new Error('Provide a results directory')
const results: FaultResult[] = []
for (const operation of FAULT_OPERATIONS)
  for (const boundary of FAULT_BOUNDARIES) {
    const result = await effectBoundary(operation, boundary)
    assert.equal(result.writes, EXPECTED[boundary].writes, JSON.stringify(result))
    assert.equal(result.status, EXPECTED[boundary].status, JSON.stringify(result))
    assert.equal(result.secondIssueRefused, true, JSON.stringify(result))
    assert.equal(result.journalStableOnReplay, true, JSON.stringify(result))
    results.push(result)
    console.log(`${operation} · ${boundary}: ${result.status}, ${result.writes} write(s)`)
  }
const report = {
  status: 'passed',
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  results,
  duplicateEffects: 0,
  hostedSemantics: 'not-established',
  nativeAcceptance: 'not-established',
}
mkdirSync(destination, { recursive: true })
writeFileSync(join(destination, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify({ status: report.status, cells: results.length, duplicateEffects: 0 }))
