import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ENVIRONMENT_RUNTIME_SCHEMA,
  EnvironmentResources,
  type EnvironmentRuntime,
} from '../../../src/environment/runtime.js'
import { StoreFiles } from '../../../src/state/files.js'

const ID = `environment-${'a'.repeat(32)}`,
  AT = '2026-11-06T00:00:00.000Z'
const roots: string[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function store() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-runtime-history-')))
  roots.push(root)
  return root
}
function history(snapshots: number) {
  const root = store(),
    records = new EnvironmentResources(new StoreFiles(root))
  records.create({
    schema: 'wholeloop/environment-runtime@1',
    id: ID,
    run: `delivery-${'a'.repeat(16)}`,
    basis: 'b'.repeat(64),
    recipe: 'c'.repeat(64),
    key: 'history',
    grant: `authorization-${'d'.repeat(16)}`,
    grantDigest: 'e'.repeat(64),
    token: 'fixture-owner',
    effect: `effect-${'f'.repeat(32)}`,
    createdAt: AT,
    deadline: '2026-11-06T01:00:00.000Z',
    lifetimeDeadline: '2026-11-06T02:00:00.000Z',
    state: 'ready',
    provenance: 'fixture',
    helperImage: `node@sha256:${'1'.repeat(64)}`,
    host: { os: 'fixture', architecture: 'arm64' },
    candidates: [],
    resources: [
      {
        kind: 'volume',
        slot: 'data',
        name: 'fixture-data',
        token: 'data',
        status: 'intent',
        purpose: 'data',
      },
    ],
    observations: [],
    acceptance: 'not-established',
    publication: 'not-performed',
  } as EnvironmentRuntime)
  for (let index = 1; index < snapshots; index++)
    records.update(ID, (record) => {
      record.observations.push({
        stage: 'probe',
        at: AT,
        status: `s${index}`,
        evidence: 'e'.repeat(64),
      })
    })
  return root
}
function snapshotPath(root: string, sequence: number) {
  return join(root, 'delivery/environments', ID, `${String(sequence).padStart(4, '0')}.json`)
}
/** A copied store has a different canonical directory, so it takes the complete cold path. */
function cold(root: string) {
  const copy = store()
  cpSync(join(root, 'delivery'), join(copy, 'delivery'), { recursive: true })
  return new EnvironmentResources(new StoreFiles(copy))
}
function problem(read: () => unknown) {
  try {
    read()
  } catch (error) {
    return (error as { problem?: string }).problem
  }
  return 'accepted'
}

describe('environment runtime history reads (ADR-0244)', () => {
  it.each([8, 32])('re-validates nothing for an unchanged %i-snapshot history', (count) => {
    const root = history(count),
      reference = cold(root),
      expected = reference.get(ID),
      historical = reference.snapshot(ID, reference.get(ID).digest)
    const parse = vi.spyOn(JSON, 'parse'),
      stringify = vi.spyOn(JSON, 'stringify')
    const actual = new EnvironmentResources(new StoreFiles(root)).get(ID)
    const counts = { parse: parse.mock.calls.length, stringify: stringify.mock.calls.length }
    parse.mockRestore()
    stringify.mockRestore()
    console.info('Environment history reuse:', JSON.stringify({ count, ...counts }))
    expect(counts).toEqual({ parse: 0, stringify: 1 })
    expect(actual).toEqual(expected)
    expect(actual.sequence).toBe(count)
    expect(new EnvironmentResources(new StoreFiles(root)).snapshot(ID, historical.digest)).toEqual(
      historical,
    )
  })

  it('validates only an appended snapshot and keeps returned records private', () => {
    const root = history(8),
      records = new EnvironmentResources(new StoreFiles(root)),
      first = records.get(ID)
    first.record.observations.push({ stage: 'caller', at: AT, status: 'mutated', evidence: 'x' })
    for (const resource of first.record.resources) resource.name = 'mutated'
    expect(records.get(ID)).toEqual(cold(root).get(ID))
    // update() reads the current history, writes one snapshot and reads again:
    // only the appended snapshot is parsed, and a later reader parses nothing.
    const parse = vi.spyOn(JSON, 'parse')
    records.update(ID, (record) => {
      record.state = 'stopped'
    })
    expect(parse).toHaveBeenCalledTimes(1)
    const after = new EnvironmentResources(new StoreFiles(root)).get(ID)
    expect(parse).toHaveBeenCalledTimes(1)
    parse.mockRestore()
    expect(after).toEqual(cold(root).get(ID))
    expect(after.sequence).toBe(9)
  })

  it('refuses a same-length change to a reused snapshot and recovers only exact bytes', () => {
    const root = history(8),
      records = new EnvironmentResources(new StoreFiles(root))
    records.get(ID)
    const path = snapshotPath(root, 2),
      original = readFileSync(path, 'utf8'),
      changed = original.replace('"status":"s1"', '"status":"s9"')
    expect(changed).not.toBe(original)
    expect(changed.length).toBe(original.length)
    writeFileSync(path, changed)
    expect(problem(() => records.get(ID))).toBe('damaged-environment-history')
    expect(problem(() => cold(root).get(ID))).toBe('damaged-environment-history')
    writeFileSync(path, original)
    expect(records.get(ID)).toEqual(cold(root).get(ID))
  })

  it('re-validates the whole history when a live schema changes', () => {
    const root = history(4),
      records = new EnvironmentResources(new StoreFiles(root))
    records.get(ID)
    const required = ENVIRONMENT_RUNTIME_SCHEMA.required as string[]
    required.push('fixtureMissingProperty')
    try {
      expect(problem(() => records.get(ID))).toBe('invalid-shape')
    } finally {
      required.pop()
    }
    expect(records.get(ID).sequence).toBe(4)
  })
})
