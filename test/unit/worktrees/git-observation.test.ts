import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { withReadObservation } from '../../../src/state/read-observation.js'
import { ancestor, git, gitBytes } from '../../../src/worktrees/git.js'
import { fixture, git as mutate } from '../../support/delivery.js'

vi.mock('node:child_process', async (original) => {
  const process = await original<typeof import('node:child_process')>()
  return { ...process, spawnSync: vi.fn(process.spawnSync) }
})
afterEach(() => vi.mocked(spawnSync).mockClear())
const signal = () => new AbortController().signal

describe('Git queries within one independently verified observation', () => {
  it('executes two processes for one thousand identical queries and protects private bytes', () =>
    fixture(async ({ root }) => {
      const expected = git(root, ['rev-parse', 'HEAD'])
      vi.mocked(spawnSync).mockClear()
      await withReadObservation(signal(), async () => {
        const bytes = gitBytes(root, ['rev-parse', 'HEAD'])
        bytes.fill(0)
        for (let i = 0; i < 1000; i++) expect(git(root, ['rev-parse', 'HEAD'])).toBe(expected)
      })
      expect(spawnSync).toHaveBeenCalledTimes(2)
      git(root, ['rev-parse', 'HEAD'])
      expect(spawnSync).toHaveBeenCalledTimes(3)
    }))

  it.each([
    ['reset', '--hard'],
    ['update-ref', 'refs/heads/foreign', 'HEAD'],
    ['branch', 'foreign'],
    ['config', 'unsafe.setting', 'value'],
    ['worktree', 'prune'],
    ['diff', '--output=unexpected'],
    ['-c', 'unsafe.setting=value', 'rev-parse', 'HEAD'],
  ])('refuses mutation or unsupported query %j before launch', (...args) =>
    fixture(async ({ root }) => {
      vi.mocked(spawnSync).mockClear()
      await expect(
        withReadObservation(signal(), async () => {
          expect(() => git(root, args)).toThrow('Read observation')
        }),
      ).rejects.toThrow('Read observation')
      expect(spawnSync).not.toHaveBeenCalled()
    }),
  )

  it('detects a real ref movement by another caller before releasing the result', () =>
    fixture(async ({ root }) => {
      const previous = mutate(root, ['rev-parse', 'HEAD'])
      mutate(root, ['commit', '--allow-empty', '-m', 'test: advance the disposable ref'])
      let release: () => void = () => undefined
      const gap = new Promise<void>((resolve) => {
          release = resolve
        }),
        result = withReadObservation(signal(), async () => {
          const head = git(root, ['rev-parse', 'HEAD'])
          await gap
          expect(git(root, ['rev-parse', 'HEAD'])).toBe(head)
        })
      mutate(root, ['update-ref', 'HEAD', previous])
      release()
      await expect(result).rejects.toThrow('Read observation')
    }))

  it('rechecks ancestry and the existing no-include configuration query', () =>
    fixture(async ({ root }) => {
      const head = git(root, ['rev-parse', 'HEAD']).trim()
      vi.mocked(spawnSync).mockClear()
      await withReadObservation(signal(), async () => {
        for (let i = 0; i < 20; i++) {
          expect(ancestor(root, head, head)).toBe(true)
          expect(git(root, ['config', '--local', '--no-includes', '--null', '--list'])).toContain(
            'core.repositoryformatversion',
          )
        }
      })
      expect(spawnSync).toHaveBeenCalledTimes(4)
    }))
})
