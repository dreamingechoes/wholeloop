import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { type PullRequest, pullRequestPlans } from '../../../src/pull-requests/contracts.js'
import { type EventData, event, type StateEvent, validateEvent } from '../../../src/state/events.js'
import { syncState } from '../../../src/sync/contracts.js'

function fixture(count: number) {
  const events: StateEvent[] = []
  const append = (subject: string, data: EventData) => {
    const value = event(subject, data, '2026-11-06T00:00:00.000Z')
    value.id = `ev-${events.length.toString(16).padStart(36, '0')}`
    events.push(value)
    return value.id
  }
  for (let index = 0; index < count; index++) {
    const subject = `slice-${index.toString(16).padStart(8, '0')}`
    const pr: PullRequest = {
      url: `https://github.com/example/product/pull/${index + 1}`,
      repository: 'https://github.com/example/product',
      head: `wl/${subject}`,
      base: 'main',
      sha: 'a'.repeat(40),
      draft: true,
      merged: false,
      state: 'open',
    }
    append(subject, {
      type: 'item.created',
      data: {
        kind: 'slice',
        title: 'Synthetic item',
        owner: 'Fixture',
        body: 'Synthetic delivery item',
      },
    })
    const plan = append(subject, {
      type: 'pr.planned',
      data: {
        plan: {
          root: '/unused-pure-fixture',
          repository: pr.repository,
          remote: 'origin',
          branch: pr.head,
          base: pr.base,
          head: pr.sha,
          snapshot: 'b'.repeat(64),
          title: 'feat: fixture delivery',
          body: 'Synthetic manual validation.',
          provider: 'github',
          convention: { ref: 'fixture-convention', origin: 'harness', digest: 'c'.repeat(64) },
          gated: false,
        },
      },
    })
    append(subject, {
      type: 'pr.tested',
      data: { plan, by: 'Fixture', note: 'Observed synthetic output.', snapshot: 'b'.repeat(64) },
    })
    append(subject, {
      type: 'decision.recorded',
      data: { decision: 'test-it', basis: plan, by: 'Fixture', outcome: 'approved' },
    })
    append(subject, { type: 'pr.requested', data: { plan } })
    append(subject, { type: 'pr.published', data: { plan, pr } })
    append(subject, {
      type: 'sync.merged',
      data: { plan, origin: 'import', pr: { ...pr, draft: false, merged: true, state: 'merged' } },
    })
  }
  return events
}
function measured<T>(events: StateEvent[], run: (events: StateEvent[]) => T) {
  let fields = 0
  let arrayEntries = 0
  const observed = events.map(
    (value) =>
      new Proxy(value, {
        get(target, key, receiver) {
          fields++
          return Reflect.get(target, key, receiver)
        },
      }),
  )
  const vector = new Proxy(observed, {
    get(target, key, receiver) {
      if (typeof key === 'string' && /^\d+$/.test(key)) arrayEntries++
      return Reflect.get(target, key, receiver)
    },
  })
  const value = run(vector)
  return { fields, arrayEntries, value }
}
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const syncView = (value: ReturnType<typeof syncState>) =>
  Object.fromEntries(Object.entries(value).map(([key, entries]) => [key, [...entries]]))

function closureFixture(count: number) {
  const scope = 'scope-00000000',
    events: StateEvent[] = []
  const append = (subject: string, data: EventData) =>
    events.push(event(subject, data, '2026-11-06T00:00:00.000Z'))
  append(scope, {
    type: 'item.created',
    data: { kind: 'scope', title: 'Scope', owner: 'Fixture', body: 'Synthetic scope' },
  })
  const publications = fixture(count),
    slices: string[] = [],
    proofs: string[] = []
  for (let index = 0; index < count; index++) {
    const slice = `slice-${index.toString(16).padStart(8, '0')}`,
      part = `part-${index.toString(16).padStart(8, '0')}`
    append(slice, {
      type: 'item.created',
      data: {
        kind: 'slice',
        title: 'Slice',
        owner: 'Fixture',
        body: 'Synthetic slice',
        parent: scope,
      },
    })
    const group = publications.slice(index * 7, index * 7 + 7)
    for (const value of group) {
      value.subject = part
      if (value.type === 'item.created') value.data = { ...value.data, kind: 'part', parent: slice }
      events.push(value)
    }
    const merged = group.at(-1)
    if (!merged) throw new Error('Missing fixture merge')
    append(part, { type: 'sync.closed', data: { proofs: [merged.id] } })
    append(part, { type: 'item.closed', data: {} })
    append(slice, { type: 'sync.closed', data: { proofs: [merged.id] } })
    append(slice, { type: 'item.closed', data: {} })
    slices.push(slice)
    proofs.push(merged.id)
  }
  append(scope, { type: 'sync.delivery-ready', data: { slices, proofs } })
  const ids = new Map(
    events.map((value, index) => [value.id, `ev-${index.toString(16).padStart(36, '0')}`]),
  )
  for (const value of events) {
    value.id = ids.get(value.id) as string
    if ('plan' in value.data && typeof value.data.plan === 'string')
      value.data.plan = ids.get(value.data.plan) as string
    if (value.type === 'decision.recorded') value.data.basis = ids.get(value.data.basis) as string
    if (value.type === 'sync.closed' || value.type === 'sync.delivery-ready')
      value.data.proofs = value.data.proofs.map((id) => ids.get(id) as string)
    validateEvent(value)
  }
  return events
}

