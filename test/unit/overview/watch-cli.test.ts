import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { EventEmitter, once } from 'node:events'
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import type { WatchFrame } from '../../../src/overview/watch.js'

const cli = resolve('dist/wl.mjs'),
  guard = resolve('test/fixtures/overview/read-only-guard.mjs')
async function fixture(
  run: (context: {
    root: string
    store: string
    env: NodeJS.ProcessEnv
    create: () => void
    overview: () => { digest: string; cursor: string }
  }) => Promise<void>,
) {
  const root = mkdtempSync(join(tmpdir(), 'wholeloop-watch-cli-')),
    store = join(root, 'state/wholeloop'),
    env = {
      ...process.env,
      XDG_STATE_HOME: join(root, 'state'),
      XDG_CONFIG_HOME: join(root, 'config'),
      WL_WORKSPACE: '',
      WHOLELOOP_TEST_STORE: store,
    },
    invoke = (args: string[]) =>
      execFileSync(process.execPath, [cli, ...args, '--json'], { env, cwd: root, encoding: 'utf8' })
  try {
    await run({
      root,
      store,
      env,
      create: () => {
        invoke([
          'state',
          'create',
          'initiative',
          '--title',
          'PRIVATE_CLI_FEED',
          '--owner',
          'PRIVATE_CLI_OWNER',
        ])
      },
      overview: () => JSON.parse(invoke(['overview'])),
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}
function start(root: string, env: NodeJS.ProcessEnv, args: string[], capture = true) {
  const child = spawn(process.execPath, ['--import', guard, cli, 'watch', ...args, '--json'], {
      env,
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
    stdout = child.stdout,
    stderr = child.stderr,
    frames: WatchFrame[] = [],
    events = new EventEmitter(),
    exited = once(child, 'close')
  let buffered = '',
    errors = ''
  stdout.setEncoding('utf8')
  stderr.setEncoding('utf8')
  if (capture)
    stdout.on('data', (chunk) => {
      buffered += chunk
      let index = buffered.indexOf('\n')
      while (index >= 0) {
        const line = buffered.slice(0, index)
        buffered = buffered.slice(index + 1)
        if (line) {
          const frame = JSON.parse(line) as WatchFrame
          frames.push(frame)
          events.emit('frame', frame)
        }
        index = buffered.indexOf('\n')
      }
    })
  stderr.on('data', (chunk) => {
    errors += chunk
    events.emit('diagnostic')
  })
  function wait(predicate: (frame: WatchFrame) => boolean) {
    const prior = frames.find(predicate)
    if (prior) return Promise.resolve(prior)
    return new Promise<WatchFrame>((resolve, reject) => {
      const timeout = setTimeout(() => {
          cleanup()
          reject(
            new Error(
              `Frame deadline; ${errors}; frames=${JSON.stringify(frames.map((frame) => ({ kind: frame.kind, ...(frame.kind === 'problem' ? { problem: frame.problem } : frame.kind === 'overview' ? { change: frame.change, health: frame.overview.health.status } : {}) })))}`,
            ),
          )
        }, 5000),
        listener = (frame: WatchFrame) => {
          if (predicate(frame)) {
            cleanup()
            resolve(frame)
          }
        },
        cleanup = () => {
          clearTimeout(timeout)
          events.removeListener('frame', listener)
        }
      events.on('frame', listener)
    })
  }
  async function finish(verify = true) {
    const timeout = setTimeout(() => child.kill('SIGKILL'), 3000)
    try {
      const [code, signal] = await exited
      if (verify) {
        expect(signal, errors).toBeNull()
        expect(code, errors).toBe(0)
        expect(errors).toContain('READ GUARD PASS (0 writes, 0 listeners)')
      }
    } finally {
      clearTimeout(timeout)
      stdout.destroy()
      stderr.destroy()
    }
  }
  async function diagnostic(label: string) {
    if (errors.includes(label)) return
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
          cleanup()
          reject(new Error(`Missing ${label}; ${errors}`))
        }, 5000),
        listener = () => {
          if (errors.includes(label)) {
            cleanup()
            resolve()
          }
        },
        cleanup = () => {
          clearTimeout(timeout)
          events.removeListener('diagnostic', listener)
        }
      events.on('diagnostic', listener)
    })
  }
  return {
    frames,
    diagnostics: () => errors,
    stdout,
    async stop(verify = true) {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
      await finish(verify)
    },
    finish,
    drain: () => diagnostic('DRAIN WAIT'),
    hint: () => diagnostic('FS HINT'),
    wait,
  }
}
it('kills and resumes the public guarded feed without repeating or missing activity', async () =>
  fixture(async ({ root, env, create, overview }) => {
    create()
    let active: ReturnType<typeof start> | undefined
    try {
      active = start(root, { ...env, WHOLELOOP_TEST_FS_WAKE: '1' }, ['--poll'])
      await active.wait((frame) => frame.kind === 'overview' && frame.change === 'initial')
      create()
      const activity = await active.wait((frame) => frame.kind === 'events'),
        checkpoint = activity.resumeCursor
      if (activity.kind !== 'events' || !checkpoint)
        throw new Error('Delivered activity checkpoint required')
      expect(activity.events).toHaveLength(1)
      await active.stop()
      expect(active.diagnostics()).not.toContain('FS WATCH')
      active = undefined
      create()
      active = start(root, { ...env, WHOLELOOP_TEST_FS_WAKE: '1' }, ['--since', checkpoint])
      const initial = await active.wait(
        (frame) => frame.kind === 'overview' && frame.change === 'initial',
      )
      expect(initial.resumeCursor).toBe(checkpoint)
      if (initial.kind !== 'overview') throw new Error('Initial overview required')
      expect(initial.overview.cursor).not.toBe(checkpoint)
      const resumed = await active.wait((frame) => frame.kind === 'events')
      if (resumed.kind !== 'events') throw new Error('Resumed activity required')
      expect(resumed.events).toHaveLength(1)
      expect(resumed.events[0]?.id).not.toBe(activity.events[0]?.id)
      const final = await active.wait(
          (frame) => frame.kind === 'overview' && frame.change === 'journal',
        ),
        current = overview()
      if (final.kind !== 'overview') throw new Error('Current overview required')
      expect(final.overview.digest).toBe(current.digest)
      expect(final.overview.cursor).toBe(current.cursor)
      create()
      const next = await active.wait(
        (frame) => frame.kind === 'events' && frame.fromCursor === current.cursor,
      )
      if (next.kind !== 'events') throw new Error('Filesystem-triggered activity required')
      expect(next.events).toHaveLength(1)
      await active.hint()

      expect(JSON.stringify(active.frames)).not.toContain('PRIVATE_CLI_')
      expect(active.frames.every((frame) => frame.schema === 'wholeloop/watch-frame@1')).toBe(true)
      await active.stop()
      active = undefined
    } finally {
      await active?.stop(false)
    }
  }))
it.each(['interrupt', 'closed-consumer'])(
  'terminates a blocked output on %s after reader cleanup',
  async (mode) =>
    fixture(async ({ root, store, env }) => {
      mkdirSync(join(store, 'journal'), { recursive: true })
      // A small write may drain before the reader closes. Keep this frame above
      // one MiB so the regression exercises pending output rather than idle liveness.
      const ts = new Date().toISOString(),
        events = Array.from({ length: 256 }, (_, index) => {
          const subject = `review-${index.toString(16).padStart(8, '0')}`,
            actor = {
              kind: 'agent',
              name: `fixture-${index}`,
              client: {
                client: 'codex',
                version: 'v'.repeat(128),
                model: 'm'.repeat(256),
                source: 'declared',
              },
            },
            common = { v: 1, ts, actor, subject }
          return [
            {
              ...common,
              id: `ev-00000000-0000-4000-8000-${(index * 2).toString(16).padStart(12, '0')}`,
              type: 'item.created',
              data: { kind: 'review', title: 'Fixture', owner: 'Owner', body: '' },
            },
            {
              ...common,
              id: `ev-00000000-0000-4000-8000-${(index * 2 + 1).toString(16).padStart(12, '0')}`,
              type: 'step.skipped',
              data: {
                step: 'review-code',
                run: `run-${index.toString(16).padStart(16, '0')}`,
                reason: 'Exercise pending fixture decisions.',
              },
            },
          ]
        }).flat()
      writeFileSync(
        join(store, 'journal', `${ts.slice(0, 7)}.ndjson`),
        `${events.map((event) => JSON.stringify(event)).join('\n')}\n`,
      )
      mkdirSync(join(root, 'config/wholeloop'), { recursive: true })
      writeFileSync(
        join(root, 'config/wholeloop/config.yml'),
        JSON.stringify({
          version: 1,
          flow: {
            decisions: {
              add: Array.from({ length: 32 }, (_, index) => `fixture-decision-${index}`),
            },
          },
        }),
      )
      const active = start(root, { ...env, WHOLELOOP_TEST_DRAIN_WAIT: '1' }, ['--poll'], false)
      let finished = false
      try {
        await active.drain()
        const started = Date.now()
        if (mode === 'interrupt') await active.stop()
        else {
          active.stdout.destroy()
          await active.finish()
        }
        finished = true
        expect(Date.now() - started).toBeLessThan(1500)
      } finally {
        if (!finished) await active.stop(false)
      }
    }),
)
it('proves the guard refuses both mutations and listener attempts before their effect', async () =>
  fixture(async ({ root, store, env }) => {
    mkdirSync(store, { recursive: true })
    const source =
        'import fs from "node:fs"; import net from "node:net"; try { fs.writeFileSync(process.env.WHOLELOOP_TEST_STORE+"/canary", "x") } catch {} try { net.createServer().listen(0) } catch {}',
      result = spawnSync(
        process.execPath,
        ['--import', guard, '--input-type=module', '-e', source],
        { env, cwd: root, encoding: 'utf8' },
      )
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('READ GUARD FAIL (1 writes, 1 listeners)')
    expect(readdirSync(store)).toEqual([])
  }))
