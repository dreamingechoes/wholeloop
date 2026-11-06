import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { GatePlan } from '../../../src/gates/contracts.js'
import { gateReport } from '../../../src/gates/report.js'
import { gateRuns } from '../../../src/gates/state.js'
import { event, type StateEvent } from '../../../src/state/events.js'
import { verificationRuns } from '../../../src/verification/state.js'

function plan(index: number, gate: GatePlan['gate'] = 'review'): GatePlan {
  return {
    schema: 'wholeloop/gate-round@1',
    subject: `review-${index.toString(16).padStart(8, '0')}`,
    run: `gate-${index.toString(16).padStart(16, '0')}`,
    gate,
    round: 1,
    budget: 3,
    policy: 'c'.repeat(64),
    repository: '/unused-pure-fixture',
    base: { ref: 'main', sha: 'a'.repeat(40) },
    snapshot: { digest: 'b'.repeat(64), head: 'a'.repeat(40), branch: 'main' },
    inputs: { paths: [], languages: [], slots: [] },
    excluded: [],
    verifiers: 3,
    refutations: 2,
    units: [
      {
        id: 'fixture',
        lens: 'fixture',
        asks: 'Original question.',
        prompt: 'Original prompt.',
        failSafe: false,
        origin: 'fixture',
      },
    ],
  }
}
const planned = (value: GatePlan) =>
  event(value.subject, { type: 'gate.planned', data: { plan: value } }, '2026-11-06T00:00:00.000Z')
const failed = (value: GatePlan) =>
  event(
    value.subject,
    {
      type: 'gate.decided',
      data: {
        run: value.run,
        round: value.round,
        observed: value.snapshot.digest,
        report: gateReport(value, [], [], value.snapshot.digest),
      },
    },
    '2026-11-06T00:00:00.000Z',
  )
const suite = (value: GatePlan) =>
  event(
    value.subject,
    {
      type: 'verify.suite-planned',
      data: {
        run: value.run,
        round: value.round,
        plan: {
          commands: [
            {
              ref: 'package.json#check',
              cwd: '.',
              argv: ['node', '--version'],
              priority: 1,
              reason: 'Declared fixture only; never executed.',
            },
          ],
          timeoutMs: 1000,
        },
      },
    },
    '2026-11-06T00:00:00.000Z',
  )

describe('gate history selection', () => {
  it('does not rescan unrelated earlier runs for every planned round', () => {
    const measurements = [100, 400].map((size) => {
      let reads = 0
      const history = Array.from(
          { length: size },
          (_, index) =>
            new Proxy(planned(plan(index)), {
              get(target, property, receiver) {
                if (property === 'subject') reads++
                return Reflect.get(target, property, receiver)
              },
            }),
        ),
        runs = gateRuns(history),
        subjectReads = reads,
        digest = createHash('sha256').update(JSON.stringify(runs)).digest('hex')
      expect(runs).toHaveLength(size)
      return { size, subjectReads, digest }
    })
    console.info('Gate history subject reads:', JSON.stringify(measurements))
    expect(measurements.map((measurement) => measurement.digest)).toEqual([
      '589e7349bd15103296fda628024ef2281683d61f4d02db20aaa173caa0889db1',
      '3a010ce85325cee01d488186112be8bb50303e3a1d6dda32a2b0fd2f59cc25a9',
    ])
    for (const measurement of measurements)
      expect(measurement.subjectReads).toBeLessThanOrEqual(3 * measurement.size)
  })
  it('retains independent subject/gate lanes and refuses unsealed resets or foreign rounds', () => {
    const first = plan(1),
      other = { ...plan(2, 'verify'), subject: first.subject },
      next = { ...first, round: 2 },
      history: StateEvent[] = [planned(first), planned(other), failed(first), planned(next)]
    expect(gateRuns(history).map((run) => [run.gate, run.rounds.length])).toEqual([
      ['review', 2],
      ['verify', 1],
    ])
    expect(() =>
      gateRuns([planned(first), planned({ ...plan(3), subject: first.subject })]),
    ).toThrow('Finish the existing gate run')
    expect(() =>
      gateRuns([planned(first), failed(first), planned({ ...next, subject: plan(4).subject })]),
    ).toThrow('Gate rounds must preserve')
    expect(() =>
      gateRuns([planned(first), failed(first), planned({ ...next, gate: 'verify' })]),
    ).toThrow('Gate rounds must preserve')
  })
})

describe('suite intent history selection', () => {
  it('still validates corrupt later gates and gate histories with no suite', () => {
    const value = plan(1, 'verify'),
      corrupt = failed(plan(2, 'verify'))
    expect(() => verificationRuns([planned(value), suite(value), corrupt])).toThrow(
      'Gate event needs its planned run',
    )
    expect(() => verificationRuns([corrupt])).toThrow('Gate event needs its planned run')
  })
  it('joins only earlier original rounds without repeated whole-history searches', () => {
    const measurements = [100, 400].map((size) => {
      let reads = 0
      const history = Array.from({ length: size }, (_, index) => {
          const value = plan(index, 'verify')
          return [planned(value), suite(value)]
        })
          .flat()
          .map(
            (entry) =>
              new Proxy(entry, {
                get(target, property, receiver) {
                  reads++
                  return Reflect.get(target, property, receiver)
                },
              }),
          ),
        runs = verificationRuns(history),
        accesses = reads,
        digest = createHash('sha256').update(JSON.stringify(runs)).digest('hex')
      expect(runs).toHaveLength(size)
      return { size, accesses, digest }
    })
    console.info('Suite intent event reads:', JSON.stringify(measurements))
    expect(measurements.map((measurement) => measurement.digest)).toEqual([
      '08886ff96491391371c3bd3720b7f3723d9a54730de77295c1995c3020d786ea',
      'f27bd706a4fe51282474c3d808e9360430f267623165312fb2b0041320063ddb',
    ])
    for (const measurement of measurements)
      expect(measurement.accesses).toBeLessThanOrEqual(30 * measurement.size)
  })
  it.each(['future', 'foreign', 'wrong-kind', 'duplicate', 'missing'] as const)(
    'refuses %s original suite binding',
    (mode) => {
      const value = plan(1, 'verify'),
        history =
          mode === 'future'
            ? [suite(value), planned(value)]
            : mode === 'foreign'
              ? [planned(value), suite({ ...value, subject: plan(2).subject })]
              : mode === 'wrong-kind'
                ? [planned({ ...value, gate: 'review' }), suite(value)]
                : mode === 'duplicate'
                  ? [planned(value), suite(value), suite(value)]
                  : [suite(value)]
      expect(() => verificationRuns(history)).toThrow('Suite needs one prior planned verify round')
    },
  )
})