function measuredTreeReplay(events: StateEvent[]) {
  const original = Map.prototype.set
  let fields = 0
  Map.prototype.set = function <K, V>(this: Map<K, V>, key: K, value: V): Map<K, V> {
    let observed = value
    if (
      value &&
      typeof value === 'object' &&
      'kind' in value &&
      'status' in value &&
      typeof value.kind === 'string' &&
      typeof value.status === 'string'
    ) {
      observed = new Proxy(value, {
        get(target, key, receiver) {
          fields++
          return Reflect.get(target, key, receiver)
        },
      })
    }
    return original.call(this, key, observed)
  }
  try {
    const value = syncState(events)
    return { fields, value }
  } finally {
    Map.prototype.set = original
  }
}

describe('chronological publication and sync replay', () => {
  it('does not rescan the full current tree for every historical closure', () => {
    const rows = [100, 400].map((size) => {
      const { fields, value } = measuredTreeReplay(closureFixture(size))
      return { size, fields, digest: digest(syncView(value)) }
    })
    console.info('Sync historical closure tree reads:', JSON.stringify(rows))
    expect(rows.map((row) => row.digest)).toEqual([
      'd52f0b3440c28b487ec3717a05eace9958bb2b9dc4bff2549fdb414b92cbeff9',
      'ffb2ac0b15232779e5f7c45030dff55f71dd7e1f0cb034dbff2597e9b9bc33f6',
    ])
    for (const row of rows) expect(row.fields).toBeLessThanOrEqual(row.size * 16)
  })
  it('retains earlier closure facts and refuses a reopened part before delivery', () => {
    const events = closureFixture(3)
    events.splice(
      events.length - 1,
      0,
      event(
        'part-00000001',
        { type: 'item.updated', data: { status: 'open' } },
        '2026-11-06T00:00:00.000Z',
      ),
    )
    expect(() => syncState(events)).toThrow('Scope delivery is ready only after every slice')
  })
  it('replays publication without rescanning all prior plans and approval positions', () => {
    const rows = [100, 400].map((size) => {
      const { fields, arrayEntries, value } = measured(fixture(size), pullRequestPlans)
      return { size, fields, arrayEntries, digest: digest(value) }
    })
    console.info('Publication replay:', JSON.stringify(rows))
    expect(rows.map((row) => row.digest)).toEqual([
      '95ab830354f534b29a882638c5d474f0a03dbddfd90a8dfc4c0f68e5a80cfb17',
      '8ada8e8e4351e61649093fc249a7736972767a842ed06104fd1bca9c6232389c',
    ])
    for (const row of rows) expect(row.fields).toBeLessThanOrEqual(row.size * 60)
    for (const row of rows) expect(row.arrayEntries).toBeLessThanOrEqual(row.size * 7)
  })
  it('validates each prior publication prefix once across many merge receipts', () => {
    const rows = [20, 80].map((size) => {
      const { fields, arrayEntries, value } = measured(fixture(size), syncState)
      expect(value.merged.size).toBe(size)
      return { size, fields, arrayEntries, digest: digest(syncView(value)) }
    })
    console.info('Sync publication prefix replay:', JSON.stringify(rows))
    expect(rows.map((row) => row.digest)).toEqual([
      '2bb581c7d13afdee30024b3203202b94077e0f7071eea9601d75f01271443fec',
      '12782cad683927dc9f0c007b610967bf3472eeb86098e215056d59532991c36e',
    ])
    for (const row of rows) expect(row.fields).toBeLessThanOrEqual(row.size * 120)
    for (const row of rows) expect(row.arrayEntries).toBeLessThanOrEqual(row.size * 14)
  })
  it('refuses future approvals, future publication and a latest rejected decision', () => {
    const futureApproval = fixture(1)
    const approval = futureApproval.splice(3, 1)[0]
    if (!approval) throw new Error('Missing fixture approval')
    futureApproval.splice(4, 0, approval)
    expect(() => pullRequestPlans(futureApproval)).toThrow('exact-plan approval')
    const futurePublication = fixture(1)
    const publication = futurePublication.splice(5, 1)[0]
    if (!publication) throw new Error('Missing fixture publication')
    futurePublication.push(publication)
    expect(() => syncState(futurePublication)).toThrow('Sync merge evidence')
    const rejected = fixture(1)
    const decision = rejected[3]
    if (decision?.type !== 'decision.recorded') throw new Error('Missing fixture decision')
    rejected.splice(4, 0, {
      ...decision,
      id: `ev-${'f'.repeat(36)}`,
      data: { ...decision.data, outcome: 'rejected' },
    })
    expect(() => pullRequestPlans(rejected)).toThrow('exact-plan approval')
  })
  it('does not borrow approval from another subject or plan', () => {
    for (const field of ['subject', 'basis'] as const) {
      const events = fixture(1)
      const decision = events[3]
      if (decision?.type !== 'decision.recorded') throw new Error('Missing fixture decision')
      if (field === 'subject') decision.subject = 'slice-ffffffff'
      else decision.data.basis = `ev-${'f'.repeat(36)}`
      expect(() => pullRequestPlans(events)).toThrow('exact-plan approval')
    }
  })
  it('refuses replacement of an ambiguous pending publication', () => {
    const events = fixture(1).slice(0, 5)
    const planned = events[1]
    if (!planned) throw new Error('Missing fixture plan')
    events.push({ ...planned, id: `ev-${'f'.repeat(36)}` })
    expect(() => pullRequestPlans(events)).toThrow('Reconcile the pending PR request')
  })
  it('validates only the same prefixes as the original sync reader', () => {
    const events = fixture(2)
    const invalid = event(
      'slice-00000000',
      { type: 'pr.requested', data: { plan: `ev-${'f'.repeat(36)}` } },
      '2026-11-06T00:00:00.000Z',
    )
    events.push(invalid)
    expect(syncState(events).merged.size).toBe(2)
    expect(() => pullRequestPlans(events)).toThrow('current earlier plan')
    events.splice(7, 0, events.pop() as StateEvent)
    expect(() => syncState(events)).toThrow('current earlier plan')
  })
})
