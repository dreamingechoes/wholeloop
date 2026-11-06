import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { canonicalPath } from '../../../src/state/paths.js'

vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>()
  return { ...fs, existsSync: vi.fn(fs.existsSync), realpathSync: vi.fn(fs.realpathSync) }
})
function fixture(run: (root: string) => void) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-path-suffix-')))
  try {
    run(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('missing-path suffix construction', () => {
  it.each([100, 400])(
    'keeps %i required ancestor probes without quadratic suffix shifts',
    (count) =>
      fixture((root) => {
        const suffix = Array.from({ length: count }, () => 'x'),
          selected = join(root, ...suffix),
          original = Array.prototype.unshift
        let calls = 0,
          movedPositions = 0
        const shifting = vi.spyOn(Array.prototype, 'unshift').mockImplementation(function (
          this: unknown[],
          ...values: unknown[]
        ) {
          if (values.length === 1 && values[0] === 'x') {
            calls++
            movedPositions += this.length
          }
          return Reflect.apply(original, this, values)
        })
        vi.mocked(existsSync).mockClear()
        vi.mocked(realpathSync).mockClear()
        let result: string
        try {
          result = canonicalPath(selected)
        } finally {
          shifting.mockRestore()
        }
        const probes = vi.mocked(existsSync).mock.calls.map(([path]) => String(path)),
          physical = vi.mocked(realpathSync).mock.calls.map(([path]) => String(path))
        console.info(
          'Missing path suffix work:',
          JSON.stringify({
            count,
            calls,
            movedPositions,
            probes: probes.length,
            realpaths: physical.length,
          }),
        )
        expect(result).toBe(selected)
        expect(calls).toBe(0)
        expect(movedPositions).toBe(0)
        expect(probes).toEqual(
          Array.from({ length: count + 1 }, (_, index) => join(root, ...suffix.slice(index))),
        )
        expect(physical).toEqual([root])
      }),
  )
  it('retains suffix order and observes changes to existing symlink ancestors', () =>
    fixture((root) => {
      mkdirSync(join(root, 'first'))
      mkdirSync(join(root, 'second'))
      const alias = join(root, 'alias'),
        selected = join(alias, 'missing', 'nested', 'leaf')
      symlinkSync(join(root, 'first'), alias)
      expect(canonicalPath(selected)).toBe(join(root, 'first', 'missing', 'nested', 'leaf'))
      renameSync(alias, `${alias}.retained`)
      symlinkSync(join(root, 'second'), alias)
      expect(canonicalPath(selected)).toBe(join(root, 'second', 'missing', 'nested', 'leaf'))
    }))
})
