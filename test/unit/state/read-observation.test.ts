import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { StoreFiles } from '../../../src/state/files.js'
import {
  inReadObservation,
  observedRead,
  withReadObservation,
} from '../../../src/state/read-observation.js'

const signal = () => new AbortController().signal
async function fixture(run: (root: string, files: StoreFiles) => Promise<void>) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-observation-')))
  try {
    await run(root, new StoreFiles(join(root, 'state')))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('one bounded independently revalidated read observation', () => {
  it('reads the same current input twice rather than once per nested consumer', async () => {
    let reads = 0
    const read = () => {
      reads++
      return { bytes: Buffer.from('original'), value: 'original' }
    }
    await withReadObservation(signal(), async () => {
      for (let i = 0; i < 2000; i++) expect(observedRead('input', read)).toBe('original')
      expect(reads).toBe(1)
    })
    expect(reads).toBe(2)
    observedRead('input', read)
    expect(reads).toBe(3)
  })

  it('refuses actual input changes across an asynchronous gap', async () =>
    fixture(async (root) => {
      const path = join(root, 'input')
      writeFileSync(path, 'original')
      const read = () => ({ bytes: readFileSync(path), value: 'observed' })
      await expect(
        withReadObservation(signal(), async () => {
          observedRead('input', read)
          await Promise.resolve()
          writeFileSync(path, 'modified')
          return observedRead('input', read)
        }),
      ).rejects.toThrow('Read observation')
    }))

  it.each(['atomic', 'locked', 'retainLock'] as const)(
    'refuses %s before creating a directory and poisons a caught attempt',
    async (method) =>
      fixture(async (_root, files) => {
        await expect(
          withReadObservation(signal(), async () => {
            expect(() => {
              if (method === 'atomic') files.atomic('value', 'public fixture')
              else if (method === 'locked') files.locked(() => undefined)
              else files.retainLock('delivery/recovered-locks/00000000-0000-0000-0000-000000000000')
            }).toThrow('Read observation')
            expect(existsSync(files.root)).toBe(false)
            return 'caught mutation must not produce a verdict'
          }),
        ).rejects.toThrow('Read observation')
        files.atomic('value', 'public fixture')
        expect(files.read('value')).toBe('public fixture')
      }),
  )

  it('keeps simultaneous observations and unrelated callers independent', async () => {
    let reads = 0
    const read = () => ({ bytes: Buffer.from([++reads]), value: reads })
    await Promise.all(
      [1, 2].map(() =>
        withReadObservation(signal(), async () => {
          const own = observedRead('key', () => ({ bytes: Buffer.from('stable'), value: reads++ }))
          await Promise.resolve()
          expect(observedRead('key', read)).toBe(own)
        }),
      ),
    )
    expect(inReadObservation()).toBe(false)
  })

  it('never carries an input from one observation to the next', async () => {
    let input = 'first'
    const read = () => ({ bytes: Buffer.from(input), value: input })
    expect(await withReadObservation(signal(), async () => observedRead('key', read))).toBe('first')
    input = 'second'
    expect(await withReadObservation(signal(), async () => observedRead('key', read))).toBe(
      'second',
    )
  })

  it('seals newly created private marker paths as changed input', async () =>
    fixture(async (_root, files) => {
      let release: () => void = () => undefined
      const gap = new Promise<void>((resolve) => {
          release = resolve
        }),
        pending = withReadObservation(signal(), async () => {
          expect(existsSync(files.path('revoked.json'))).toBe(false)
          await gap
        })
      files.atomic('revoked.json', 'public fixture')
      release()
      await expect(pending).rejects.toThrow('Read observation')
    }))

  it('revalidates shared nested inputs once in the fresh phase', async () => {
    let reads = 0
    const read = () => {
      reads++
      return { bytes: Buffer.from('inner'), value: 'inner' }
    }
    await withReadObservation(signal(), async () => {
      for (const key of ['outer-a', 'outer-b'])
        observedRead(key, () => {
          const value = observedRead('inner', read)
          return { bytes: Buffer.from(value), value }
        })
    })
    expect(reads).toBe(2)
  })

  it('closes inherited asynchronous continuations after the result returns', async () =>
    fixture(async (_root, files) => {
      let delayed: Promise<void> | undefined
      await withReadObservation(signal(), async () => {
        observedRead('key', () => ({ bytes: Buffer.from('value'), value: 'value' }))
        delayed = new Promise((resolve) => {
          setImmediate(() => {
            expect(() =>
              observedRead('key', () => ({ bytes: Buffer.alloc(0), value: '' })),
            ).toThrow()
            expect(() => files.atomic('late', 'public fixture')).toThrow()
            resolve()
          })
        })
      })
      await delayed
      expect(existsSync(files.root)).toBe(false)
    }))

  it.each(['before', 'during'] as const)('refuses cancellation %s observation', async (when) => {
    const controller = new AbortController()
    if (when === 'before') controller.abort()
    await expect(
      withReadObservation(controller.signal, async () => {
        observedRead('key', () => ({ bytes: Buffer.from('value'), value: 'value' }))
        controller.abort()
      }),
    ).rejects.toThrow('Read observation')
  })

  it('refuses nested scopes and bounds distinct read identities', async () => {
    await expect(
      withReadObservation(signal(), () => withReadObservation(signal(), async () => undefined)),
    ).rejects.toThrow('Read observation')
    await expect(
      withReadObservation(signal(), async () => {
        for (let i = 0; i <= 1024; i++)
          observedRead(String(i), () => ({ bytes: Buffer.from('value'), value: i }))
      }),
    ).rejects.toThrow('Read observation')
  })
})
