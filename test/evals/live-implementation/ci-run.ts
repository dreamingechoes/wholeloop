import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { sourceHash } from '../../../src/delivery/input.js'
import { REFERENCE_NATIVE_VERSIONS } from '../../../src/delivery/native-adapters.js'
import type { NativeBindings } from '../../../src/delivery/native-bindings.js'
import type { NativeRuntime } from '../../../src/delivery/native-runtime.js'
import { DeliveryPlanning } from '../../../src/delivery/planning-store.js'
import { DeliveryRunner, type DeliveryRunnerHost } from '../../../src/runner/engine.js'
import { deliveryRunner } from '../../../src/runner/events.js'
import {
  composeInstalledImplementation,
  runtimeGithub,
} from '../../../src/runner/public-composition.js'
import { publicRunnerIdentity } from '../../../src/runner/public-host.js'
import {
  GithubCliCiHost,
  GithubCliMergeFactsHost,
  GithubCliMergeHost,
} from '../../../src/runner/publication-host.js'
import { runnerRoute } from '../../../src/runner/route.js'
import { type RunnerRequest, RunnerStore } from '../../../src/runner/store.js'
import { authorization, envelope, git, mergePolicy } from '../../support/delivery.js'
import { REPOSITORY } from '../../support/public-implementation.js'
import { configureTrialCheckout, TRIAL_REPOSITORY, trialRecipe, trialSource } from './fixture.js'
import { trialPlan } from './plan.js'

/**
 * P8-01 live scenario (ADR-0248): EVAL-09's task on the trial repository's
 * `ci-trial` branch, whose required check also runs a CI-only release-note check
 * the local suite never runs. A none run under its own envelope grant publishes,
 * fails that check, and must repair it and reach a green required check with no
 * human step. Merge is not granted, so the run ends blocked at merge by design.
 * One attempt, never a retry; it spends model quota and pushes to the trial
 * repository, so it needs WHOLELOOP_LIVE_CONFIRM=spend-quota-and-publish.
 */
// The task allows the release note, so a correction that adds it stays inside the
// accepted scope; its line names the pull request, which only exists after
// publication, so acceptance cannot pin it beforehand and the first check fails.
const CI_TASK =
    'Change status.txt from pending to public fixture. GET / must return the JSON object {"status":"public fixture"}. The required checks of the pull request must pass; a release note in CHANGES.md is allowed. Keep app.cjs, suite.cjs, ci-check.cjs, package.json, REVIEW.md and the CI workflow unchanged. No dependencies, credentials, merge or other feature.',
  CI_TRIAL_BRANCH = 'ci-trial',
  // The seeded branch head: EVAL-09's fixture plus ci-check.cjs and a pull_request-only workflow.
  CI_TRIAL_HEAD = process.env.WHOLELOOP_CI_TRIAL_HEAD ?? ''
assert.equal(
  process.env.WHOLELOOP_LIVE_CONFIRM,
  'spend-quota-and-publish',
  'Set WHOLELOOP_LIVE_CONFIRM=spend-quota-and-publish for a live hosted attempt',
)
assert.match(CI_TRIAL_HEAD, /^[a-f0-9]{40}$/, 'Set WHOLELOOP_CI_TRIAL_HEAD to the seeded commit')
const target = 'codex',
  model = process.env.WHOLELOOP_LIVE_MODEL ?? '',
  client = realpathSync(process.env.WHOLELOOP_LIVE_CLIENT ?? ''),
  home = realpathSync(
    process.env.WHOLELOOP_LIVE_HOME ??
      join(homedir(), '.local', 'state', 'wholeloop-native', target),
  )
assert.ok(model, 'Set WHOLELOOP_LIVE_MODEL')
const cli = resolve('dist/wl.mjs'),
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-live-ci-correction-'))),
  root = join(dir, 'repo'),
  state = join(dir, 'state'),
  run = `delivery-${randomBytes(8).toString('hex')}`
