// Calibration control for preload.mjs (P7-04): run a script whose operations
// are known exactly and refuse to trust the profiler if any counter differs.
//   npm run perf:calibrate
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const work = mkdtempSync(join(tmpdir(), 'wholeloop-perf-calibration-'))
const output = join(work, 'profiles')
try {
  spawnSync('mkdir', [output])
  spawnSync('git', ['init', '-q', join(work, 'repo')])
  // Three Git queries and four lstat calls before the stage event, two exists after it.
  const script = `
const fs = require('node:fs'), cp = require('node:child_process')
for (let i = 0; i < 3; i++) cp.spawnSync('git', ['rev-parse', '--git-dir'], { cwd: ${JSON.stringify(join(work, 'repo'))} })
for (let i = 0; i < 4; i++) fs.lstatSync(${JSON.stringify(work)})
fs.writeFileSync(${JSON.stringify(join(work, 'journal'))}, JSON.stringify({ run: 'delivery-0', sequence: 1, payload: { schema: 'wholeloop/delivery-runner-event@1', stage: 'review:unit', action: 'dispatched' } }) + '\\n')
for (let i = 0; i < 2; i++) fs.existsSync(${JSON.stringify(work)})
`
  writeFileSync(join(work, 'calibration.cjs'), script)
  const run = spawnSync(
    process.execPath,
    ['--import', join(here, 'preload.mjs'), join(work, 'calibration.cjs')],
    {
      env: { ...process.env, WHOLELOOP_PERF_OUTPUT: output, WHOLELOOP_PERF_CALLERS: '1' },
      encoding: 'utf8',
    },
  )
  assert.equal(run.status, 0, run.stderr)
  const files = readdirSync(output).filter((name) => name.startsWith('profile-'))
  // The child Git processes are not Node; only the calibration script reports.
  assert.equal(files.length, 1, 'Exactly one profile expected')
  const profile = JSON.parse(readFileSync(join(output, files[0] ?? ''), 'utf8'))
  const count = (bucket, name) => bucket?.[name]?.calls ?? 0
  assert.equal(count(profile.phases.bootstrap, 'process.spawnSync.git.rev-parse'), 3)
  assert.equal(count(profile.phases.bootstrap, 'fs.lstatSync'), 4)
  assert.equal(count(profile.phases.review, 'fs.existsSync'), 2)
  assert.equal(count(profile.phases.review, 'process.spawnSync.git.rev-parse'), 0)
  assert.deepEqual(
    profile.transitions.map((entry) => entry.phase),
    ['review'],
  )
  assert.equal(profile.overflow, 0)
  assert.ok(profile.peakBytes.rss > 0)
  assert.ok(
    Object.values(profile.callers).some(
      (entry) =>
        entry.operation === 'process.spawnSync.git.rev-parse' && entry.phase === 'bootstrap',
    ),
  )
  assert.equal(profile.callerOverflow, 0)
  console.log('perf calibration: counters, phases, memory peak and caller attribution match')
} finally {
  rmSync(work, { recursive: true, force: true })
}
