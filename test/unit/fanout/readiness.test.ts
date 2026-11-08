import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { workerProcess } from '../../../src/fanout/process.js'

async function fixture(operation: (root: string) => Promise<void>) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-worker-readiness-')))
  try {
    await operation(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('worker output bound', () => {
  it('stops at the default 1 MiB and accepts a larger explicit bound', async () => {
    await fixture(async (root) => {
      const run = (maxBytes?: number) =>
        workerProcess(
          process.execPath,
          ['-e', 'process.stdout.write("x".repeat(2 * 1024 * 1024))'],
          {
            cwd: root,
            input: '',
            timeoutMs: 5000,
            signal: new AbortController().signal,
            env: process.env,
            ...(maxBytes ? { maxBytes } : {}),
          },
        )
      expect((await run()).status).toBe('overflow')
      expect((await run(4 * 1024 * 1024)).status).toBe('succeeded')
    })
  })
})

describe('worker working directory', () => {
  it('replaces an inherited PWD with the directory the worker runs in', async () => {
    await fixture(async (root) => {
      const result = await workerProcess(
        process.execPath,
        ['-e', 'process.stdout.write(process.env.PWD ?? "")'],
        {
          cwd: root,
          input: '',
          timeoutMs: 3000,
          signal: new AbortController().signal,
          env: { ...process.env, PWD: '/somewhere/else' },
        },
      )
      expect(result.stdout).toBe(root)
    })
  })
})

describe('bounded native initialization before assignment input', () => {
  it('withholds input until a split UTF-8 header is accepted and sends it only once', async () => {
    await fixture(async (root) => {
      const received = join(root, 'received'),
        header = `${JSON.stringify({ ready: 'read', name: 'répertoire' })}\r\n`
      const script = `const fs=require('node:fs');let ready=false,raw='';process.stdin.on('data',chunk=>{if(!ready)process.exit(8);raw+=chunk});process.stdin.on('end',()=>{fs.writeFileSync(${JSON.stringify(received)},raw);console.log('done')});const header=Buffer.from(${JSON.stringify(header)}),split=header.indexOf(0xc3)+1;setTimeout(()=>process.stdout.write(header.subarray(0,split)),10);setTimeout(()=>{ready=true;process.stdout.write(header.subarray(split))},40)`
      let calls = 0
      const result = await workerProcess(process.execPath, ['-e', script], {
        cwd: root,
        input: 'fixture assignment',
        timeoutMs: 3000,
        signal: new AbortController().signal,
        env: process.env,
        readyLine: (line) => {
          calls++
          return JSON.parse(line).name === 'répertoire'
        },
      })
      expect(result.status).toBe('succeeded')
      expect(readFileSync(received, 'utf8')).toBe('fixture assignment')
      expect(calls).toBe(1)
      expect(result.stdout).toContain('done')
    })
  })
  it.each(['refused', 'throw', 'missing', 'oversized', 'timeout', 'cancelled'] as const)(
    'delivers no assignment after %s initialization',
    async (kind) => {
      await fixture(async (root) => {
        const received = join(root, 'must-not-receive'),
          controller = new AbortController()
        const output =
          kind === 'missing'
            ? 'process.exit(0)'
            : kind === 'timeout'
              ? 'setInterval(()=>{},1000)'
              : kind === 'oversized'
                ? "process.stdout.write('x'.repeat(65537));setInterval(()=>{},1000)"
                : 'console.log(\'{"ready":true}\');setInterval(()=>{},1000)'
        const script = `require('node:fs');process.stdin.on('data',()=>require('node:fs').writeFileSync(${JSON.stringify(received)},'unexpected'));${output}`
        const result = await workerProcess(process.execPath, ['-e', script], {
          cwd: root,
          input: 'fixture assignment',
          timeoutMs: kind === 'timeout' ? 100 : 3000,
          signal: controller.signal,
          env: process.env,
          readyLine: () => {
            if (kind === 'throw') throw new Error('fixture refusal')
            if (kind === 'cancelled') {
              controller.abort()
              return true
            }
            return false
          },
        })
        expect(result.status).toBe(
          kind === 'oversized'
            ? 'overflow'
            : kind === 'timeout'
              ? 'timeout'
              : kind === 'cancelled'
                ? 'cancelled'
                : 'crashed',
        )
        expect(result.stdout).toBe('')
        expect(existsSync(received)).toBe(false)
      })
    },
  )
  it('preserves immediate input for recipes without initialization gating', async () => {
    await fixture(async (root) => {
      const result = await workerProcess(
        process.execPath,
        [
          '-e',
          "let raw='';process.stdin.on('data',c=>raw+=c);process.stdin.on('end',()=>process.stdout.write(raw))",
        ],
        {
          cwd: root,
          input: 'fixture direct input',
          timeoutMs: 3000,
          signal: new AbortController().signal,
          env: process.env,
        },
      )
      expect(result).toMatchObject({
        status: 'succeeded',
        stdout: 'fixture direct input',
        code: 0,
        signal: null,
      })
    })
  })
})