console.log(
  JSON.stringify({ retained: dir, run, execution: 'live', started: new Date().toISOString() }),
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

/** One composed host per request, so the controller's continuation gets its own. */
function perRequest(
  store: RunnerStore,
  compose: (request: RunnerRequest) => DeliveryRunnerHost,
  identity: RunnerRequest['host'],
): DeliveryRunnerHost {
  const hosts = new Map<string, DeliveryRunnerHost>(),
    host = (request: Readonly<RunnerRequest>) => {
      const key = contractDigest(request)
      let value = hosts.get(key)
      if (!value) {
        value = compose(store.get(key))
        hosts.set(key, value)
      }
      return value
    }
  return {
    identity,
    preflight: (request, plan, stages, signal) =>
      host(request).preflight(request, plan, stages, signal),
    execute: (context) => host(context.request).execute(context),
    inspect: (request, stage, signal) => host(request).inspect(request, stage, signal),
    stop: (request, stage, signal) =>
      host(request).stop?.(request, stage, signal) ?? Promise.resolve(),
    endpoint: (request, ...rest) => host(request).endpoint(request, ...rest),
    release: (request, signal) => host(request).release?.(request, signal) ?? Promise.resolve(true),
  }
}

const report: Record<string, unknown> = {
  schema: 'wholeloop/live-trial@1',
  scenario: 'P8-01',
  execution: 'live',
  target,
  version: REFERENCE_NATIVE_VERSIONS[target],
  model,
  run,
  humanWaits: 0,
  acceptance: 'not-established',
  core: { cli: sourceHash(readFileSync(cli, 'utf8')) },
}
const started = Date.now()
try {
  const gh = realpathSync(process.env.WHOLELOOP_LIVE_GH ?? command('which', ['gh'])),
    github = runtimeGithub(gh)
  command('git', [
    'clone',
    '--quiet',
    '--branch',
    CI_TRIAL_BRANCH,
    '--single-branch',
    `git@github.com:${TRIAL_REPOSITORY}.git`,
    root,
  ])
  configureTrialCheckout(root)
  assert.equal(git(root, ['rev-parse', 'HEAD']), CI_TRIAL_HEAD, 'Unexpected ci-trial head')
  const planning = new DeliveryPlanning(state),
    source = planning.sources.capture(
      {
        schema: 'wholeloop/delivery-source-request@1',
        kind: 'inline',
        ref: 'p8-01',
        ...trialSource(root, CI_TASK),
      },
      root,
    ),
    plan = trialPlan(
      planning.sources.files,
      {
        run,
        source: source.id,
        root,
        base: CI_TRIAL_HEAD,
      },
      CI_TASK,
    ),
    repository = plan.repositories[0]
  assert.ok(repository)
  repository.target = `refs/heads/${CI_TRIAL_BRANCH}`
  plan.policy.endpoint = 'to-merge'
  plan.policy.merge = mergePolicy()
  // Under an envelope grant the plan stage accepts the derived plan by delegated decision.
  const [first] = plan.policy.delegations ?? []
  assert.ok(first)
  const rubric = JSON.stringify({
    schema: 'wholeloop/delegated-decision-rubric@1',
    decision: 'delivery-plan',
    purpose: 'Accept only a plan that stays inside the approved envelope and the pinned task.',
    rules: [{ id: 'scope', text: 'Preserve the approved scope, source and exclusions.' }],
    outcomes: ['accept', 'reject'],
    unknowns: { allowed: [], defaults: [] },
    timeoutMs: 900000,
  })
  planning.sources.files.atomic('rubrics/delivery-plan.json', rubric)
  plan.policy.delegations = [
    ...(plan.policy.delegations ?? []),
    {
      ...first,
      id: 'delivery-plan',
      rubric: { ref: 'rubrics/delivery-plan.json', sha256: sourceHash(rubric) },
    },
  ]
  // Run budgets span the continuation: revisions may tighten them, never replenish
  // them, so the original attempt and one repair share the builder restarts.
  plan.budgets.restarts = 6
  plan.envelope = planning.prepareEnvelope(envelope(plan)).digest
  const prepared = planning.preparePlan(plan),
    store = new RunnerStore(state),
    base = authorization(plan, prepared.digest),
    grant = store.lifecycle.authority.authorize({
      ...base,
      id: `authorization-${randomBytes(8).toString('hex')}`,
      operator: 'Campaign Owner',
      basis: { kind: 'envelope', digest: plan.envelope },
      effects: [...base.effects, 'git.push', 'pr.create', 'pr.ready'],
      decisions: ['approve-build-plan', 'acceptance', 'delivery-plan'],
      reads: [],
      // One envelope grant covers the original attempt and its repairs (ADR-0248).
      effectLimit: 80,
    })
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
      // The planner has no read tool: the operator selects the CI-only check so a
      // repair can see what it requires. Its line names the pull request, which the
      // first candidate cannot know, so the first required check still fails.
      repositories: [
        REPOSITORY(
          trialRecipe(state, root, [
            {
              id: 'ci-check',
              ref: 'ci-check.cjs',
              text: readFileSync(join(root, 'ci-check.cjs'), 'utf8'),
            },
          ]),
        ),
      ],
    },
    request: RunnerRequest = {
      schema: 'wholeloop/delivery-runner-request@1',
      key: 'p8-01',
      run,
      revision: 1,
      plan: prepared.digest,
      grant: grant.grant.id,
      host: publicRunnerIdentity(bindings, runtime),
      pollMs: 1000,
    },
    digest = store.prepare(request).digest,
    ci = new GithubCliCiHost(github),
    compose = (current: RunnerRequest) => {
      const currentPlan = store.basis(current).plan,
        host = composeInstalledImplementation(
          {
            store,
            request: current,
            plan: currentPlan,
            stages: runnerRoute(currentPlan),
            configuration: { bindings, runtime },
          },
          {
            ci: { identity: current.host, host: ci },
            // Merge is never granted: the merge stage blocks before any host call merges.
            merge: {
              identity: current.host,
              ci,
              runtime: { allowsMerge: true },
              facts: new GithubCliMergeFactsHost(github),
              merge: new GithubCliMergeHost(github),
            },
          },
        )
      assert.ok(host, 'The installed to-merge route must compose')
      return host
    }
  for (const [name, value] of Object.entries({ bindings, runtime, request }))
    writeFileSync(join(dir, `${name}.json`), JSON.stringify(value))
  report.digest = digest
  report.base = CI_TRIAL_HEAD
  const last = await new DeliveryRunner(store).runWithRepairs(
      digest,
      perRequest(store, compose, request.host),
    ),
    journal = store.lifecycle.journal.view(run),
    records = deliveryRunner(journal).records,
    firstRun = store.inspect(digest),
    successor = records.at(-1)?.request ?? '',
    receipt = JSON.parse(store.files.read(`delivery/continuations/${run}/2.json`) ?? 'null')
  report.first = {
    stages: firstRun.stages.map((stage) => [stage.id, stage.status]),
    ci: firstRun.stages.find((stage) => stage.id === 'ci')?.status ?? null,
  }
  report.continuation = receipt
    ? { authority: receipt.authority, operator: receipt.operator, revision: receipt.revision }
    : null
  report.second =
    successor && successor !== digest
      ? {
          state: last.state,
          outcome: last.outcome ?? null,
          stages: last.stages.map((stage) => [stage.id, stage.status]),
          grant: store.get(successor).grant === request.grant ? 'same-envelope-grant' : 'other',
        }
      : null
  const secondCi = last.stages.find((stage) => stage.id === 'ci')?.status
  report.passed =
    report.first !== null &&
    (report.first as { ci: string | null }).ci === 'failed' &&
    receipt?.authority === 'envelope-grant-continuation' &&
    successor !== digest &&
    secondCi === 'passed'
  report.publication = secondCi === 'passed' ? 'host-observed' : 'not-observed'
  const published = JSON.parse(
    command(gh, [
      'pr',
      'list',
      '--repo',
      TRIAL_REPOSITORY,
      '--base',
      CI_TRIAL_BRANCH,
      '--state',
      'open',
      '--json',
      'number,url,headRefOid',
    ]),
  ) as { number: number; url: string; headRefOid: string }[]
  report.pullRequests = published
  if (!report.passed) process.exitCode = 1
} catch (error) {
  report.error = error instanceof Error ? error.message : 'CI correction trial failed'
  process.exitCode = 1
} finally {
  report.seconds = Math.round((Date.now() - started) / 1000)
  mkdirSync(join(dir, 'results'), { recursive: true })
  writeFileSync(join(dir, 'results', 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report))
}
