import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RUNNER_NATIVE_WRAPPER } from '../../../src/runner/native-process.js'

async function fixture(run: (root: string) => Promise<void>) {
  const root = mkdtempSync(join(tmpdir(), 'wholeloop-native-cancellation-read-'))
  try {
    await run(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}
async function wrapper(root: string, mode: 'finish' | 'cancel' | 'fifo-timeout' = 'finish') {
  const cancel = join(root, 'cancel.json')
  const outcome = join(root, 'outcome.json')
  const counters = join(root, 'read-counters.json')
  const program = `
import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';
const rawRead=fs.readFileSync;let unbounded=0;
fs.readFileSync=function(path,...args){if(path===${JSON.stringify(cancel)})unbounded++;return rawRead.call(this,path,...args)};
syncBuiltinESMExports();
process.on('exit',()=>fs.writeFileSync(${JSON.stringify(counters)},JSON.stringify({unbounded})));
${RUNNER_NATIVE_WRAPPER.replace('request = JSON.parse(text)', "request = JSON.parse(text);process.stdout.write('wrapper-ready\\n')")}
`
  const child = spawn(process.execPath, ['--input-type=module', '-e', program], {
    cwd: root,
    detached: process.platform !== 'win32',
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let stdout = '',
    stderr = ''
  let changed = false
  child.stdout.setEncoding('utf8').on('data', (chunk) => {
    stdout += chunk
    if (!changed && stdout.includes('child-ready')) {
      changed = true
      if (mode === 'cancel') writeFileSync(cancel, JSON.stringify({ nonce: 'original-nonce' }))
      else if (mode === 'fifo-timeout') {
        expect(spawnSync('mkfifo', [cancel]).status).toBe(0)
      }
    }
  })
  child.stderr.setEncoding('utf8').on('data', (chunk) => {
    stderr += chunk
  })
  const closed = new Promise<{
    status: number | null
    signal: NodeJS.Signals | null
    stdout: string
    stderr: string
  }>((resolve, reject) => {
    const watchdog = setTimeout(() => {
      // Only this newly spawned fixture group is ours; no recovered PID is signalled.
      if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL')
      else child.kill('SIGKILL')
    }, 1500)
    child.once('error', (error) => {
      clearTimeout(watchdog)
      reject(error)
    })
    child.once('close', (status, signal) => {
      clearTimeout(watchdog)
      resolve({ status, signal, stdout, stderr })
    })
  })
  child.stdin.end(
    JSON.stringify({
      operation: 'a'.repeat(64),
      nonce: 'original-nonce',
      cancel,
      outcome,
      command: process.execPath,
      args: [
        '-e',
        mode === 'finish'
          ? "process.stdout.write('child-finished\\n')"
          : "process.stdout.write('child-ready\\n');setInterval(()=>{},1000)",
      ],
      input: '',
      timeoutMs: 500,
      deadline: new Date(Date.now() + 2000).toISOString(),
    }),
  )
  const result = await closed
  return { result, counters, outcome }
}

describe('actual native wrapper cancellation reader', () => {
  it('observes a fresh matching nonce after launch and cancels its live original child', () =>
    fixture(async (root) => {
      writeFileSync(join(root, 'cancel.json'), JSON.stringify({ nonce: 'foreign' }))
      const { result, outcome } = await wrapper(root, 'cancel')
      expect(result.stdout).toContain('child-ready')
      // The wrapper's existing delayed group kill also closes the original wrapper.
      expect(result.signal).toBe('SIGKILL')
      expect(JSON.parse(readFileSync(outcome, 'utf8')).reason).toBe('cancelled')
    }))
  it.skipIf(process.platform === 'win32')(
    'retains its timeout after a FIFO appears during live polling',
    () =>
      fixture(async (root) => {
        const { result, outcome } = await wrapper(root, 'fifo-timeout')
        expect(result.stdout).toContain('child-ready')
        expect(result.signal).toBe('SIGKILL')
        expect(JSON.parse(readFileSync(outcome, 'utf8')).reason).toBe('timeout')
      }),
  )
  it('uses no unbounded reads for a foreign nonce and preserves ordinary completion', () =>
    fixture(async (root) => {
      writeFileSync(join(root, 'cancel.json'), JSON.stringify({ nonce: 'foreign' }))
      const { result, counters, outcome } = await wrapper(root)
      expect(result.stdout).toContain('wrapper-ready')
      expect(result.stdout).toContain('child-finished')
      expect(result.status).toBe(0)
      expect(JSON.parse(readFileSync(outcome, 'utf8')).reason).toBe('finished')
      expect(JSON.parse(readFileSync(counters, 'utf8')).unbounded).toBe(0)
    }))
  it('retains a matching pre-launch cancellation without starting the client', () =>
    fixture(async (root) => {
      writeFileSync(join(root, 'cancel.json'), JSON.stringify({ nonce: 'original-nonce' }))
      const { result, outcome } = await wrapper(root)
      expect(result.stdout).toContain('wrapper-ready')
      expect(result.stdout).not.toContain('child-finished')
      expect(result.status).toBe(2)
      expect(JSON.parse(readFileSync(outcome, 'utf8')).reason).toBe('not-started')
    }))
  it.skipIf(process.platform === 'win32')(
    'does not let a FIFO disable the wrapper deadline and cancellation loop',
    () =>
      fixture(async (root) => {
        expect(spawnSync('mkfifo', [join(root, 'cancel.json')]).status).toBe(0)
        const { result, outcome } = await wrapper(root)
        expect(result.stdout).toContain('wrapper-ready')
        expect(result.stdout).toContain('child-finished')
        expect(result.status).toBe(0)
        expect(JSON.parse(readFileSync(outcome, 'utf8')).reason).toBe('finished')
      }),
  )
})
