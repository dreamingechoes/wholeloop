import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { AcceptancePlan } from '../../../src/acceptance/contracts.js'
import type { IntegrationCandidate } from '../../../src/integration/observe.js'
import { integrationVerificationSelection } from '../../../src/integration/verification.js'

// Complete typed policy data, without a prepared integration or acceptance receipt.
function fixture(count: number) {
  const candidate: IntegrationCandidate = {
    schema: 'wholeloop/integration-candidate@1',
    run: 'delivery-0000000000000000',
    revision: 1,
    plan: 'a'.repeat(64),
    source: 'b'.repeat(64),
    milestone: 'search',
    strategy: 'ordered-merge',
    parts: [],
    assemblies: [],
    contracts: Array.from({ length: count }, (_, index) => ({
      id: `contract-${index}`,
      revision: 'v1',
      sha256: index.toString(16).padStart(64, '0'),
    })),
    inputs: [],
    repairOwners: [],
    guidance: [],
    dependencies: {
      milestones: ['search'],
      work: [],
      waves: [],
      criteria: Array.from({ length: count }, (_, index) => `criterion-${index}`),
      procedure: 'Run the approved combined procedure.',
    },
    inputIdentity: 'c'.repeat(64),
    execution: 'not-performed',
    acceptance: 'not-established',
    publication: 'not-performed',
  }
  const plan: AcceptancePlan = {
    schema: 'wholeloop/acceptance-plan@1',
    run: candidate.run,
    revision: 1,
    plan: candidate.plan,
    source: candidate.source,
    cases: Array.from({ length: count }, (_, index) => ({
      id: `case-${index}`,
      criteria: [`criterion-${index}`],
      owner: 'machine',
      applicability: 'applicable',
      rationale: 'Retain declared integration coverage.',
      initial: 'The isolated policy fixture is ready.',
      actions: [candidate.dependencies.procedure],
      assertions: [],
      failureConditions: [],
      runner: { kind: 'api', capability: 'http.request', input: '{}' },
      fixture: { ref: `fixture:case-${index}`, sha256: index.toString(16).padStart(64, '0') },
      timeoutMs: 1000,
    })),
    retention: { reviewAfterMs: 86400000, expiryAction: 'retain' },
  }
  return { candidate, plan }
}
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

describe('fresh integration acceptance selection', () => {
  it.each([100, 400])('selects %i criterion/contract bindings in one case traversal', (count) => {
    const { candidate, plan } = fixture(count),
      before = digest([candidate, plan])
    let applicability = 0,
      criteria = 0,
      fingerprints = 0
    for (const test of plan.cases) {
      const declared = test.criteria,
        status = test.applicability,
        fingerprint = test.fixture.sha256
      Object.defineProperty(test, 'applicability', {
        enumerable: true,
        get() {
          applicability++
          return status
        },
      })
      Object.defineProperty(test, 'criteria', {
        enumerable: true,
        get() {
          criteria++
          return declared
        },
      })
      Object.defineProperty(test.fixture, 'sha256', {
        enumerable: true,
        get() {
          fingerprints++
          return fingerprint
        },
      })
    }
    const result = integrationVerificationSelection(candidate, plan),
      fields = { count, applicability, criteria, fingerprints },
      hash = digest(result)
    console.info('Integration case selection:', JSON.stringify({ ...fields, hash }))
    expect(result.missing).toEqual([])
    expect(result.checks).toHaveLength(count * 2 + 1)
    expect(result.cases).toHaveLength(count)
    expect(hash).toBe(
      count === 100
        ? '6f9433fdd6c23f17ef4079b9edfb002eaac2089968e38467678e6eca52cffef2'
        : '823e9267826de3f493f8dce3655e2722cadf6e13b94db48a6cd7638ba07cedc1',
    )
    expect(fields).toEqual({ count, applicability: count, criteria: count, fingerprints: count })
    expect(digest([candidate, plan])).toBe(before)
  })
  it('preserves source order, duplicate weighting and independent check arrays', () => {
    const { candidate, plan } = fixture(2),
      first = plan.cases[0],
      second = plan.cases[1],
      contract = candidate.contracts[0]
    if (!first || !second || !contract) throw new Error('Missing selection data')
    first.criteria.push('criterion-0')
    second.criteria = ['criterion-0']
    second.fixture.sha256 = first.fixture.sha256
    plan.cases.reverse()
    candidate.dependencies.criteria = ['criterion-0', 'criterion-0', 'missing']
    candidate.contracts = [contract, { ...contract }]
    const result = integrationVerificationSelection(candidate, plan)
    expect(result.checks.map((check) => check.cases)).toEqual([
      ['case-1', 'case-0'],
      ['case-1', 'case-0'],
      [],
      ['case-1', 'case-0'],
      ['case-1', 'case-0'],
      ['case-1', 'case-0'],
    ])
    expect(result.cases).toEqual(['case-0', 'case-1'])
    expect(result.missing).toEqual(['criterion:missing'])
    result.checks[0]?.cases.push('caller-edit')
    expect(result.checks[1]?.cases).toEqual(['case-1', 'case-0'])
    expect(result.checks[3]?.cases).not.toBe(result.checks[4]?.cases)
  })
  it('keeps human criterion coverage separate from machine contract/procedure coverage', () => {
    const { candidate, plan } = fixture(2),
      first = plan.cases[0],
      second = plan.cases[1]
    if (!first || !second) throw new Error('Missing selection data')
    first.owner = 'human'
    second.applicability = 'not-applicable'
    expect(integrationVerificationSelection(candidate, plan)).toEqual({
      checks: [
        { kind: 'criterion', id: 'criterion-0', cases: ['case-0'] },
        { kind: 'criterion', id: 'criterion-1', cases: [] },
        { kind: 'contract', id: 'contract-0', cases: [] },
        { kind: 'contract', id: 'contract-1', cases: [] },
        { kind: 'procedure', id: 'search', cases: [] },
      ],
      cases: ['case-0'],
      missing: [
        'criterion:criterion-1',
        'contract:contract-0',
        'contract:contract-1',
        'procedure:search',
      ],
    })
    first.owner = 'machine'
    expect(integrationVerificationSelection(candidate, plan).missing).toEqual([
      'criterion:criterion-1',
      'contract:contract-1',
    ])
  })
})
