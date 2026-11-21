// Retains native observations outside repositories; replay and calibration perform no client calls.
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { createInterface } from 'node:readline'
import {
  calibrateExperience,
  EXPERIENCE_STEPS,
  experienceBaseline,
  experienceFailures,
} from '../../../src/experience/budgets.js'
import { experienceReport } from '../../../src/experience/report.js'
import {
  type ExperienceClient,
  type ExperienceTrace,
  experienceTrace,
  type ObservedEvent,
  object,
} from '../../../src/experience/transcript.js'
import { assertExternal } from '../../../src/state/paths.js'
import {
  EXPERIENCE_QUESTIONS,
  experienceEnvironment,
  experiencePrompt,
  experienceRecipe,
  FIXTURE_FILES,
} from './plan.js'

const args = process.argv.slice(2)
const allowed = ['--replay', '--calibrate', '--target', '--baseline', '--out']
if (
  args.length % 2 ||
  args.some((arg, index) => index % 2 === 0 && !allowed.includes(arg)) ||
  new Set(args.filter((_, index) => index % 2 === 0)).size !== args.length / 2
)
  throw new Error(
    'Use --target codex|claude [--baseline file] [--out directory], --replay trace, or --calibrate reports',
  )
const option = (name: string) => {
  const index = args.indexOf(name)
  return index < 0 ? undefined : args[index + 1]
}
const json = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'))
const baseline = option('--baseline')
  ? experienceBaseline(json(option('--baseline') as string))
  : undefined
if (option('--replay')) {
  const report = experienceReport(experienceTrace(json(option('--replay') as string)))
  console.log(JSON.stringify({ report, failures: experienceFailures(report, baseline) }, null, 2))
  process.exitCode = experienceFailures(report, baseline).length ? 1 : 0
} else if (option('--calibrate')) {
  const input = json(option('--calibrate') as string)
  if (!Array.isArray(input))
    throw new Error('Calibration requires an array of twelve native traces')
  console.log(
    JSON.stringify(
      calibrateExperience(
        input.map((trace) => experienceReport(experienceTrace(trace))),
        baseline,
      ),
      null,
      2,
    ),
  )
} else {
  if (process.env.WHOLELOOP_LIVE_CONFIRM !== 'spend-quota')
    throw new Error('Live experience check refused without quota confirmation')
  const target = option('--target')
  if (target !== 'codex' && target !== 'claude') throw new Error('Choose --target codex|claude')
  const clientHome = process.env.WHOLELOOP_EXPERIENCE_CLIENT_HOME
  if (!clientHome)
    throw new Error(
      'Provide a dedicated signed-in WHOLELOOP_EXPERIENCE_CLIENT_HOME; credentials are never copied',
    )
  assertExternal(clientHome)
  const dir = option('--out')
    ? resolve(option('--out') as string)
    : realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-experience-')))
  assertExternal(dir)
  mkdirSync(dir, { recursive: true })
  const root = join(dir, 'application'),
    state = join(dir, 'state')
  // Refuse reuse: the fixture, installation and native observations belong to exactly one trial.
  mkdirSync(root, { recursive: false })
  mkdirSync(state)
  const env = experienceEnvironment(root, realpathSync(clientHome), state, process.env)
  for (const [name, text] of Object.entries(FIXTURE_FILES)) writeFileSync(join(root, name), text)
  execFileSync('git', ['init', '--quiet'], { cwd: root, env })
  execFileSync('git', ['add', '.'], { cwd: root, env })
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Example Owner',
      '-c',
      'user.email=owner@example.invalid',
      'commit',
      '--quiet',
      '-m',
      'test: initialize experience fixture',
    ],
    { cwd: root, env },
  )
  const cli = resolve('dist/wl.mjs')
  const installed: unknown = JSON.parse(
    execFileSync(
      process.execPath,
      [
        cli,
        'install',
        '--target',
        target,
        '--scope',
        'project',
        '--store',
        join(state, 'wholeloop'),
        '--json',
      ],
      { cwd: root, env, encoding: 'utf8' },
    ),
  )
  if (
    !object(installed) ||
    !Array.isArray(installed.artifacts) ||
    typeof installed.artifacts[0] !== 'string'
  )
    throw new Error('Installation did not report a packaged artifact')
  const launcher = join(installed.artifacts[0], 'bin', 'wl.mjs')
  const reports = []
  const version = execFileSync(target, ['--version'], {
    cwd: root,
    env,
    encoding: 'utf8',
    timeout: 10000,
  }).trim()
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  writeFileSync(
    join(dir, 'metadata.json'),
    `${JSON.stringify({ target, version, revision, started: new Date().toISOString() }, null, 2)}\n`,
  )
  for (const step of EXPERIENCE_STEPS) {
    console.error(`Experience: ${target}/${step}; observations retained in ${dir}`)
    const observed = await observe(
      target,
      experienceRecipe(target, root, state),
      experiencePrompt(step, launcher, join(state, 'wholeloop')),
      root,
      env,
    )
    const trace: ExperienceTrace = {
      schema: 'wholeloop/experience-trace@1',
      provenance: 'live',
      client: target,
      step,
      chosenSources: ['codebase'],
      requiredQuestions: EXPERIENCE_QUESTIONS[step] ?? [],
      ...observed,
    }
    writeFileSync(join(dir, `${step}.trace.json`), `${JSON.stringify(trace, null, 2)}\n`)
    const report = experienceReport(experienceTrace(trace))
    reports.push({ report, failures: experienceFailures(report, baseline) })
    writeFileSync(join(dir, 'reports.json'), `${JSON.stringify(reports, null, 2)}\n`)
    if (observed.exitCode !== 0) break
  }
  console.log(JSON.stringify({ directory: dir, reports }, null, 2))
  process.exitCode =
    reports.length !== EXPERIENCE_STEPS.length || reports.some((result) => result.failures.length)
      ? 1
      : 0
}

async function observe(
  client: ExperienceClient,
  args: string[],
  prompt: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
) {
  const events: ObservedEvent[] = [],
    started = performance.now()
  const child = spawn(client, args, {
    cwd,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: true,
    shell: false,
  })
  const stop = () => {
    if (child.pid) {
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch {
        /* The process group already ended. */
      }
    }
  }
  const timeout = setTimeout(stop, 15 * 60 * 1000)
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  let bytes = 0
  child.stdout.on('data', (chunk: Buffer) => {
    bytes += chunk.length
    if (bytes > 32 * 1024 * 1024) stop()
  })
  const lines = createInterface({ input: child.stdout })
  lines.on('line', (line) => {
    if (bytes > 32 * 1024 * 1024) return
    let event: unknown
    try {
      event = JSON.parse(line)
    } catch {
      event = { type: 'unparsed-native-output' }
    }
    events.push({
      atMs: Math.round(performance.now() - started),
      event: object(event) ? event : { type: 'invalid-native-event' },
    })
  })
  // Diagnostics may contain private native data. Retain only byte counts; raw stderr is not a report.
  let stderrBytes = 0
  child.stderr.on('data', (chunk: Buffer) => {
    stderrBytes += chunk.length
    if (stderrBytes > 1024 * 1024) stop()
  })
  child.stdin.on('error', () => {
    /* An early client exit is recorded below. */
  })
  child.stdin.end(prompt)
  const exitCode = await new Promise<number | null>((done) => {
    child.once('error', () => done(null))
    child.once('close', (code) => done(code))
  })
  stop()
  clearTimeout(timeout)
  process.removeListener('SIGINT', stop)
  process.removeListener('SIGTERM', stop)
  return { events, wallMs: Math.round(performance.now() - started), exitCode }
}
