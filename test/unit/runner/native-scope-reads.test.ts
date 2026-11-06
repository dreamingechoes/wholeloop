import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSync } from 'esbuild'
import { describe, expect, it, vi } from 'vitest'
import { RunnerNativeScope } from '../../../src/runner/native-scope.js'
import { StoreFiles } from '../../../src/state/files.js'

vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>()
  return { ...fs, readFileSync: vi.fn(fs.readFileSync), openSync: vi.fn(fs.openSync) }
})
function fixture(
  run: (input: {
    root: string
    files: StoreFiles
    scope: RunnerNativeScope
    relative: string
    path: string
  }) => void,
) {
  const root = mkdtempSync(join(tmpdir(), 'wholeloop-native-scope-read-')),
    files = new StoreFiles(join(root, 'state')),
    relative = `delivery/runner-native-scopes/${'a'.repeat(64)}.json`,
    path = files.path(relative),
    scope = new RunnerNativeScope(files, 'a'.repeat(64))
  try {
    run({ root, files, scope, relative, path })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('bounded native-scope manifest reads', () => {
  it.each([0, 100, 400])(
    'reads a %i-call manifest once through its existing bounded descriptor',
    (size) =>
      fixture(({ files, scope, relative, path }) => {
        const calls = Array.from({ length: size }, (_, index) => ({
          invocation: index.toString(16).padStart(64, '0'),
          index,
          status: 'closed',
          command: 'codex',
        }))
        files.atomic(relative, JSON.stringify({ stage: 'a'.repeat(64), calls }))
        vi.mocked(readFileSync).mockClear()
        vi.mocked(openSync).mockClear()
        const actual = scope.calls(),
          unbounded = vi
            .mocked(readFileSync)
            .mock.calls.filter(([selected]) => String(selected) === path).length,
          bounded = vi
            .mocked(openSync)
            .mock.calls.filter(([selected]) => String(selected) === path).length
        expect(actual).toEqual(calls)
        console.info(
          'Native manifest body readers:',
          JSON.stringify({ calls: size, unbounded, bounded }),
        )
        expect(unbounded).toBe(0)
        expect(bounded).toBe(1)
      }),
  )
  it('rejects an oversized manifest before any unbounded body read', () =>
    fixture(({ files, scope, relative, path }) => {
      files.atomic(relative, 'x'.repeat(1024 * 1024 + 1))
      vi.mocked(readFileSync).mockClear()
      expect(() => scope.calls()).toThrow('oversized')
      expect(
        vi.mocked(readFileSync).mock.calls.filter(([selected]) => String(selected) === path),
      ).toHaveLength(0)
    }))
  it('keeps missing/empty scopes empty and rejects present corrupt scope data', () =>
    fixture(({ files, scope, relative }) => {
      expect(scope.calls()).toEqual([])
      files.atomic(relative, '')
      expect(scope.calls()).toEqual([])
      files.atomic(relative, '{')
      expect(() => scope.calls()).toThrow()
      files.atomic(relative, JSON.stringify({ stage: 'b'.repeat(64), calls: [] }))
      expect(() => scope.calls()).toThrow('damaged-native-owner-scope')
    }))
  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'does not interpret denied metadata as an absent scope',
    () =>
      fixture(({ files, scope, relative, path }) => {
        files.atomic(relative, JSON.stringify({ stage: 'a'.repeat(64), calls: [] }))
        chmodSync(dirname(path), 0o000)
        try {
          expect(() => scope.calls()).toThrow()
        } finally {
          chmodSync(dirname(path), 0o700)
        }
      }),
  )
  it.skipIf(process.platform === 'win32')(
    'refuses a FIFO without blocking the owned reader child',
    () =>
      fixture(({ root, files, path }) => {
        mkdirSync(dirname(path), { recursive: true })
        expect(spawnSync('mkfifo', [path]).status).toBe(0)
        const probe = join(root, 'reader.mjs')
        buildSync({
          entryPoints: [
            fileURLToPath(new URL('../../fixtures/runner/native-scope-read.ts', import.meta.url)),
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
        const result = spawnSync(process.execPath, [probe, files.root], {
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
