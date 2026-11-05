import { mkdirSync, mkdtempSync, openSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readSourceFile } from '../../../src/delivery/input.js'
import { ManagedRunnerProcess } from '../../../src/runner/native-process.js'
import { StoreFiles } from '../../../src/state/files.js'
import { withReadObservation } from '../../../src/state/read-observation.js'

vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>()
  return { ...fs, openSync: vi.fn(fs.openSync) }
})
afterEach(() => vi.mocked(openSync).mockClear())

async function fixture(
  run: (files: StoreFiles, invocations: string[]) => Promise<void>,
  count = 1,
) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-native-observation-'))),
    files = new StoreFiles(root),
    invocations = Array.from({ length: count }, (_, i) => (i + 1).toString(16).padStart(64, '0'))
  try {
    for (const invocation of invocations) {
      const directory = join(root, 'delivery/runner-native', invocation)
      mkdirSync(directory, { recursive: true })
      for (const name of ['intent', 'started', 'outcome'])
        writeFileSync(join(directory, `${name}.json`), '{}')
    }
    await run(files, invocations)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('bounded original native registration resources', () => {
  it('counts each registration as one resource without promoting incomplete originals', () =>
    fixture(async (files, invocations) => {
      vi.mocked(openSync).mockClear()
      await withReadObservation(new AbortController().signal, async () => {
        readSourceFile(files.root, `delivery/runner-native/${invocations[0]}/intent.json`)
        const observed = ManagedRunnerProcess.observeAll(files, invocations)
        expect(observed).toHaveLength(400)
        expect(observed.every((entry) => entry.invocationState === 'unknown')).toBe(true)
        ManagedRunnerProcess.observeAll(files, invocations)
      })
      expect(openSync).toHaveBeenCalledTimes(400 * 3 * 2)
    }, 400))

  it.each(['intent', 'started', 'outcome'])(
    'still refuses a byte-only edit of the grouped %s original',
    (name) =>
      fixture(async (files, invocations) => {
        const path = `delivery/runner-native/${invocations[0]}/${name}.json`
        await expect(
          withReadObservation(new AbortController().signal, async () => {
            // An ordinary source reader retains its own selection as well.
            expect(readSourceFile(files.root, path)).toBe('{}')
            ManagedRunnerProcess.observeAll(files, invocations)
            writeFileSync(join(files.root, path), '{} ')
          }),
        ).rejects.toThrow('Read observation')
      }),
  )

  it.each(['intent', 'started', 'outcome'])(
    'still refuses an absent-to-present grouped %s original',
    (name) =>
      fixture(async (files, invocations) => {
        const path = join(files.root, `delivery/runner-native/${invocations[0]}/${name}.json`)
        rmSync(path)
        await expect(
          withReadObservation(new AbortController().signal, async () => {
            ManagedRunnerProcess.observeAll(files, invocations)
            writeFileSync(path, '{}')
          }),
        ).rejects.toThrow('Read observation')
      }),
  )
})
