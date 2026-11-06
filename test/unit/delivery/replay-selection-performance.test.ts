import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import * as compatibility from '../../../src/contracts/compatibility.js'
import {
  type AttemptPayload,
  type DeliveryEvent,
  type DeliveryPayload,
  deliveryEvent,
} from '../../../src/delivery/events.js'
import { replayDelivery } from '../../../src/delivery/reducer.js'

const at = '2026-11-06T00:00:00.000Z',
  run = 'delivery-0000000000000000'
function history() {
  const events: DeliveryEvent[] = []
  const append = (payload: DeliveryPayload, subject = run) => {
    const value = deliveryEvent(
      subject,
      { kind: 'controller', name: 'Fixture' },
      payload,
      events.at(-1),
      at,
    )
    value.id = `delivery-event-00000000-0000-4000-8000-${events.length.toString(16).padStart(12, '0')}`
    const { digest: _digest, ...binding } = value
    value.digest = compatibility.contractDigest(binding)
    events.push(value)
  }
  const register = (index = 0, units = 1) => {
    const subject = `delivery-${index.toString(16).padStart(16, '0')}`
    append(
      {
        schema: 'wholeloop/delivery-registration-event@1',
        basis: { kind: 'plan', digest: 'a'.repeat(64), revision: 1 },
        source: 'b'.repeat(64),
        policy: { digest: 'c'.repeat(64), endpoint: 'local-handoff', intervention: 'supervised' },
        units: Array.from({ length: units }, (_, index) => ({
          id: index === units - 1 ? 'search' : `unit-${index}`,
          role: 'implementation',
          repository: 'app',
        })),
      },
      subject,
    )
    append(
      {
        schema: 'wholeloop/delivery-grant-event@1',
        id: `authorization-${index.toString(16).padStart(16, '0')}`,
        digest: 'd'.repeat(64),
        basis: 'a'.repeat(64),
        status: 'active',
      },
      subject,
    )
    return subject
  }
  return { events, append, register }
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const attempt = (index: number, action: AttemptPayload['action']): AttemptPayload => ({
  schema: 'wholeloop/delivery-attempt-event@1',
  id: `attempt-${index.toString(16).padStart(16, '0')}`,
  basis: 'a'.repeat(64),
  unit: 'search',
  role: 'builder',
  generation: index + 1,
  action,
  ...(action === 'stopped' ? { evidence: 'e'.repeat(64) } : {}),
})
function attempts(count: number, units = 1) {
  const fixture = history()
  fixture.register(0, units)
  fixture.append({
    schema: 'wholeloop/delivery-control-event@1',
    from: 'planned',
    to: 'queued',
    basis: 'a'.repeat(64),
    reason: 'Prepare the synthetic attempt history.',
  })
  for (let index = 0; index < count; index++) {
    fixture.append(attempt(index, 'claimed'))
    fixture.append(attempt(index, 'stopped'))
  }
  return fixture
}

describe('private delivery replay selections', () => {
  it('selects a repeated unit without rebuilding an unused complete index', () => {
    const rows = [20, 80].map((units) => {
      const fixture = attempts(100, units)
      const original = Map.prototype.set
      let ids = 0
      Map.prototype.set = function <K, V>(this: Map<K, V>, key: K, value: V): Map<K, V> {
        if (
          value &&
          typeof value === 'object' &&
          'schema' in value &&
          value.schema === 'wholeloop/delivery-state@1' &&
          'units' in value &&
          Array.isArray(value.units)
        )
          value.units = value.units.map(
            (unit) =>
              new Proxy(unit, {
                get(target, key, receiver) {
                  if (key === 'id') ids++
                  return Reflect.get(target, key, receiver)
                },
              }),
          )
        return original.call(this, key, value)
      }
      try {
        const states = replayDelivery(fixture.events),
          reads = ids
        return { units, reads, digest: hash([...states]) }
      } finally {
        Map.prototype.set = original
      }
    })
    console.info('Repeated attempt unit id reads:', JSON.stringify(rows))
    expect(rows.map((row) => row.digest)).toEqual([
      '23346486fdc4ea85e8af016164bda637077fe559dcf7635df41f2c77e8d508a4',
      '2843475d95f9dbe221d31127e3e41b6f54b5d6021ab41537993c2da99b9d719b',
    ])
    for (const row of rows) expect(row.reads).toBeLessThanOrEqual(row.units * 8)
  })
  it('uses existing exact grant ownership instead of searching every other run', () => {
    const rows = [100, 400].map((size) => {
      const fixture = history()
      for (let index = 0; index < size; index++) fixture.register(index)
      let fields = 0
      const original = Map.prototype.set
      Map.prototype.set = function <K, V>(this: Map<K, V>, key: K, value: V): Map<K, V> {
        let observed = value
        if (
          value &&
          typeof value === 'object' &&
          'schema' in value &&
          value.schema === 'wholeloop/delivery-state@1'
        )
          observed = new Proxy(value, {
            get(target, key, receiver) {
              if (key === 'run' || key === 'grant') fields++
              return Reflect.get(target, key, receiver)
            },
          })
        return original.call(this, key, observed)
      }
      try {
        const states = replayDelivery(fixture.events),
          reads = fields
        return { size, reads, digest: hash([...states]) }
      } finally {
        Map.prototype.set = original
      }
    })
    console.info('Grant replay state fields:', JSON.stringify(rows))
    expect(rows.map((row) => row.digest)).toEqual([
      '519827c754c61c69b1adf9dc3372f5dc256c9174dcb4763acfb06f4349592602',
      '4f5ed42cfe7d134ed17af39a40372740fcaf83dfdc9f7d14be30425670f25d5d',
    ])
    for (const row of rows) expect(row.reads).toBeLessThanOrEqual(row.size * 64)
  })
  it('selects attempt generations without repeatedly hashing every older sibling', () => {
    const rows = [100, 400].map((size) => {
      const fixture = attempts(size)
      const digest = vi.spyOn(compatibility, 'contractDigest'),
        stringify = vi.spyOn(JSON, 'stringify')
      try {
        const states = replayDelivery(fixture.events)
        const hashes = digest.mock.calls.filter(
          ([value]) =>
            value &&
            typeof value === 'object' &&
            Object.keys(value).length === 3 &&
            'unit' in value &&
            'role' in value &&
            'cell' in value,
        ).length
        const tuples = stringify.mock.calls.filter(
          ([value]) => Array.isArray(value) && value.length === 4 && value[0] === run,
        ).length
        return { size, signatures: hashes + tuples, digest: hash([...states]) }
      } finally {
        digest.mockRestore()
        stringify.mockRestore()
      }
    })
    console.info('Attempt replay signatures:', JSON.stringify(rows))
    expect(rows.map((row) => row.digest)).toEqual([
      '3959dc3023153f1211a3e109f63f2ecdd08c293012de53a167ba820d2a74879e',
      '6519ec9b3571c7e338b11ea671b3e957856ffc22532c31aed2f18acc74b44c3d',
    ])
    for (const row of rows) expect(row.signatures).toBeLessThanOrEqual(row.size * 5)
  })
  it('retains active-lane, generation, duplicate-id and terminal transition refusals', () => {
    const active = attempts(0)
    active.append(attempt(0, 'claimed'))
    active.append(attempt(1, 'claimed'))
    expect(() => replayDelivery(active.events)).toThrow('attempt-generation')
    const repeated = attempts(1)
    repeated.append({ ...attempt(0, 'claimed'), generation: 2 })
    expect(() => replayDelivery(repeated.events)).toThrow('attempt-admission')
    const stale = attempts(1)
    stale.append({ ...attempt(1, 'claimed'), generation: 1 })
    expect(() => replayDelivery(stale.events)).toThrow('attempt-generation')
    const revived = attempts(1)
    revived.append({
      ...attempt(0, 'started'),
      runtime: { backend: 'fixture', instance: 'original', worker: 'worker' },
    })
    expect(() => replayDelivery(revived.events)).toThrow('attempt-transition')
  })
  it('keeps roles, cells and unit identities separate and does not fence a newer active claim', () => {
    const fixture = attempts(0, 2)
    fixture.append(attempt(0, 'claimed'))
    const verifier = {
      ...attempt(1, 'claimed'),
      generation: 1,
      role: 'verifier' as const,
      cell: 'cell-a',
    }
    fixture.append(verifier)
    fixture.append({ ...verifier, action: 'stopped', evidence: 'e'.repeat(64) })
    fixture.append(attempt(0, 'stopped'))
    fixture.append({ ...attempt(2, 'claimed'), unit: 'unit-0', generation: 1 })
    fixture.append({ ...attempt(2, 'stopped'), unit: 'unit-0', generation: 1 })
    fixture.append({ ...attempt(3, 'claimed'), generation: 2 })
    fixture.append({ ...attempt(0, 'stopped'), action: 'fenced' })
    expect(
      replayDelivery(fixture.events)
        .get(run)
        ?.facets.find((facet) => facet.schema === 'wholeloop/delivery-attempts@1')?.records,
    ).toHaveLength(4)
    fixture.append({ ...attempt(4, 'claimed'), generation: 3 })
    expect(() => replayDelivery(fixture.events)).toThrow('attempt-generation')
  })
  it('retains exact action identity and runtime binding', () => {
    for (const patch of [{ role: 'reviewer' as const }, { unit: 'other' }, { cell: 'other' }]) {
      const fixture = attempts(0)
      fixture.append(attempt(0, 'claimed'))
      fixture.append({ ...attempt(0, 'stopped'), ...patch })
      expect(() => replayDelivery(fixture.events)).toThrow('attempt-identity')
    }
    const fixture = attempts(0)
    fixture.append(attempt(0, 'claimed'))
    fixture.append({
      ...attempt(0, 'started'),
      runtime: { backend: 'fixture', instance: 'original', worker: 'worker' },
    })
    fixture.append({
      ...attempt(0, 'heartbeat'),
      runtime: { backend: 'fixture', instance: 'changed', worker: 'worker' },
    })
    expect(() => replayDelivery(fixture.events)).toThrow('changed-runtime-identity')
  })
  it('keeps generation history across revisions while refreshing declared unit selections', () => {
    for (const change of ['none', 'role', 'missing'] as const) {
      const fixture = attempts(1, 2),
        registration = fixture.events[0]?.payload
      if (registration?.schema !== 'wholeloop/delivery-registration-event@1')
        throw new Error('Missing registration')
      fixture.append({
        ...registration,
        basis: { kind: 'plan', digest: 'b'.repeat(64), revision: 2 },
        previous: 'a'.repeat(64),
        units:
          change === 'missing'
            ? [
                { id: 'other', role: 'implementation' },
                { id: 'second', role: 'implementation' },
              ]
            : [
                { id: 'search', role: change === 'role' ? 'research' : 'implementation' },
                { id: 'second', role: 'implementation' },
              ],
      })
      fixture.append({
        schema: 'wholeloop/delivery-grant-event@1',
        id: 'authorization-0000000000000001',
        digest: 'f'.repeat(64),
        basis: 'b'.repeat(64),
        status: 'active',
      })
      fixture.append({
        schema: 'wholeloop/delivery-control-event@1',
        from: 'planned',
        to: 'queued',
        basis: 'b'.repeat(64),
        reason: 'Continue only the current revised declaration.',
      })
      fixture.append({ ...attempt(1, 'claimed'), basis: 'b'.repeat(64) })
      if (change === 'none') expect(replayDelivery(fixture.events).get(run)?.basis.revision).toBe(2)
      else
        expect(() => replayDelivery(fixture.events)).toThrow(
          change === 'role' ? 'attempt-role' : 'attempt-unit',
        )
    }
  })
  it('retains historical grant owners after registration removes their current projection', () => {
    const fixture = history()
    fixture.register()
    const registration = fixture.events[0]?.payload
    if (registration?.schema !== 'wholeloop/delivery-registration-event@1')
      throw new Error('Missing registration')
    fixture.append({
      ...registration,
      basis: { kind: 'plan', digest: 'b'.repeat(64), revision: 2 },
      previous: 'a'.repeat(64),
    })
    const other = fixture.register(1)
    fixture.append(
      {
        schema: 'wholeloop/delivery-grant-event@1',
        id: 'authorization-0000000000000000',
        digest: 'd'.repeat(64),
        basis: 'a'.repeat(64),
        status: 'active',
      },
      other,
    )
    expect(() => replayDelivery(fixture.events)).toThrow('grant-bound-to-another-run')
  })
  it('never imports an attempt id from another run', () => {
    for (const action of ['claimed', 'stopped'] as const) {
      const fixture = attempts(1),
        other = fixture.register(1)
      fixture.append(
        {
          schema: 'wholeloop/delivery-control-event@1',
          from: 'planned',
          to: 'queued',
          basis: 'a'.repeat(64),
          reason: 'Keep the other run independent.',
        },
        other,
      )
      fixture.append(attempt(0, action), other)
      expect(() => replayDelivery(fixture.events)).toThrow(
        action === 'claimed' ? 'attempt-admission' : 'attempt-identity',
      )
    }
  })
  it('keeps planner and challenger lanes independent without inventing a unit', () => {
    const fixture = attempts(0)
    for (const [index, role] of (['planner', 'challenger'] as const).entries()) {
      const claimed = { ...attempt(index, 'claimed'), generation: 1, role }
      delete claimed.unit
      fixture.append(claimed)
      fixture.append({ ...claimed, action: 'stopped', evidence: 'e'.repeat(64) })
    }
    expect(
      replayDelivery(fixture.events)
        .get(run)
        ?.facets.find((facet) => facet.schema === 'wholeloop/delivery-attempts@1')?.records,
    ).toHaveLength(2)
  })
})
