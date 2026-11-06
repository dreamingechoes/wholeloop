import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { GatePlan, GateResult, GateVote } from '../../../src/gates/contracts.js'
import { gateReport } from '../../../src/gates/report.js'

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Fixture entry missing')
  return value
}

function fixture(size: number) {
  let accesses = 0
  const count = <T extends object>(value: T) =>
      new Proxy(value, {
        get(target, property, receiver) {
          accesses++
          return Reflect.get(target, property, receiver)
        },
      }),
    results: GateResult[] = Array.from({ length: size }, (_, index) =>
      count({
        unit: `unit-${index}`,
        status: 'ok',
        evidence: ['Original observed unit.'],
        findings: [
          {
            id: 'finding',
            location: 'app.ts:1',
            text: 'Original finding.',
            evidence: ['Original line.'],
          },
        ],
      }),
    ),
    votes: GateVote[] = results.flatMap((result) =>
      Array.from({ length: 3 }, (_, index) =>
        count({
          finding: `${result.unit}:finding`,
          verifier: index + 1,
          outcome: 'refute',
          reason: 'Original counterexample.',
          evidence: ['Original proof.'],
        }),
      ),
    ),
    plan: GatePlan = {
      schema: 'wholeloop/gate-round@1',
      subject: 'review-fixture',
      run: 'gate-fixture',
      gate: 'review',
      round: 1,
      budget: 3,
      policy: 'strict-majority',
      repository: '/unused-pure-fixture',
      base: { ref: 'main', sha: 'a'.repeat(40) },
      snapshot: { digest: 'b'.repeat(64), head: 'a'.repeat(40), branch: 'main' },
      inputs: { paths: [], languages: [], slots: [] },
      excluded: [],
      verifiers: 3,
      refutations: 2,
      units: results.map((result, index) => ({
        id: result.unit,
        lens: result.unit,
        asks: 'Original question.',
        prompt: 'Original prompt.',
        failSafe: index % 2 === 0,
        origin: 'fixture',
      })),
    }
  accesses = 0
  return { plan, results, votes, accesses: () => accesses }
}

describe('gate verdict traversal', () => {
  it('reads missing unit ids once and never touches votes when no result exists', () => {
    const input = fixture(400)
    let reads = 0
    input.plan.units = input.plan.units.map(
      (unit) =>
        new Proxy(unit, {
          get(target, key, receiver) {
            if (key === 'id') reads++
            return Reflect.get(target, key, receiver)
          },
        }),
    )
    const votes = new Proxy([] as GateVote[], {
        get(target, key, receiver) {
          if (key === Symbol.iterator) throw new Error('Missing coverage cannot use vote work')
          return Reflect.get(target, key, receiver)
        },
      }),
      report = gateReport(input.plan, [], votes, input.plan.snapshot.digest),
      fields = reads
    expect(report.missing).toHaveLength(400)
    expect(report.verdict).toBe('FAIL')
    expect(fields).toBe(400)
  })
  it('scales with observed results and votes, preserving exact report bytes', () => {
    const measurements = [100, 400].map((size) => {
      const input = fixture(size),
        report = gateReport(input.plan, input.results, input.votes, input.plan.snapshot.digest),
        accesses = input.accesses(),
        digest = createHash('sha256').update(JSON.stringify(report)).digest('hex')
      expect(report).toMatchObject({ verdict: 'PASS', missing: [], kept: [] })
      expect(report.dropped).toHaveLength(size)
      return { size, accesses, digest }
    })
    console.info('Gate report operation counts:', JSON.stringify(measurements))
    for (const measurement of measurements)
      expect(measurement.accesses).toBeLessThanOrEqual(10 * measurement.size)
    expect(measurements.map((measurement) => measurement.digest)).toEqual([
      'dca4977476c49ac2d53848101b45ddb3f7f55de9c8b3633f3a11698bf8e4a27a',
      '0ef957bc737eccbfc66b0d86929b9d10e6c2516238822c3684e0c5f03937f061',
    ])
    expect(required(measurements[1]).accesses / required(measurements[0]).accesses).toBeLessThan(
      4.2,
    )
  })
  it('keeps first-result selection, any-ok coverage and duplicate examination counts', () => {
    const { plan, results, votes } = fixture(1),
      first = required(results[0]),
      unavailable: GateResult = {
        unit: first.unit,
        status: 'unavailable',
        reason: 'Original unavailable result.',
        evidence: [],
        findings: [],
      }
    expect(gateReport(plan, [unavailable, first], votes, plan.snapshot.digest)).toEqual({
      verdict: 'PASS',
      unchanged: true,
      missing: [],
      kept: [],
      dropped: [],
    })
    const repeated = [required(votes[0]), required(votes[0]), required(votes[0])],
      report = gateReport(plan, results, repeated, plan.snapshot.digest)
    expect(report.dropped[0]).toMatchObject({ id: 'unit-0:finding', refutations: 3 })
    expect(gateReport(plan, [], repeated, 'changed')).toMatchObject({
      verdict: 'FAIL',
      unchanged: false,
      missing: ['unit-0'],
    })
    expect(
      gateReport({ ...plan, round: 3 }, results, [required(votes[0])], plan.snapshot.digest),
    ).toMatchObject({
      verdict: 'EXHAUSTED',
      kept: [
        {
          id: 'unit-0:finding',
          reason: 'Fail-safe lens: safety not established by every verifier',
        },
      ],
    })
  })
})
