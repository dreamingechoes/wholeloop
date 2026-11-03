import { chmodSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { workerProcess } from '../../../src/fanout/process.js'
import { RunnerNativeScope } from '../../../src/runner/native-scope.js'
import { StoreFiles } from '../../../src/state/files.js'

describe('owned sandbox-exec launches (ADR-0203)', () => {
  // Found by the first live EVAL-10 attempt: the stage scope managed only bare
  // client names, so a contained Claude launch came back with unknown
  // ownership and its observer correctly refused every launch.
  it('manages a sandbox-exec process group like a bare client and leaves other tools unmanaged', async () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-scope-sandbox-'))),
      bin = join(dir, 'bin'),
      files = new StoreFiles(join(dir, 'state')),
      scope = new RunnerNativeScope(files, 'a'.repeat(64))
    mkdirSync(bin)
    for (const name of ['sandbox-exec', 'other-tool']) {
      writeFileSync(join(bin, name), `#!${process.execPath}\nconsole.log('ran')\n`)
      chmodSync(join(bin, name), 0o700)
    }
    const call = (name: string) =>
      scope.run(
        () => true,
        () =>
          workerProcess(join(bin, name), [], {
            cwd: dir,
            input: '',
            timeoutMs: 10000,
            signal: new AbortController().signal,
            env: { PATH: '/usr/bin:/bin' },
          }),
      ) as Promise<{ status: string; ownership?: { invocationState: string } }>
    const contained = await call('sandbox-exec'),
      other = await call('other-tool')
    expect(contained).toMatchObject({
      status: 'succeeded',
      ownership: { invocationState: 'stopped' },
    })
    expect(other.ownership).toBeUndefined()
    expect(scope.calls()).toEqual([
      expect.objectContaining({ command: 'sandbox-exec', status: 'closed', index: 0 }),
    ])
  })
})
