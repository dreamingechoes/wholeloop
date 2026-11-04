import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { sourceHash } from '../../../src/delivery/input.js'
import { REFERENCE_NATIVE_VERSIONS } from '../../../src/delivery/native-adapters.js'
import type { NativeBindings } from '../../../src/delivery/native-bindings.js'
import type { NativeRuntime } from '../../../src/delivery/native-runtime.js'
import { DeliveryPlanning } from '../../../src/delivery/planning-store.js'
import { DockerCli } from '../../../src/environment/docker-command.js'
import { EnvironmentLifecycle } from '../../../src/environment/lifecycle.js'
import { EnvironmentResources } from '../../../src/environment/runtime.js'
import { publicRunnerIdentity } from '../../../src/runner/public-host.js'
import { type RunnerRequest, RunnerStore } from '../../../src/runner/store.js'
import { authorization, git } from '../../support/delivery.js'
import {
  LOCAL_SSH,
  REPOSITORY,
  SYNTHETIC_CODEX,
  SYNTHETIC_GH,
} from '../../support/public-implementation.js'
import { type LiveTrial, trialVerdict } from '../campaign/report.js'
import { TASK, TRIAL_FILES, TRIAL_REPOSITORY, trialRecipe, verifyTrialSeed } from './fixture.js'
import { trialPlan } from './plan.js'
import { trialObservations } from './report.js'

/** One attempt, never a retry. Rehearsals use the same public CLI and plan. */
const args = process.argv.slice(2)
assert.ok(
  args.length <= 1 && args.every((arg) => ['--rehearse', '--seed'].includes(arg)),
  'Supported options: --rehearse or --seed',
)
const rehearsal = args.includes('--rehearse'),
  seed = args.includes('--seed')
if (!rehearsal && !seed)
  assert.equal(
    process.env.WHOLELOOP_LIVE_CONFIRM,
    'spend-quota-and-publish',
    'Set WHOLELOOP_LIVE_CONFIRM=spend-quota-and-publish for a live hosted attempt',
  )
const target = rehearsal ? 'codex' : process.env.WHOLELOOP_LIVE_TARGET,
  model = rehearsal ? 'reference-model' : process.env.WHOLELOOP_LIVE_MODEL
if (!seed) {
  assert.ok(
    target === 'claude' || target === 'codex',
    'Select the claude or codex reference target',
  )
  assert.ok(
    (model && process.env.WHOLELOOP_LIVE_CLIENT) || rehearsal,
    'Set WHOLELOOP_LIVE_MODEL and _CLIENT',
  )
}
const cli = resolve('dist/wl.mjs'),
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-live-implementation-'))),
  root = join(dir, 'repo'),
  state = join(dir, 'state'),
  run = `delivery-${randomBytes(8).toString('hex')}`
