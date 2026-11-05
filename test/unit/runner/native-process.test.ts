import { spawnSync } from 'node:child_process'
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
import { delimiter, join, resolve } from 'node:path'
import { buildSync } from 'esbuild'
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
  it('retains witnessed original closure across numeric group reuse without restoring it from disk', async () => {
    await fixture(async (manager, root) => {
      const result = await manager.invoke(process.execPath, ['-e', 'process.exit(7)'], '', {
          cwd: root,
          env: { PATH: process.env.PATH },
          timeoutMs: 3000,
          signal: new AbortController().signal,
          current: () => true,
        }),
        original = structuredClone(result.ownership),
        names = ['intent', 'started', 'outcome'] as const,
        retained = new Map(
          names.map((name) => [
            name,
            readFileSync(manager.files.path(`${manager.relative}/${name}.json`)),
          ]),
        ),
        started = JSON.parse(retained.get('started')?.toString() ?? ''),
        foreign = new ManagedRunnerProcess(
          new StoreFiles(join(root, 'foreign')),
          manager.invocation,
        ),
        bin = join(root, 'observer-bin'),
        table = join(root, 'process-table'),
        unavailable = join(root, 'unavailable'),
        originalPath = process.env.PATH
      expect(original).toMatchObject({ invocationState: 'stopped', code: 7 })
      for (const name of names)
        foreign.files.atomic(`${foreign.relative}/${name}.json`, retained.get(name) ?? '')
      // A copied/private certificate cannot reconstruct an in-process observation.
      foreign.files.atomic(`${foreign.relative}/closed.json`, JSON.stringify(original))
      mkdirSync(bin)
      writeFileSync(
        join(bin, 'ps'),
        `#!${process.execPath}\nconst fs=require('node:fs');if(fs.existsSync(${JSON.stringify(unavailable)}))process.exit(1);process.stdout.write(fs.readFileSync(${JSON.stringify(table)}));\n`,
      )
      chmodSync(join(bin, 'ps'), 0o700)
      writeFileSync(table, `${started.pid} ${started.pid}\n`)
      process.env.PATH = `${bin}${delimiter}${originalPath ?? ''}`
      try {
        result.ownership.evidence = 'f'.repeat(64)
        expect(new ManagedRunnerProcess(manager.files, manager.invocation).observe()).toEqual(
          original,
        )
        expect(foreign.observe().invocationState).toBe('unknown')
        const foreignOutcome = foreign.files.path(`${foreign.relative}/outcome.json`)
        rmSync(foreignOutcome)
        writeFileSync(table, '')
        expect(foreign.observe().reason).toBe(
          'original-native-group-absent-without-semantic-result',
        )
        foreign.files.atomic(`${foreign.relative}/outcome.json`, retained.get('outcome') ?? '')
        writeFileSync(table, `${started.pid} ${started.pid}\n`)
        expect(foreign.observe().invocationState).toBe('unknown')
        for (const name of names) {
          const bytes = retained.get(name)
          if (!bytes) throw new Error('Original process bytes required')
          manager.files.atomic(`${manager.relative}/${name}.json`, `${bytes.toString()} `)
          expect(manager.observe().invocationState).toBe('unknown')
          manager.files.atomic(`${manager.relative}/${name}.json`, bytes)
        }
        const cold = join(root, 'cold-read.mjs')
        manager.files.atomic(`${manager.relative}/closed.json`, JSON.stringify(original))
        buildSync({
          stdin: {
            contents: `import {ManagedRunnerProcess} from ${JSON.stringify(resolve('src/runner/native-process.ts'))};import {StoreFiles} from ${JSON.stringify(resolve('src/state/files.ts'))};console.log(JSON.stringify(new ManagedRunnerProcess(new StoreFiles(${JSON.stringify(manager.files.root)}),${JSON.stringify(manager.invocation)}).observe()));`,
            resolveDir: process.cwd(),
            loader: 'ts',
          },
          outfile: cold,
          bundle: true,
          platform: 'node',
          format: 'esm',
          banner: {
            js: "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);",
          },
          define: { __WL_VERSION__: '"0.0.0"', __WL_HARNESS__: '{}' },
        })
        const readback = spawnSync(process.execPath, [cold], {
          encoding: 'utf8',
          env: { PATH: process.env.PATH },
          timeout: 5000,
        })
        expect(readback.status).toBe(0)
        expect(JSON.parse(readback.stdout).invocationState).toBe('unknown')
        const outcome = retained.get('outcome')
        if (!outcome) throw new Error('Original outcome required')
        manager.files.atomic(
          `${manager.relative}/outcome.json`,
          JSON.stringify({ ...JSON.parse(outcome.toString()), code: 0 }),
        )
        expect(manager.observe().invocationState).toBe('unknown')
        manager.files.atomic(`${manager.relative}/outcome.json`, outcome)
        writeFileSync(unavailable, '')
        expect(manager.observe().invocationState).toBe('unknown')
        rmSync(unavailable)
        expect(manager.observe()).toEqual(original)
      } finally {
        if (originalPath === undefined) delete process.env.PATH
        else process.env.PATH = originalPath
      }
    })
  })
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
