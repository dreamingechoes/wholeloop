import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readSourceBytes } from '../../../src/delivery/input.js'
import { StoreFiles } from '../../../src/state/files.js'
import { withReadObservation } from '../../../src/state/read-observation.js'

async function fixture(run: (root: string, files: StoreFiles) => Promise<void>) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-store-observation-')))
  try {
    await run(root, new StoreFiles(root))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('one physical store-path observation per selected input', () => {
  it('keeps 350 small actual inputs within the unchanged distinct-input budget', () =>
    fixture(async (root, files) => {
      for (let i = 0; i < 350; i++) writeFileSync(join(root, `${i}.txt`), 'public fixture')
      await withReadObservation(new AbortController().signal, async () => {
        for (let i = 0; i < 350; i++) {
          const path = files.path(`${i}.txt`)
          expect(path).toBe(join(root, `${i}.txt`))
          expect(readSourceBytes(root, path).toString()).toBe('public fixture')
        }
      })
    }))

  it('still refuses a nested Git marker created by another caller', () =>
    fixture(async (root, files) => {
      const selected = join(root, 'inputs')
      mkdirSync(selected)
      writeFileSync(join(selected, 'value'), 'public fixture')
      let release: () => void = () => undefined
      const gap = new Promise<void>((resolve) => {
          release = resolve
        }),
        pending = withReadObservation(new AbortController().signal, async () => {
          files.path('inputs/value')
          await gap
        })
      mkdirSync(join(selected, '.git'))
      release()
      await expect(pending).rejects.toThrow('outside git repositories')
    }))
})
