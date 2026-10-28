import { createHash } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
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
  it('observes a group with one fresh process query and preserves unavailable registration or table', async () => {
    await fixture(async (first, root) => {
      const second = new ManagedRunnerProcess(first.files, 'b'.repeat(64)),
        missing = new ManagedRunnerProcess(first.files, 'c'.repeat(64)),
        originalPath = process.env.PATH,
        ps = originalPath
          ?.split(delimiter)
          .map((directory) => join(directory, 'ps'))
          .find(existsSync)
      if (!ps) throw new Error('Actual process observer required')
      for (const manager of [first, second])
        await manager.invoke(process.execPath, ['-e', 'process.exit(7)'], '', {
          cwd: root,
          env: { PATH: originalPath },
          timeoutMs: 3000,
          signal: new AbortController().signal,
          current: () => true,
        })
      const bin = join(root, 'observer-bin'),
        log = join(root, 'queries'),
        fail = join(root, 'unavailable')
      mkdirSync(bin)
      writeFileSync(
        join(bin, 'ps'),
        `#!${process.execPath}\nconst fs=require('node:fs'),cp=require('node:child_process');fs.appendFileSync(${JSON.stringify(log)},'query\\n');if(fs.existsSync(${JSON.stringify(fail)}))process.exit(1);process.stdout.write(cp.execFileSync(${JSON.stringify(ps)},process.argv.slice(2)));\n`,
      )
      chmodSync(join(bin, 'ps'), 0o700)
      process.env.PATH = `${bin}${delimiter}${originalPath ?? ''}`
      try {
        const invocations = [first.invocation, second.invocation, missing.invocation],
          observed = ManagedRunnerProcess.observeAll(first.files, invocations)
        expect(observed.map((value) => value.invocationState)).toEqual([
          'stopped',
          'stopped',
          'unknown',
        ])
        expect(observed.slice(0, 2).map((value) => value.code)).toEqual([7, 7])
        expect(readFileSync(log, 'utf8')).toBe('query\n')
        writeFileSync(fail, '')
        expect(
          ManagedRunnerProcess.observeAll(first.files, invocations).every(
            (value) => value.invocationState === 'unknown',
          ),
        ).toBe(true)
        expect(readFileSync(log, 'utf8')).toBe('query\nquery\n')
        rmSync(fail)
        expect(ManagedRunnerProcess.observeAll(first.files, invocations)).toEqual(observed)
        expect(readFileSync(log, 'utf8')).toBe('query\nquery\nquery\n')
      } finally {
        if (originalPath === undefined) delete process.env.PATH
        else process.env.PATH = originalPath
      }
    })
  })
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