console.log(
  JSON.stringify({
    retained: dir,
    run,
    execution: seed ? 'seed-only' : rehearsal ? 'rehearsal' : 'live',
    started: new Date().toISOString(),
  }),
)
const command = (binary: string, arguments_: string[], cwd = dir) => {
  const result = spawnSync(binary, arguments_, {
    cwd,
    encoding: 'utf8',
    timeout: 60000,
    maxBuffer: 4 * 1024 * 1024,
  })
  assert.equal(result.status, 0, `${binary} failed: ${result.stderr.slice(0, 4000)}`)
  return result.stdout.trim()
}
function seedRepository() {
  mkdirSync(root)
  git(root, ['init', '-b', 'main'])
  git(root, ['config', 'user.name', 'Trial Owner'])
  git(root, ['config', 'user.email', 'trial@example.test'])
  for (const [ref, body] of Object.entries(TRIAL_FILES)) {
    mkdirSync(dirname(join(root, ref)), { recursive: true })
    writeFileSync(join(root, ref), body)
  }
  git(root, ['add', '--', ...Object.keys(TRIAL_FILES)])
  git(root, [
    'commit',
    '-m',
    'test: seed the private delivery trial',
    '-m',
    'Keep the HTTP entrypoint and failing status suite fixed for independent implementation trials.',
  ])
}
if (seed) {
  seedRepository()
  console.log(
    JSON.stringify({
      repository: root,
      base: git(root, ['rev-parse', 'HEAD']),
      hosted: 'not-created',
      pushed: false,
    }),
  )
  process.exit(0)
}
assert.ok(target === 'claude' || target === 'codex')
assert.ok(model)
const report: Record<string, unknown> = {
  schema: rehearsal ? 'wholeloop/rehearsal-trial@1' : 'wholeloop/live-trial@1',
  scenario: 'EVAL-09',
  execution: rehearsal ? 'rehearsal' : 'live',
  target,
  version: REFERENCE_NATIVE_VERSIONS[target],
  model,
  run,
  status: null,
  exit: null,
  humanWaits: 0,
  native: [],
  acceptance: 'not-established',
  publication: 'not-observed',
  core: {
    cli: sourceHash(readFileSync(cli, 'utf8')),
    controller: sourceHash(readFileSync(join(dirname(cli), 'wl-runner.mjs'), 'utf8')),
  },
}
let observedStore: RunnerStore | undefined
const started = Date.now()
try {
  mkdirSync(join(dir, 'bin'))
  let client: string, home: string, gh: string
  if (rehearsal) {
    seedRepository()
    const bare = join(dir, 'remote.git'),
      bin = join(dir, 'bin')
    command('git', ['init', '--quiet', '--bare', bare])
    // The synthetic gh is intentionally scoped to fixture/app; only this
    // model-free transport uses that remote identity, never a hosted attempt.
    for (const [name, body] of Object.entries({
      codex: SYNTHETIC_CODEX(join(dir, 'calls.jsonl')),
      ssh: LOCAL_SSH(bare),
      gh: SYNTHETIC_GH(join(dir, 'pulls.json'), bare, join(dir, 'gh.jsonl')),
    })) {
      writeFileSync(join(bin, name), body)
      chmodSync(join(bin, name), 0o700)
    }
    process.env.GIT_SSH_COMMAND = join(bin, 'ssh')
    git(root, ['remote', 'add', 'origin', 'git@github.com:fixture/app.git'])
    git(root, ['push', 'origin', 'main'])
    client = join(bin, 'codex')
    gh = join(bin, 'gh')
    home = join(dir, 'client-home')
    mkdirSync(home, { mode: 0o700 })
  } else {
    client = realpathSync(process.env.WHOLELOOP_LIVE_CLIENT ?? '')
    home = realpathSync(
      process.env.WHOLELOOP_LIVE_HOME ??
        join(homedir(), '.local', 'state', 'wholeloop-native', target),
    )
    gh = realpathSync(process.env.WHOLELOOP_LIVE_GH ?? command('which', ['gh']))
    const repository = JSON.parse(command(gh, ['api', `repos/${TRIAL_REPOSITORY}`])) as {
      full_name?: string
      private?: boolean
      default_branch?: string
    }
    assert.equal(repository.full_name, TRIAL_REPOSITORY)
    assert.equal(repository.private, true, 'The campaign repository must remain private')
    assert.equal(repository.default_branch, 'main')
    command('git', [
      'clone',
      '--quiet',
      '--branch',
      'main',
      '--single-branch',
      `git@github.com:${TRIAL_REPOSITORY}.git`,
      root,
    ])
    // Avoid importing personal signing/hooks into controller-owned trial commits.
    git(root, ['config', 'user.name', 'Trial Owner'])
    git(root, ['config', 'user.email', 'trial@example.test'])
    git(root, ['config', 'commit.gpgsign', 'false'])
    git(root, ['config', 'core.hooksPath', '/dev/null'])
  }
  verifyTrialSeed(root)
  const baseline = spawnSync(process.execPath, ['suite.cjs'], { cwd: root, encoding: 'utf8' })
  assert.equal(baseline.status, 1, 'The unchanged candidate must fail the real suite')
  report.baseline = { exit: baseline.status, expected: 'failure-before-implementation' }
  const planning = new DeliveryPlanning(state),
    source = planning.sources.capture(
      {
        schema: 'wholeloop/delivery-source-request@1',
        kind: 'inline',
        ref: 'eval-09',
        body: TASK,
        mapping: [{ id: 'status', role: 'criterion', startLine: 1, endLine: 1 }],
      },
      root,
    ),
    plan = trialPlan(planning.sources.files, {
      run,
      source: source.id,
      root,
      base: git(root, ['rev-parse', 'HEAD']),
    })
  if (rehearsal) {
    const repository = plan.repositories[0]
    assert.ok(repository)
    repository.remote = { name: 'origin', url: 'https://github.com/fixture/app' }
  }
  const prepared = planning.preparePlan(plan),
    store = new RunnerStore(state),
    grant = store.lifecycle.authority.authorize({
      ...authorization(plan, prepared.digest),
      id: `authorization-${randomBytes(8).toString('hex')}`,
      operator: 'Campaign Owner',
      effects: [
        ...authorization(plan, prepared.digest).effects,
        'git.push',
        'pr.create',
        'pr.ready',
      ],
      decisions: ['approve-build-plan', 'acceptance'],
      reads: [],
      effectLimit: 40,
    })
  observedStore = store
  store.lifecycle.track({ run, revision: 1, grant: grant.grant.id })
  const bindings: NativeBindings = {
      schema: 'wholeloop/native-bindings@1',
      bindings: [
        {
          target,
          version: REFERENCE_NATIVE_VERSIONS[target],
          model,
          roles: ['planner', 'challenger', 'builder', 'verifier', 'reviewer', 'refuter'],
        },
      ],
    },
    runtime: NativeRuntime = {
      schema: 'wholeloop/native-runtime@1',
      clients: [{ target, client, store: home }],
      codeHost: { kind: 'github-cli', client: gh },
      repositories: [REPOSITORY(trialRecipe(state, root))],
    },
    request: RunnerRequest = {
      schema: 'wholeloop/delivery-runner-request@1',
      key: 'eval-09',
      run,
      revision: 1,
      plan: prepared.digest,
      grant: grant.grant.id,
      host: publicRunnerIdentity(bindings, runtime),
      pollMs: 1000,
    },
    digest = store.prepare(request).digest
  for (const [name, value] of Object.entries({ bindings, runtime, request }))
    writeFileSync(join(dir, `${name}.json`), JSON.stringify(value))
  report.digest = digest
  report.base = plan.repositories[0]?.base
  report.plan = prepared.digest
  const result = spawnSync(
    process.execPath,
    [
      cli,
      'delivery',
      'run',
      '--digest',
      digest,
      '--bindings',
      'bindings.json',
      '--runtime',
      'runtime.json',
      '--root',
      dir,
      '--store',
      state,
      '--json',
    ],
    {
      cwd: dir,
      encoding: 'utf8',
      timeout: 5 * 3600 * 1000,
      maxBuffer: 16 * 1024 * 1024,
    },
  )
  report.exit = result.status
  report.transport = { signal: result.signal, error: result.error?.message ?? null }
  report.errors = result.stderr.slice(0, 4000)
  const value = result.stdout ? (JSON.parse(result.stdout) as Record<string, unknown>) : null
  report.status = value?.status ?? null
  report.preflight = value?.preflight ?? null
  const status = report.status as { state?: string; outcome?: string } | null
  if (status?.state === 'completed' && ['ready-pr', 'draft-pr'].includes(status.outcome ?? '')) {
    report.publication = rehearsal ? 'local-transport-only' : 'host-observed'
    const retirements = []
    for (const { record, digest: environmentDigest } of new EnvironmentResources(store.files)
      .list()
      .filter((entry) => entry.record.run === run)) {
      const retired = await new EnvironmentLifecycle(store.files, new DockerCli()).execute({
        schema: 'wholeloop/environment-lifecycle-request@1',
        id: `trial-retire-${record.id.slice(-16)}`,
        environment: record.id,
        expected: environmentDigest,
        action: 'retire',
        reason: 'Retire this exact successful trial environment after retaining its evidence.',
      })
      retirements.push({ id: record.id, state: retired.state })
      assert.equal(retired.state, 'retired')
    }
    report.environments = retirements
  } else process.exitCode = 1
} catch (error) {
  report.error = error instanceof Error ? error.message : 'Implementation trial failed'
  process.exitCode = 1
} finally {
  if (observedStore) {
    try {
      Object.assign(report, trialObservations(observedStore, run))
    } catch (error) {
      report.observationError = error instanceof Error ? error.message : 'Trial observation failed'
      process.exitCode = 1
    }
  }
  report.verdict = trialVerdict(report as unknown as LiveTrial)
  if (!(report.verdict as { passed: boolean }).passed) process.exitCode = 1
  report.seconds = Math.round((Date.now() - started) / 1000)
  mkdirSync(join(dir, 'results'), { recursive: true })
  writeFileSync(join(dir, 'results', 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify({ ...report, native: (report.native as unknown[]).length }))
}
