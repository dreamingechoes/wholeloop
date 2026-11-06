import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { GateFinding, GateResult, GateVote } from '../../../src/gates/contracts.js'
import { gateAuditSelection, gateFindingSource } from '../../../src/gates/selection.js'

function fixture(size: number) {
  let reads = 0,
    findings = 0
  const results: GateResult[] = Array.from(
      { length: size },
      (_, index) =>
        new Proxy(
          {
            unit: `unit-${index}`,
            status: 'ok' as const,
            evidence: ['Original observed unit.'],
            findings: [
              new Proxy<GateFinding>(
                {
                  id: 'finding',
                  location: 'app.ts:1',
                  text: 'Original finding.',
                  evidence: ['Original proof.'],
                },
                {
                  get(target, key, receiver) {
                    reads++
                    findings++
                    return Reflect.get(target, key, receiver)
                  },
                },
              ),
            ],
          },
          {
            get(target, key, receiver) {
              reads++
              if (key === 'findings') findings++
              return Reflect.get(target, key, receiver)
            },
          },
        ),
    ),
    votes: GateVote[] = results.flatMap((result) =>
      Array.from({ length: 3 }, (_, index) => ({
        finding: `${result.unit}:finding`,
        verifier: index + 1,
        outcome: 'refute' as const,
        reason: 'Original counterexample.',
        evidence: ['Original proof.'],
      })),
    ),
    units = results.map((result) => result.unit)
  reads = 0
  findings = 0
  return { results, votes, units, reads: () => reads, findings: () => findings }
}

describe('fixed gate audit selections', () => {
  it('selects exact original reports and findings with linear batch work', () => {
    const measured = [100, 400].map((size) => {
      const input = fixture(size),
        selection = gateAuditSelection(input.results, input.votes),
        results = input.units.map((id) => selection.result(id)),
        sources = input.votes.map((vote) => selection.source(vote.finding)),
        reads = input.reads(),
        digest = createHash('sha256').update(JSON.stringify({ results, sources })).digest('hex')
      expect(results).toEqual(input.results)
      expect(sources).toHaveLength(size * 3)
      return { size, reads, digest }
    })
    console.info('Gate audit result/finding reads:', JSON.stringify(measured))
    expect(measured.map((row) => row.digest)).toEqual([
      'dce8864328cb6a207d914d7212add99307cbd9065620b99d9d6495c8dac3a403',
      'bbdac58702c12dc187e1bb8542c0fe3243f6270ff28d78b771454960c1a204af',
    ])
    for (const row of measured) expect(row.reads).toBeLessThanOrEqual(row.size * 5)
    const small = measured[0],
      large = measured[1]
    if (!small || !large) throw new Error('Both input sizes required')
    expect(large.reads / small.reads).toBeLessThan(4.2)
  })
  it('does not read findings before a vote query or flatten unrelated data for one native lookup', () => {
    const input = fixture(400),
      selection = gateAuditSelection(input.results, [])
    expect(input.reads()).toBe(0)
    const selected = selection.result('unit-0'),
      fields = input.findings()
    expect(selected).toBe(input.results[0])
    expect(fields).toBe(0)
    const before = input.reads(),
      source = gateFindingSource(input.results, 'unit-0:finding'),
      reads = input.reads() - before
    console.info('Single native finding selection reads:', reads)
    expect(source?.finding).toBe(input.results[0]?.findings[0])
    expect(reads).toBeLessThanOrEqual(4)
  })
  it('preserves first matches, absent queries and fresh selections', () => {
    const first: GateResult = {
        unit: 'first',
        status: 'ok',
        evidence: ['Original proof.'],
        findings: [
          {
            id: 'finding',
            location: 'app.ts:1',
            text: 'First original finding.',
            evidence: ['Original proof.'],
          },
        ],
      },
      later: GateResult = {
        ...first,
        findings: [
          {
            ...first.findings[0],
            id: 'finding',
            location: 'app.ts:2',
            text: 'Later finding.',
            evidence: ['Later proof.'],
          },
        ],
      },
      values = [first, later],
      votes = fixture(1).votes,
      selected = gateAuditSelection(values, votes)
    expect(selected.result('first')).toBe(first)
    expect(selected.source('first:finding')?.finding).toBe(first.findings[0])
    expect(selected.source('missing')).toBeUndefined()
    expect(selected.result('missing')).toBeUndefined()
    expect(gateFindingSource(values, 'missing')).toBeUndefined()
    values.unshift({ ...first, findings: later.findings })
    expect(gateAuditSelection(values, votes).source('first:finding')?.finding).toBe(
      later.findings[0],
    )
  })
})
