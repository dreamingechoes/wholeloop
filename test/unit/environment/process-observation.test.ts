import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  operationGroup,
  operationGroups,
  processPresence,
} from '../../../src/environment/operations.js'
import { withReadObservation } from '../../../src/state/read-observation.js'

vi.mock('node:child_process', async (original) => {
  const process = await original<typeof import('node:child_process')>()
  return { ...process, spawnSync: vi.fn(process.spawnSync) }
})
afterEach(() => vi.mocked(spawnSync).mockReset())
function table(rows: string, status = 0) {
  return {
    status,
    stdout: rows,
    stderr: '',
    pid: 1,
    signal: null,
    output: [null, rows, ''],
  } as ReturnType<typeof spawnSync>
}

describe('one fresh process table per read and validation phase', () => {
  it('shares two table reads across repeated exact group projections', async () => {
    vi.mocked(spawnSync).mockReturnValue(table('500 100\n600 200\n'))
    await withReadObservation(new AbortController().signal, async () => {
      for (let i = 0; i < 100; i++) {
        const groups = operationGroups([100, 200, 300])
        expect(groups.get(100)?.status).toBe('present')
        expect(groups.get(300)?.status).toBe('absent')
        expect(processPresence(100)).toBe('absent')
        const copy = operationGroup(100)
        copy.status = 'unknown'
        expect(operationGroup(100).status).toBe('present')
      }
    })
    expect(spawnSync).toHaveBeenCalledTimes(2)
  })

  it.each(['unrelated-process', 'new-group-member', 'unavailable-table'] as const)(
    'revalidates relevant members with %s',
    async (mode) => {
      vi.mocked(spawnSync)
        .mockReturnValueOnce(table('500 100\n'))
        .mockReturnValue(
          mode === 'unavailable-table'
            ? table('', 1)
            : table(mode === 'new-group-member' ? '500 100\n501 100\n' : '500 100\n700 700\n'),
        )
      const result = withReadObservation(new AbortController().signal, async () => {
        expect(operationGroup(100).status).toBe('present')
        expect(operationGroup(300).status).toBe('absent')
      })
      if (mode === 'unrelated-process') await expect(result).resolves.toBeUndefined()
      else await expect(result).rejects.toThrow('Read observation')
      expect(spawnSync).toHaveBeenCalledTimes(2)
    },
  )

  it('does not upgrade an unavailable common table with a per-group retry', async () => {
    vi.mocked(spawnSync).mockReturnValueOnce(table('', 1)).mockReturnValue(table('500 100\n'))
    await expect(
      withReadObservation(new AbortController().signal, async () => {
        expect(operationGroup(100).status).toBe('unknown')
        expect(operationGroup(200).status).toBe('unknown')
        expect(spawnSync).toHaveBeenCalledTimes(1)
      }),
    ).rejects.toThrow('Read observation')
    expect(spawnSync).toHaveBeenCalledTimes(2)
  })
})
