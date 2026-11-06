import {
  existsSync,
  fsyncSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { describe, expect, it, vi } from 'vitest'
import { StoreFiles } from '../../../src/state/files.js'

vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>()
  return { ...fs, fsyncSync: vi.fn(fs.fsyncSync), renameSync: vi.fn(fs.renameSync) }
})

function fixture(run: (files: StoreFiles) => void) {
  const root = mkdtempSync(join(tmpdir(), 'wholeloop-lock-'))
  try {
    run(new StoreFiles(join(root, 'state')))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('bounded store lock acquisition', () => {
  it.each([NaN, Infinity, -Infinity, -1, 1.5, 2147483648])(
    'refuses invalid wait %s before creating state or invoking the writer',
    (timeout) =>
      fixture((files) => {
        const operation = vi.fn()
        expect(() => files.locked(operation, timeout)).toThrow('Invalid store lock timeout')
        expect(operation).not.toHaveBeenCalled()
        expect(existsSync(files.root)).toBe(false)
      }),
  )

  it('allows one immediate zero-wait attempt and preserves an occupied owner', () =>
    fixture((files) => {
      files.locked(() => {
        const owner = readFileSync(files.path('.lock/owner.json')),
          wait = vi.spyOn(Atomics, 'wait'),
          operation = vi.fn()
        try {
          expect(() => files.locked(operation, 0)).toThrow('Store is locked')
          expect(operation).not.toHaveBeenCalled()
          expect(wait).not.toHaveBeenCalled()
          expect(readFileSync(files.path('.lock/owner.json'))).toEqual(owner)
        } finally {
          wait.mockRestore()
        }
      }, 0)
      expect(existsSync(files.path('.lock'))).toBe(false)
    }))

  it('keeps the wait budget through a wall-clock jump and reuses one bounded wait buffer', () =>
    fixture((files) => {
      files.locked(() => {
        const owner = readFileSync(files.path('.lock/owner.json')),
          wait = vi.spyOn(Atomics, 'wait'),
          operation = vi.fn()
        let clockReads = 0
        const waits: { buffer: unknown; milliseconds: number | undefined }[] = []
        const wall = vi.spyOn(Date, 'now').mockImplementation(() => (clockReads++ ? 1e12 : 0)),
          start = performance.now()
        try {
          expect(() => files.locked(operation, 15)).toThrow('Store is locked')
        } finally {
          waits.push(
            ...wait.mock.calls.map(([buffer, , , milliseconds]) => ({ buffer, milliseconds })),
          )
          wall.mockRestore()
          wait.mockRestore()
        }
        expect(performance.now() - start).toBeGreaterThanOrEqual(15)
        expect(operation).not.toHaveBeenCalled()
        expect(readFileSync(files.path('.lock/owner.json'))).toEqual(owner)
        expect(waits.length).toBeGreaterThan(0)
        expect(new Set(waits.map(({ buffer }) => buffer)).size).toBe(1)
        expect(
          waits.every(({ milliseconds }) => milliseconds !== undefined && milliseconds <= 10),
        ).toBe(true)
      })
    }))

  it('writes diagnostic owner metadata once without flushing or renaming it (ADR-0242)', () =>
    fixture((files) => {
      files.locked(() => {})
      vi.mocked(fsyncSync).mockClear()
      vi.mocked(renameSync).mockClear()
      let owner: { pid: number; started: string } | undefined
      let mode = 0
      files.locked(() => {
        owner = JSON.parse(readFileSync(files.path('.lock/owner.json'), 'utf8'))
        mode = statSync(files.path('.lock/owner.json')).mode & 0o777
      })
      expect(fsyncSync).not.toHaveBeenCalled()
      expect(renameSync).not.toHaveBeenCalled()
      expect(owner?.pid).toBe(process.pid)
      expect(new Date(owner?.started ?? '').toISOString()).toBe(owner?.started)
      expect(mode).toBe(0o600)
      expect(existsSync(files.path('.lock'))).toBe(false)
      // Committed store writes keep their file and directory flushes.
      files.locked(() => files.atomic('fact.json', '{}\n'))
      expect(fsyncSync).toHaveBeenCalledTimes(2)
    }))
})
