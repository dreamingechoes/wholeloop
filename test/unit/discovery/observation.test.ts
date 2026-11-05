import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { discover } from '../../../src/discovery/tree.js'
import { withReadObservation } from '../../../src/state/read-observation.js'
import { fixture } from '../../support/delivery.js'

describe('discovery used as evidence rather than a cache writer', () => {
  it.each(['stable', 'changed'] as const)(
    'preserves %s inventory without acquiring a lock',
    (mode) =>
      fixture(async ({ dir, root, planning }) => {
        const home = join(dir, 'home'),
          path = join(root, 'package.json'),
          files = planning.sources.files
        mkdirSync(home)
        writeFileSync(path, JSON.stringify({ scripts: { test: 'node --test' } }))
        const original = discover(root, files, home),
          locked = vi.spyOn(files, 'locked')
        let release: () => void = () => undefined
        const gap = new Promise<void>((resolve) => {
            release = resolve
          }),
          pending = withReadObservation(new AbortController().signal, async () => {
            for (let i = 0; i < 30; i++) {
              const inventory = discover(root, files, home)
              expect(inventory.repo).toEqual(original.repo)
              expect(inventory.fingerprint).toBe(original.fingerprint)
              inventory.repo.commands.length = 0
            }
            await gap
          })
        if (mode === 'changed')
          writeFileSync(path, JSON.stringify({ scripts: { test: 'node --check app.txt' } }))
        release()
        if (mode === 'changed') await expect(pending).rejects.toThrow('Read observation')
        else await expect(pending).resolves.toBeUndefined()
        expect(locked).not.toHaveBeenCalled()
      }),
  )
})
