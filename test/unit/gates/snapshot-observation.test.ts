import { spawnSync } from 'node:child_process'
import { chmodSync, readFileSync, renameSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { workspaceSnapshot } from '../../../src/gates/snapshot.js'
import { withReadObservation } from '../../../src/state/read-observation.js'
import { fixture } from '../../support/delivery.js'

vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>()
  return { ...fs, readFileSync: vi.fn(fs.readFileSync) }
})
vi.mock('node:child_process', async (original) => {
  const processes = await original<typeof import('node:child_process')>()
  return { ...processes, spawnSync: vi.fn(processes.spawnSync) }
})
const bounds = { maxFileBytes: 1024, maxBytes: 4096, maxFiles: 10, denySymlinks: true }

describe('workspace bytes within fixed read observations', () => {
  it.each([12, 48])('captures and revalidates one workspace across %i reads', (count) =>
    fixture(async ({ root }) => {
      const expected = workspaceSnapshot(root),
        file = join(root, 'app.txt')
      vi.mocked(readFileSync).mockClear()
      vi.mocked(spawnSync).mockClear()
      await withReadObservation(new AbortController().signal, async () => {
        for (let index = 0; index < count; index++) {
          const value = workspaceSnapshot(root)
          expect(value).toEqual(expected)
          value.digest = 'caller-edit'
        }
      })
      const files = vi
          .mocked(readFileSync)
          .mock.calls.filter(([path]) => String(path) === file).length,
        git = vi.mocked(spawnSync).mock.calls.filter(([command]) => command === 'git').length
      console.info('Workspace observation work:', JSON.stringify({ count, files, git }))
      expect(files).toBe(2)
      expect(git).toBe(8)
    }),
  )
  it('refuses tracked bytes changed by another caller before the verdict', () =>
    fixture(async ({ root }) => {
      let release: () => void = () => undefined
      const gap = new Promise<void>((resolve) => {
          release = resolve
        }),
        pending = withReadObservation(new AbortController().signal, async () => {
          workspaceSnapshot(root)
          await gap
        })
      writeFileSync(join(root, 'app.txt'), 'Changed tracked bytes after snapshot capture.\n')
      release()
      await expect(pending).rejects.toThrow('Read observation')
    }))
  it('preserves independent current reads outside observations', () =>
    fixture(({ root }) => {
      const before = workspaceSnapshot(root)
      writeFileSync(join(root, 'app.txt'), 'Changed between independent snapshots.\n')
      expect(workspaceSnapshot(root).digest).not.toBe(before.digest)
    }))
  it('enforces every narrower file/byte limit after an unbounded snapshot', () =>
    fixture(async ({ root }) => {
      await withReadObservation(new AbortController().signal, async () => {
        const original = workspaceSnapshot(root)
        expect(workspaceSnapshot(root, bounds)).toEqual(original)
        expect(() => workspaceSnapshot(root, { ...bounds, maxFiles: 0 })).toThrow('file limit')
        expect(() => workspaceSnapshot(root, { ...bounds, maxBytes: 0 })).toThrow('byte limit')
        expect(() => workspaceSnapshot(root, { ...bounds, maxFileBytes: 0 })).toThrow()
        expect(() => workspaceSnapshot(root, { ...bounds, maxFileBytes: Number.NaN })).toThrow()
        expect(workspaceSnapshot(root, { ...bounds, maxBytes: Number.NaN })).toEqual(original)
        expect(workspaceSnapshot(root, { ...bounds, maxFiles: Number.POSITIVE_INFINITY })).toEqual(
          original,
        )
      })
    }))
  it('does not reuse a permissive link policy for a deny-symlinks request', () =>
    fixture(async ({ root }) => {
      symlinkSync('app.txt', join(root, 'alias.txt'))
      await withReadObservation(new AbortController().signal, async () => {
        const original = workspaceSnapshot(root)
        expect(workspaceSnapshot(root, { ...bounds, denySymlinks: false })).toEqual(original)
        expect(() => workspaceSnapshot(root, bounds)).toThrow('symbolic links')
      })
    }))
  it.each(['mode', 'link'] as const)('revalidates captured %s changes before returning', (mode) =>
    fixture(async ({ root }) => {
      const file = join(root, 'app.txt'),
        alias = join(root, 'alias.txt')
      if (mode === 'link') symlinkSync('app.txt', alias)
      let release: () => void = () => undefined
      const gap = new Promise<void>((resolve) => {
          release = resolve
        }),
        pending = withReadObservation(new AbortController().signal, async () => {
          workspaceSnapshot(root)
          await gap
        })
      if (mode === 'mode') chmodSync(file, 0o600)
      else {
        renameSync(alias, join(root, '..', 'retained-workspace-link'))
        symlinkSync('./app.txt', alias)
      }
      release()
      await expect(pending).rejects.toThrow('Read observation')
    }),
  )
  it('owns the bounds used to revalidate its original snapshot', () =>
    fixture(async ({ root }) => {
      const current = { ...bounds }
      await withReadObservation(new AbortController().signal, async () => {
        workspaceSnapshot(root, current)
        current.maxFiles = 0
      })
    }))
  it('never hides a changed Git environment behind an earlier snapshot key', () =>
    fixture(async ({ root }) => {
      const key = 'WHOLELOOP_SNAPSHOT_ENV_FIXTURE',
        previous = process.env[key],
        restore = () => {
          if (previous === undefined) delete process.env[key]
          else process.env[key] = previous
        }
      try {
        await expect(
          withReadObservation(new AbortController().signal, async () => {
            workspaceSnapshot(root)
            process.env[key] = 'changed-fixture'
            workspaceSnapshot(root)
            restore()
          }),
        ).rejects.toThrow('Read observation')
      } finally {
        restore()
      }
    }))
})
