import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSync } from 'esbuild'
import { describe, expect, it, vi } from 'vitest'
import { ForegroundOwner } from '../../../src/runner/foreground-owner.js'
import { RunnerStore } from '../../../src/runner/store.js'

vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>()
  return { ...fs, readFileSync: vi.fn(fs.readFileSync), openSync: vi.fn(fs.openSync) }
})
function fixture(
  run: (input: {
    root: string
    store: RunnerStore
    owner: ForegroundOwner
    relative: string
    path: string
  }) => void,
) {
  const root = mkdtempSync(join(tmpdir(), 'wholeloop-foreground-read-'))
  const store = new RunnerStore(join(root, 'state'))
  const lease = {
    request: 'a'.repeat(64),
    controller: `controller-${'b'.repeat(32)}`,
    generation: 1,
  }
  const owner = new ForegroundOwner(store, lease)
  const relative = `${owner.path}/cancel.json`
  store.files.atomic(
    `${owner.path}/invocation.json`,
    JSON.stringify({
      schema: 'wholeloop/delivery-foreground-invocation@1',
      lease,
      invocation: owner.invocation,
      store: store.files.root,
      nonce: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      parent: process.pid,
      core: { path: '/unused-component-fixture', sha256: 'c'.repeat(64) },
      deadline: '2026-11-06T01:00:00.000Z',
    }),
  )
  vi.spyOn(store, 'current').mockReturnValue(true)
  try {
    run({ root, store, owner, relative, path: store.files.path(relative) })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('bounded fresh foreground cancellation reads', () => {
  it('reads an ordinary cancellation only with its bounded descriptor', () =>
    fixture(({ store, owner, relative, path }) => {
      store.files.atomic(relative, JSON.stringify({ nonce: 'foreign' }))
      vi.mocked(readFileSync).mockClear()
      vi.mocked(openSync).mockClear()
      expect(owner.current()).toBe(true)
      expect(
        vi.mocked(readFileSync).mock.calls.filter(([selected]) => String(selected) === path),
      ).toHaveLength(0)
      expect(
        vi.mocked(openSync).mock.calls.filter(([selected]) => String(selected) === path),
      ).toHaveLength(1)
    }))
  it('refuses an oversized cancellation before parsing its body', () =>
    fixture(({ store, owner, relative }) => {
      store.files.atomic(relative, JSON.stringify({ nonce: 'foreign', padding: 'x'.repeat(65536) }))
      expect(owner.current()).toBe(false)
    }))
  it('refreshes absence, empty data, foreign nonces and current cancellation on each call', () =>
    fixture(({ store, owner, relative }) => {
      expect(owner.current()).toBe(true)
      store.files.atomic(relative, '')
      expect(owner.current()).toBe(true)
      store.files.atomic(relative, JSON.stringify({ nonce: 'foreign' }))
      expect(owner.current()).toBe(true)
      store.files.atomic(relative, '{')
      expect(owner.current()).toBe(false)
      store.files.atomic(relative, JSON.stringify({ nonce: owner.read()?.nonce }))
      expect(owner.current()).toBe(false)
    }))
  it.skipIf(process.platform === 'win32')(
    'refuses a FIFO without blocking the ready owned child',
    () =>
      fixture(({ root, store, path }) => {
        mkdirSync(dirname(path), { recursive: true })
        expect(spawnSync('mkfifo', [path]).status).toBe(0)
        const probe = join(root, 'reader.mjs')
        buildSync({
          entryPoints: [
            fileURLToPath(
              new URL('../../fixtures/runner/foreground-cancel-read.ts', import.meta.url),
            ),
          ],
          outfile: probe,
          bundle: true,
          platform: 'node',
          format: 'esm',
          target: 'node20',
          define: { __WL_HARNESS__: '{}', __WL_VERSION__: '"0.0.0"' },
          banner: {
            js: 'import{createRequire as __wlRequire}from"node:module";const require=__wlRequire(import.meta.url);',
          },
          logLevel: 'silent',
        })
        const result = spawnSync(process.execPath, [probe, store.files.root], {
          encoding: 'utf8',
          timeout: 500,
          killSignal: 'SIGKILL',
        })
        expect(result.stdout).toContain('reader-ready')
        expect(result.stdout).toContain('reader-refused')
        expect(result.status).toBe(0)
      }),
  )
})
