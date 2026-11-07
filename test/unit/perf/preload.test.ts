import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const preload = resolve('scripts/perf/preload.mjs')

describe('performance investigation tooling', () => {
  it('passes its calibration control', () => {
    const result = spawnSync(process.execPath, [resolve('scripts/perf/calibrate.mjs')], {
      encoding: 'utf8',
    })
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('counters, phases, memory peak and caller attribution match')
  })

  it('writes no argument, path, environment value or body into a profile', () => {
    const work = mkdtempSync(join(tmpdir(), 'wl-perf-privacy-'))
    try {
      const output = join(work, 'profiles')
      mkdirSync(output)
      const secretPath = join(work, 'secret-path-7f3a')
      const script = `
const fs = require('node:fs'), cp = require('node:child_process')
cp.spawnSync('git', ['rev-parse', 'secret-argument-91c2'], { cwd: ${JSON.stringify(work)} })
fs.writeFileSync(${JSON.stringify(secretPath)}, 'secret-body-55d0')
JSON.parse(JSON.stringify({ token: 'secret-json-0e4b' }))
fs.existsSync(${JSON.stringify(secretPath)})
`
      writeFileSync(join(work, 'probe.cjs'), script)
      const run = spawnSync(process.execPath, ['--import', preload, join(work, 'probe.cjs')], {
        encoding: 'utf8',
        env: {
          ...process.env,
          WHOLELOOP_PERF_OUTPUT: output,
          WHOLELOOP_PERF_CALLERS: '1',
          FIXTURE_SECRET: 'secret-environment-b8e1',
        },
      })
      expect(run.status, run.stderr).toBe(0)
      const [file] = readdirSync(output)
      const text = readFileSync(join(output, file ?? ''), 'utf8')
      for (const secret of [
        'secret-argument-91c2',
        'secret-path-7f3a',
        'secret-body-55d0',
        'secret-json-0e4b',
        'secret-environment-b8e1',
        work,
      ])
        expect(text).not.toContain(secret)
      expect(JSON.parse(text).counts['process.spawnSync.git.rev-parse'].calls).toBe(1)
    } finally {
      rmSync(work, { recursive: true, force: true })
    }
  })

  it('does nothing without an output directory and is never loaded by the published CLI', () => {
    const run = spawnSync(process.execPath, ['--import', preload, '-e', 'JSON.parse("1")'], {
      encoding: 'utf8',
      env: { ...process.env, WHOLELOOP_PERF_OUTPUT: '' },
    })
    expect(run.status).toBe(0)
    for (const bundle of ['dist/wl.mjs', 'dist/wl-runner.mjs']) {
      const text = readFileSync(resolve(bundle), 'utf8')
      expect(text).not.toContain('WHOLELOOP_PERF_OUTPUT')
      expect(text).not.toContain('scripts/perf')
    }
  })
})
