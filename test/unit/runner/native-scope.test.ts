import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { workerProcess } from '../../../src/fanout/process.js'
import { RunnerNativeScope } from '../../../src/runner/native-scope.js'
import { StoreFiles } from '../../../src/state/files.js'

async function fixture(run: (scope: RunnerNativeScope, root: string) => Promise<void>) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-native-scope-'))),
    scope = new RunnerNativeScope(new StoreFiles(join(root, 'state')), 'a'.repeat(64), [
      basename(process.execPath),
    ])
  try {
    await run(scope, root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}
const options = (root: string) => ({
  cwd: root,
  env: { PATH: process.env.PATH, HOME: root },
  input: '',
  timeoutMs: 3000,
  signal: new AbortController().signal,
})
describe('scoped durable ownership for existing native worker callers', () => {
  it('tracks independent parallel workers without changing their command or codec', async () => {
    await fixture(async (scope, root) => {
      const results = await scope.run(
        () => true,
        () =>
          Promise.all([
            workerProcess(process.execPath, ['-e', 'process.stdout.write("first")'], options(root)),
            workerProcess(
              process.execPath,
              ['-e', 'process.stdout.write("second")'],
              options(root),
            ),
          ]),
      )
      expect(results.map((r) => r.stdout)).toEqual(['first', 'second'])
      expect(scope.calls()).toHaveLength(2)
      expect(new Set(scope.calls().map((c) => c.invocation)).size).toBe(2)
      expect(
        scope
          .inspect()
          .every((c) => c.status === 'closed' && c.observed.invocationState === 'stopped'),
      ).toBe(true)
    })
  })
  it('fences a delayed native launch after its original stage scope has closed', async () => {
    await fixture(async (scope, root) => {
      let release = () => {}
      const barrier = new Promise<void>((resolve) => {
        release = resolve
      })
      let late: Promise<unknown> | undefined
      await scope.run(
        () => true,
        async () => {
          late = barrier.then(() =>
            workerProcess(
              process.execPath,
              ['-e', 'process.stdout.write("must not execute")'],
              options(root),
            ),
          )
        },
      )
      const refused = expect(late).rejects.toThrow('native-owner-scope-closed')
      release()
      await refused
      expect(scope.calls()).toEqual([])
    })
  })
  it('preserves the ordinary unmanaged worker behavior outside an explicit controller scope', async () => {
    await fixture(async (scope, root) => {
      const result = await workerProcess(
        process.execPath,
        ['-e', 'process.stdout.write("ordinary")'],
        options(root),
      )
      expect(result.status).toBe('succeeded')
      expect(result.stdout).toBe('ordinary')
      expect(scope.calls()).toEqual([])
    })
  })
})
