import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bundledCanonical } from '../../../src/adapters/canonical.js'
import {
  conformanceDiagnostics,
  nativeDiagnostics,
  saveNativeDiagnostics,
} from '../../../src/conformance/diagnostics.js'
import { prepareConformance, readConformance, runFiles } from '../../../src/conformance/prepare.js'
import { conformanceRecipe } from '../../../src/conformance/recipes.js'
import { workerProcess } from '../../../src/fanout/process.js'

const privateText = 'Synthetic private diagnostic detail, not intended for persistence'
const json = (value: unknown) => Buffer.from(`${JSON.stringify(value)}\n`)

describe('bounded redacted native diagnostics', () => {
  it.each([
    ['authentication-required', 'Authentication required'],
    ['account-ineligible', 'IneligibleTierError'],
    ['permission-denied', 'Permission denied'],
    ['invalid-invocation', 'Unknown flag --fixture'],
    ['connection-failed', 'ECONNREFUSED'],
    ['model-unavailable', 'No model configured'],
  ])('retains only the %s category from structured errors', (signal, message) => {
    const capture = nativeDiagnostics()
    const bytes = json({
      event: 'result',
      result: { status: 'ERROR', error: `${message}: ${privateText}`, response: privateText },
    })
    for (const byte of bytes) capture.observe('stdout', Buffer.from([byte]))
    const result = capture.finish()
    expect(result).toMatchObject({
      signals: [signal],
      errorEvents: 1,
      events: ['result'],
      stdoutBytes: bytes.length,
    })
    expect(JSON.stringify(result)).not.toContain(privateText)
  })
  it('does not infer a denied permission from successful metadata or assistant prose', () => {
    const capture = nativeDiagnostics()
    capture.observe(
      'stdout',
      json({
        event: 'init',
        init: { permission_mode: 'request-review', tools: ['ask_permission'] },
      }),
    )
    capture.observe(
      'stdout',
      json({
        type: 'assistant.message',
        message: 'Authentication required; quota exceeded; permission denied',
      }),
    )
    capture.observe('stdout', Buffer.from('Unknown flag in ordinary progress text\n'))
    expect(capture.finish()).toMatchObject({
      signals: [],
      errorEvents: 0,
      events: ['assistant.message', 'init'],
    })
  })
  it('decodes split UTF-8 and classifies an unterminated stderr line without retaining prose', () => {
    const capture = nativeDiagnostics()
    const bytes = Buffer.from(`Permission denied: répertoire ${privateText}`)
    const split = bytes.indexOf(0xc3) + 1
    capture.observe('stderr', bytes.subarray(0, split))
    capture.observe('stderr', bytes.subarray(split))
    expect(capture.finish()).toMatchObject({
      signals: ['permission-denied'],
      stderrBytes: bytes.length,
    })
  })
  it('drops oversized logical lines and resynchronizes without retaining unknown event names', () => {
    const capture = nativeDiagnostics()
    capture.observe('stdout', Buffer.from('x'.repeat(65537)))
    capture.observe('stdout', Buffer.from(`more\n${JSON.stringify({ event: privateText })}\n`))
    capture.observe(
      'stdout',
      json({ type: 'error', error: { message: 'Unknown option --fixture' } }),
    )
    expect(capture.finish()).toMatchObject({
      oversizedLine: true,
      signals: ['invalid-invocation'],
      events: ['error'],
      errorEvents: 1,
    })
  })
  it('observes failed process stderr before the process transport discards it', async () => {
    const capture = nativeDiagnostics()
    const result = await workerProcess(
      process.execPath,
      [
        '-e',
        `process.stderr.write(${JSON.stringify(`Authentication required: ${privateText}`)});process.exitCode=7`,
      ],
      {
        cwd: tmpdir(),
        input: '',
        timeoutMs: 3000,
        signal: new AbortController().signal,
        env: process.env,
        observe: capture.observe,
      },
    )
    expect(result).toMatchObject({ status: 'crashed', code: 7, stdout: '' })
    expect(capture.finish()).toMatchObject({ signals: ['authentication-required'] })
    expect(JSON.stringify(result)).not.toContain(privateText)
  })
  it('fails a process safely if its diagnostic observer throws', async () => {
    const result = await workerProcess(
      process.execPath,
      ['-e', 'console.log("ready");setInterval(()=>{},1000)'],
      {
        cwd: tmpdir(),
        input: '',
        timeoutMs: 3000,
        signal: new AbortController().signal,
        env: process.env,
        observe: () => {
          throw new Error('Synthetic observer failure')
        },
      },
    )
    expect(result.status).toBe('crashed')
    expect(result.stdout).toBe('')
  })
  it('binds persisted categories to the exact run/core and leaves older runs explicitly unavailable', () => {
    const store = mkdtempSync(join(tmpdir(), 'wl-native-diagnostics-'))
    try {
      const context = {
        store,
        canonical: bundledCanonical(),
        core: readFileSync(resolve('dist/wl.mjs'), 'utf8'),
        version: '0.0.0',
      }
      const prepared = prepareConformance(context, 'opencode', '2.1.1')
      expect(conformanceDiagnostics(context, prepared.id)).toMatchObject({
        status: 'unavailable',
        mode: 'unrun',
      })
      const run = readConformance(context, prepared.id)
      run.mode = 'live'
      run.phase = 'finished'
      runFiles(context, run.id).atomic('run.json', `${JSON.stringify(run)}\n`)
      const capture = nativeDiagnostics()
      capture.observe('stderr', Buffer.from('Permission denied'))
      saveNativeDiagnostics(context, run, capture.finish())
      expect(conformanceDiagnostics(context, run.id)).toMatchObject({
        status: 'observed',
        mode: 'live',
        observations: { signals: ['permission-denied'] },
        next: [expect.stringContaining('permission/trust')],
      })
      expect(runFiles(context, run.id).read('diagnostics.json')).not.toContain('Permission denied')
      const forged = JSON.parse(runFiles(context, run.id).read('diagnostics.json') ?? '{}')
      forged.core = '0'.repeat(64)
      runFiles(context, run.id).atomic('diagnostics.json', `${JSON.stringify(forged)}\n`)
      expect(() => conformanceDiagnostics(context, run.id)).toThrow(
        'Invalid conformance diagnostics',
      )
      runFiles(context, run.id).atomic('diagnostics.json', '')
      expect(() => conformanceDiagnostics(context, run.id)).toThrow(
        'Invalid conformance diagnostics',
      )
    } finally {
      rmSync(store, { recursive: true, force: true })
    }
  })
  it('uses a private v2 server without changing the pinned v1 invocation', () => {
    const run = {
      target: 'opencode',
      root: '/fixture',
      state: '/external',
      pin: '2.1.1',
    } as Parameters<typeof conformanceRecipe>[0]
    expect(conformanceRecipe(run).args).toEqual(['run', '--standalone', '--format', 'json'])
    expect(conformanceRecipe({ ...run, pin: '1.17.9' }).args).toEqual(['run', '--format', 'json'])
    expect(conformanceRecipe({ ...run, target: 'antigravity', pin: '1.4.4' }).args).toEqual([
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
    ])
  })
})
