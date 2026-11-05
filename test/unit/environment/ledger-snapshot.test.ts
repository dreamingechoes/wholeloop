import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { EnvironmentLedger } from '../../../src/environment/ledger.js'
import { StateStore } from '../../../src/state/store.js'

vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>()
  return { ...fs, readFileSync: vi.fn(fs.readFileSync) }
})
afterEach(() => vi.mocked(readFileSync).mockClear())

it('reads each current journal segment once for the complete declaration report', () => {
  const root = mkdtempSync(join(tmpdir(), 'wholeloop-environment-report-'))
  try {
    const store = new StateStore(join(root, 'state')),
      subject = store.create({
        kind: 'initiative',
        title: 'Fixture',
        owner: 'Fixture Owner',
        body: '',
      }).id,
      ledger = new EnvironmentLedger(store)
    ledger.declare(subject, {
      key: 'resource',
      resource: 'fixture:resource',
      effect: 'Declare fixture resource',
      undo: { cwd: root, argv: ['fixture-tool', 'remove'] },
      by: 'Fixture Owner',
    })
    const directory = store.files.path('journal'),
      segments = new Set(
        readdirSync(directory)
          .filter((name) => /^\d{4}-\d{2}\.ndjson$/.test(name))
          .map((name) => join(directory, name)),
      )
    vi.mocked(readFileSync).mockClear()
    const result = ledger.report(subject)
    expect(result.entries).toHaveLength(1)
    expect(result.executed).toBe(false)
    const reads = vi
      .mocked(readFileSync)
      .mock.calls.filter(([path]) => typeof path === 'string' && segments.has(path))
    expect(reads).toHaveLength(segments.size)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
