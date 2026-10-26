import { createHash } from 'node:crypto'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { operationWrapper } from '../../../src/fanout/operation-wrapper.js'
import { ManagedRunnerProcess } from '../../../src/runner/native-process.js'
import { StoreFiles } from '../../../src/state/files.js'

async function fixture(run: (manager: ManagedRunnerProcess, root: string) => Promise<void>) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-runner-process-'))),
    files = new StoreFiles(join(root, 'state'))
  try {
    await run(new ManagedRunnerProcess(files, 'a'.repeat(64)), root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}
describe('actual managed native process ownership', () => {
  it('keeps the existing Docker operation wrapper byte-identical', () => {
    expect(
      createHash('sha256')
        .update(operationWrapper('wholeloop/environment-operation-outcome@1'))
        .digest('hex'),
    ).toBe('aff209e74836ea58118da57a974cf65a5ebc492b8f9c462312ef3388d999c7c9')
  })
  it('observes exact native exit seven and refuses a repeated invocation', async () => {
    await fixture(async (manager, root) => {
      const result = await manager.invoke(process.execPath, ['-e', 'process.exit(7)'], '', {
        cwd: root,
        env: { PATH: process.env.PATH, HOME: root },
        timeoutMs: 3000,
        signal: new AbortController().signal,
        current: () => true,
      })
      expect(result.code).toBe(7)
      expect(result.ownership).toMatchObject({
        invocationState: 'stopped',
        reason: 'finished',
        code: 7,
      })
      await expect(
        manager.invoke(process.execPath, ['-e', 'process.exit(0)'], '', {
          cwd: root,
          env: {},
          timeoutMs: 1000,
          signal: new AbortController().signal,
          current: () => true,
        }),
      ).rejects.toThrow('native-invocation-already-issued')
    })
  })
  it('drains complete output and never promotes an unavailable registration', async () => {
    await fixture(async (manager, root) => {
      expect(manager.observe().invocationState).toBe('unknown')
      const result = await manager.invoke(
        process.execPath,
        ['-e', 'process.stdout.write("x".repeat(220000))'],
        '',
        {
          cwd: root,
          env: { PATH: process.env.PATH, HOME: root },
          timeoutMs: 3000,
          signal: new AbortController().signal,
          current: () => true,
        },
      )
      expect(result.stdout.length).toBe(220000)
      expect(result.ownership).toMatchObject({ invocationState: 'stopped', code: 0 })
      manager.files.atomic(
        `${manager.relative}/started.json`,
        JSON.stringify({ pid: 1, nonce: 'wrong', invocation: manager.invocation }),
      )
      expect(manager.observe().invocationState).toBe('unknown')
    })
  })
})
