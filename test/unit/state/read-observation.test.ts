import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { StoreFiles } from '../../../src/state/files.js'
import { externalStorePath } from '../../../src/state/paths.js'
import {
  groupReadResources,
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

  it.each(['directory', 'file', 'bare'] as const)(
    'refuses an intermediate %s repository marker on a shared ancestor',
    async (kind) =>
      fixture(async (root) => {
        const common = join(root, 'shared'),
          markers = kind === 'bare' ? ['HEAD', 'objects', 'refs'] : ['.git']
        mkdirSync(common)
        await expect(
          withReadObservation(signal(), async () => {
            externalStorePath(join(common, 'first'), common)
            if (kind === 'directory') mkdirSync(join(common, '.git'))
            else if (kind === 'file')
              writeFileSync(join(common, '.git'), 'Fixture repository marker.\n')
            else {
              writeFileSync(join(common, 'HEAD'), 'ref: refs/heads/main\n')
              mkdirSync(join(common, 'objects'))
              mkdirSync(join(common, 'refs'))
            }
            try {
              externalStorePath(join(common, 'second'), common)
            } finally {
              // Restoration before final validation must not erase an observed refusal.
              for (const marker of markers)
                rmSync(join(common, marker), { recursive: true, force: true })
            }
          }),
        ).rejects.toThrow('Runtime state must stay outside git repositories')
        expect(externalStorePath(join(common, 'second'), common)).toBe(join(common, 'second'))
      }),
  )

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

  it('retains every independent projection and bounds projections of one resource', async () => {
    let reads = 0
    await expect(
      withReadObservation(signal(), async () => {
        for (let i = 0; i < 9; i++)
          observedRead(
            String(i),
            () => {
              reads++
              return { bytes: Buffer.from('fixture'), value: i }
            },
            'one-resource',
          )
      }),
    ).rejects.toThrow('Read observation')
    expect(reads).toBe(8)
  })

  it('refuses a changed projection even when another view of its resource remains stable', async () => {
    let bytes = 'before'
    await expect(
      withReadObservation(signal(), async () => {
        observedRead('path', () => ({ bytes: Buffer.from('stable'), value: 'path' }), 'resource')
        observedRead('content', () => ({ bytes: Buffer.from(bytes), value: bytes }), 'resource')
        bytes = 'after'
      }),
    ).rejects.toThrow('Read observation')
  })

  it('does not let the same read identity change resource accounting', async () => {
    await expect(
      withReadObservation(signal(), async () => {
        const read = () => ({ bytes: Buffer.from('fixture'), value: 'fixture' })
        observedRead('key', read, 'original')
        expect(() => observedRead('key', read, 'replacement')).toThrow('Read observation')
      }),
    ).rejects.toThrow('Read observation')
  })

  it('poisons a caught resource substitution during independent revalidation', async () => {
    let reads = 0
    const inner = () => ({ bytes: Buffer.from('inner'), value: 'inner' })
    await expect(
      withReadObservation(signal(), async () => {
        observedRead('inner', inner, 'original')
        observedRead('outer', () => {
          if (reads++)
            expect(() => observedRead('inner', inner, 'replacement')).toThrow('Read observation')
          return { bytes: Buffer.from('outer'), value: 'outer' }
        })
      }),
    ).rejects.toThrow('Read observation')
  })

  it('still bounds aggregate bytes independently of resource and projection counts', async () => {
    await expect(
      withReadObservation(signal(), async () => {
        observedRead('large', () => ({ bytes: Buffer.alloc(64 * 1024 * 1024 + 1), value: '' }))
      }),
    ).rejects.toThrow('Read observation')
  })

  it('groups already selected members without duplicating their physical reads', async () => {
    let reads = 0
    const read = () => {
      reads++
      return { bytes: Buffer.from('fixture'), value: 'fixture' }
    }
    await withReadObservation(signal(), async () => {
      observedRead('path', read, 'file')
      groupReadResources('registration', ['file'])
      groupReadResources('registration', ['file'])
      for (let i = 0; i < 100; i++) observedRead('path', read, 'file')
      observedRead('content', read, 'file')
      expect(reads).toBe(2)
    })
    expect(reads).toBe(4)
  })

  it('refuses changed, overlapping or nested group membership', async () => {
    for (const mode of ['changed', 'overlapping', 'nested'])
      await expect(
        withReadObservation(signal(), async () => {
          groupReadResources('first', ['file'])
          expect(() => {
            if (mode === 'changed') groupReadResources('first', ['different'])
            else if (mode === 'overlapping') groupReadResources('second', ['file'])
            else groupReadResources('second', ['first'])
          }).toThrow('Read observation')
        }),
      ).rejects.toThrow('Read observation')
  })

  it('retains projection limits when merging existing members and forgets groups between actions', async () => {
    await expect(
      withReadObservation(signal(), async () => {
        for (let i = 0; i < 9; i++)
          observedRead(
            String(i),
            () => ({ bytes: Buffer.from('fixture'), value: i }),
            i < 5 ? 'a' : 'b',
          )
        groupReadResources('group', ['a', 'b'])
      }),
    ).rejects.toThrow('Read observation')
    for (const group of ['first', 'second'])
      await expect(
        withReadObservation(signal(), async () => {
          groupReadResources(group, ['file'])
          return observedRead('key', () => ({ bytes: Buffer.from(group), value: group }), 'file')
        }),
      ).resolves.toBe(group)
  })

  it('bounds grouped member and projection counts even without successful captures', async () => {
    for (const mode of ['members', 'projections', 'empty-groups'])
      await expect(
        withReadObservation(signal(), async () => {
          if (mode === 'members') groupReadResources('group', Array.from({ length: 9 }, String))
          else if (mode === 'empty-groups')
            for (let i = 0; i <= 1024; i++) groupReadResources(`group-${i}`, [`file-${i}`])
          else {
            groupReadResources('group', ['file'])
            for (let i = 0; i < 9; i++)
              observedRead(String(i), () => ({ bytes: Buffer.from('fixture'), value: i }), 'file')
          }
        }),
      ).rejects.toThrow('Read observation')
  })

  it('refuses regrouping an in-progress capture or creating a group during revalidation', async () => {
    for (const mode of ['pending', 'validation'])
      await expect(
        withReadObservation(signal(), async () => {
          let reads = 0
          observedRead('key', () => {
            if (mode === 'pending' || reads++)
              expect(() => groupReadResources('group', ['key'])).toThrow('Read observation')
            return { bytes: Buffer.from('fixture'), value: 'fixture' }
          })
        }),
      ).rejects.toThrow('Read observation')
  })
})
