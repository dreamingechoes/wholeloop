import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'
import { describe, expect, it } from 'vitest'
import { ManagedRunnerProcess } from '../../../src/runner/native-process.js'
import { StoreFiles } from '../../../src/state/files.js'

async function until(observed: () => boolean, maximumMs = 8000) {
  const deadline = Date.now() + maximumMs
  while (!observed()) {
    if (Date.now() >= deadline)
      throw new Error('The exact owned process observation did not arrive.')
    await new Promise((resolve) => setTimeout(resolve, 30))
  }
}
async function fixture(
  run: (input: {
    root: string
    controller: string
    manager: ManagedRunnerProcess
    started: string
    done: string
  }) => Promise<void>,
  long = false,
) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-runner-recovery-'))),
    invocation = 'b'.repeat(64),
    manager = new ManagedRunnerProcess(new StoreFiles(join(root, 'state')), invocation),
    app = join(root, 'app.cjs'),
    started = join(root, 'started'),
    done = join(root, 'done')
  writeFileSync(
    app,
    `const fs=require('node:fs');fs.writeFileSync(process.argv[2],'started');setTimeout(()=>{process.stdout.write('x'.repeat(220000));process.stderr.write('observed original stderr');setTimeout(()=>fs.writeFileSync(process.argv[3],'done'),50)},${long ? 5000 : 700})`,
  )
  const controller = join(root, 'controller.mjs')
  await build({
    stdin: {
      contents: `import {ManagedRunnerProcess} from ${JSON.stringify(resolve('src/runner/native-process.ts'))};import {StoreFiles} from ${JSON.stringify(resolve('src/state/files.ts'))};await new ManagedRunnerProcess(new StoreFiles(${JSON.stringify(join(root, 'state'))}),${JSON.stringify(invocation)}).invoke(process.execPath,[${JSON.stringify(app)},${JSON.stringify(started)},${JSON.stringify(done)}],'',{cwd:${JSON.stringify(root)},env:{PATH:process.env.PATH,HOME:${JSON.stringify(root)}},timeoutMs:7000,signal:new AbortController().signal,current:()=>true})`,
      resolveDir: process.cwd(),
    },
    outfile: controller,
    bundle: true,
    platform: 'node',
    format: 'esm',
    banner: {
      js: "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);",
    },
  })
  try {
    await run({ root, controller, manager, started, done })
  } finally {
    if (manager.observe().invocationState === 'unknown') {
      manager.requestCancellation()
      await until(() => manager.observe().invocationState !== 'unknown')
    }
    rmSync(root, { recursive: true, force: true })
  }
}
describe('fresh controller observation after actual parent loss', () => {
  it('preserves a completed client and drains broken pipes after its controller is killed', async () => {
    await fixture(async ({ root, controller, manager, started, done }) => {
      const parent = spawn(process.execPath, [controller], {
        cwd: root,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      await until(() => existsSync(started))
      expect(parent.kill('SIGKILL')).toBe(true)
      await new Promise((resolve) => parent.once('close', resolve))
      await until(() => manager.observe().invocationState === 'stopped')
      expect(readFileSync(done, 'utf8')).toBe('done')
      expect(manager.observe()).toMatchObject({
        invocationState: 'stopped',
        reason: 'finished',
        code: 0,
      })
      // No semantic output survived the dead controller; the receipt establishes process closure only.
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
  it('cancels only the original live wrapper through its private nonce after parent loss', async () => {
    await fixture(async ({ root, controller, manager, started, done }) => {
      const unrelated = spawn(process.execPath, ['-e', 'setTimeout(()=>{},10000)'], {
        cwd: root,
        stdio: 'ignore',
      })
      try {
        const parent = spawn(process.execPath, [controller], {
          cwd: root,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        await until(() => existsSync(started))
        expect(parent.kill('SIGKILL')).toBe(true)
        await new Promise((resolve) => parent.once('close', resolve))
        manager.requestCancellation()
        await until(() => manager.observe().invocationState === 'stopped')
        expect(manager.observe().reason).toBe('cancelled')
        expect(existsSync(done)).toBe(false)
        expect(unrelated.exitCode).toBeNull()
        expect(unrelated.killed).toBe(false)
      } finally {
        unrelated.kill('SIGTERM')
        await new Promise((resolve) => unrelated.once('close', resolve))
      }
    }, true)
  })
})
