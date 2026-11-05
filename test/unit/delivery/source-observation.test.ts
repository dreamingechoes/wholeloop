import { openSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readSourceBytes } from '../../../src/delivery/input.js'
import { withReadObservation } from '../../../src/state/read-observation.js'
import { fixture } from '../../support/delivery.js'

vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>()
  return { ...fs, openSync: vi.fn(fs.openSync) }
})
afterEach(() => vi.mocked(openSync).mockClear())

describe('exact source bytes shared only within a verified read', () => {
  it('opens an input twice for one thousand consumers and never exposes its private buffer', () =>
    fixture(async ({ root }) => {
      vi.mocked(openSync).mockClear()
      await withReadObservation(new AbortController().signal, async () => {
        readSourceBytes(root, 'app.txt').fill(0)
        for (let i = 0; i < 1000; i++)
          expect(readSourceBytes(root, 'app.txt').toString()).toBe('Original application.\n')
      })
      expect(openSync).toHaveBeenCalledTimes(2)
    }))

  it('does not reuse a larger reader allowance for a smaller one', () =>
    fixture(async ({ root }) => {
      await withReadObservation(new AbortController().signal, async () => {
        expect(readSourceBytes(root, 'app.txt', 128).length).toBeGreaterThan(1)
        expect(() => readSourceBytes(root, 'app.txt', 1)).toThrow('oversized')
      })
    }))

  it('shares bytes across equivalent selections and independently checks each allowance', () =>
    fixture(async ({ root }) => {
      vi.mocked(openSync).mockClear()
      await withReadObservation(new AbortController().signal, async () => {
        for (let i = 0; i < 30; i++) {
          expect(readSourceBytes(root, 'app.txt', 64).toString()).toBe('Original application.\n')
          expect(readSourceBytes(root, join(root, 'app.txt'), 128).toString()).toBe(
            'Original application.\n',
          )
          expect(() => readSourceBytes(root, 'app.txt', 1)).toThrow('oversized')
        }
      })
      expect(openSync).toHaveBeenCalledTimes(2)
    }))

  it('refuses invalid allowances even after capturing valid bytes', () =>
    fixture(async ({ root }) => {
      await withReadObservation(new AbortController().signal, async () => {
        readSourceBytes(root, 'app.txt')
        for (const limit of [-1, NaN, Infinity, 1.5])
          expect(() => readSourceBytes(root, 'app.txt', limit)).toThrow('unsafe-file')
      })
    }))

  it('rejects a same-length source edit by another caller', () =>
    fixture(async ({ root }) => {
      let release: () => void = () => undefined
      const gap = new Promise<void>((resolve) => {
          release = resolve
        }),
        pending = withReadObservation(new AbortController().signal, async () => {
          readSourceBytes(root, 'app.txt')
          await gap
        })
      writeFileSync(join(root, 'app.txt'), 'Modified application.\n')
      release()
      await expect(pending).rejects.toThrow('Read observation')
    }))
})
