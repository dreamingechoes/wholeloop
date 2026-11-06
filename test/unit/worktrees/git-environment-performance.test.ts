import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { gitEnvironmentIdentity } from '../../../src/worktrees/git.js'

vi.mock('node:crypto', async (original) => {
  const crypto = await original<typeof import('node:crypto')>()
  return { ...crypto, createHash: vi.fn(crypto.createHash) }
})
function within<T>(environment: NodeJS.ProcessEnv, run: () => T): T {
  const previous = process.env
  process.env = environment
  try {
    return run()
  } finally {
    process.env = previous
  }
}
const originalDigest = (environment: NodeJS.ProcessEnv) =>
  createHash('sha256')
    .update(JSON.stringify(Object.entries(environment).sort(([a], [b]) => a.localeCompare(b))))
    .digest('hex')

describe('fresh Git environment fingerprints', () => {
  it.each([100, 400])(
    'checks every current value without repeating %i-key serialization',
    (count) => {
      const environment: NodeJS.ProcessEnv = Object.create(null)
      let reads = 0
      for (let index = 0; index < count; index++)
        Object.defineProperty(environment, `WHOLELOOP_FP_${count}_${index}`, {
          enumerable: true,
          get() {
            reads++
            return `fixture-${index}`
          },
        })
      const expected = originalDigest(environment),
        entries = vi.spyOn(Object, 'entries')
      vi.mocked(createHash).mockClear()
      reads = 0
      let result: string | undefined, fingerprints: number, vectors: number, fields: number
      try {
        within(environment, () => {
          for (let iteration = 0; iteration < 100; iteration++) result = gitEnvironmentIdentity()
        })
        fingerprints = vi.mocked(createHash).mock.calls.length
        vectors = entries.mock.calls.filter(([value]) => value === environment).length
        fields = reads
      } finally {
        entries.mockRestore()
      }
      console.info(
        'Environment fingerprint work:',
        JSON.stringify({ count, fingerprints, vectors, fields }),
      )
      expect(result).toBe(expected)
      expect(fingerprints).toBe(1)
      expect(vectors).toBeLessThanOrEqual(1)
      expect(fields).toBe(count * 100)
    },
  )
  it('reads each value once even when the last key changes', () => {
    const values: Record<string, string> = { FIRST: 'one', MIDDLE: 'two', LAST: 'three' },
      environment: NodeJS.ProcessEnv = {}
    let reads = 0
    for (const key of Object.keys(values))
      Object.defineProperty(environment, key, {
        enumerable: true,
        get() {
          reads++
          return values[key]
        },
      })
    within(environment, () => {
      gitEnvironmentIdentity()
      values.LAST = 'changed'
      const expected = originalDigest(environment)
      reads = 0
      expect(gitEnvironmentIdentity()).toBe(expected)
      expect(reads).toBe(3)
    })
  })
  it('preserves exact hashes through changes, reordering, undefined values and inherited names', () => {
    const environment: NodeJS.ProcessEnv = { Z: 'last', A: 'first', UNDEFINED: undefined },
      check = () => expect(gitEnvironmentIdentity()).toBe(originalDigest(process.env))
    within(environment, () => {
      check()
      environment.Z = 'changed'
      check()
      delete environment.A
      environment.NEW_UNDEFINED = undefined
      check()
      process.env = Object.fromEntries(Object.entries(environment).reverse())
      check()
      process.env = Object.assign(Object.create({ INHERITED: 'excluded' }), process.env)
      Object.defineProperty(process.env, Symbol('excluded'), {
        enumerable: true,
        value: 'excluded',
      })
      check()
      process.env = JSON.parse(
        '{"__proto__":"fixture","constructor":"fixture","KEY":"value"}',
      ) as NodeJS.ProcessEnv
      check()
    })
  })
  it.each(['keys', 'units'] as const)(
    'does not retain an environment beyond the %s cap',
    (kind) => {
      const environment =
        kind === 'keys'
          ? Object.fromEntries(
              Array.from({ length: 513 }, (_, index) => [`LARGE_${index}`, 'fixture']),
            )
          : { LARGE_VALUE: 'x'.repeat(65537) }
      const expected = originalDigest(environment)
      vi.mocked(createHash).mockClear()
      const results = within(environment, () => [
        gitEnvironmentIdentity(),
        gitEnvironmentIdentity(),
      ])
      expect(vi.mocked(createHash)).toHaveBeenCalledTimes(2)
      expect(results).toEqual([expected, expected])
    },
  )
})
