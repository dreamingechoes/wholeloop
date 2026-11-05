import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { NativeRuntime } from '../../../src/delivery/native-runtime.js'
import { DockerCli } from '../../../src/environment/docker-command.js'
import { EnvironmentLifecycle } from '../../../src/environment/lifecycle.js'
import { EnvironmentResources } from '../../../src/environment/runtime.js'
import { continueCiDelivery } from '../../../src/runner/ci-continuation.js'
import { originalCiFailure } from '../../../src/runner/ci-failure.js'
import type { RunnerCiHost } from '../../../src/runner/ci-observations.js'
import { DeliveryRunner } from '../../../src/runner/engine.js'
import { RunnerGitStages } from '../../../src/runner/git-stages.js'
import {
  composeInstalledImplementation,
  composePublicHost,
  runtimeGithub,
} from '../../../src/runner/public-composition.js'
import { GithubCliCodeHost } from '../../../src/runner/publication-host.js'
import { runnerRoute } from '../../../src/runner/route.js'
import { RunnerStore } from '../../../src/runner/store.js'
import { verifyCiContinuation } from '../../support/ci-continuation.js'
import { authorization, mergePolicy } from '../../support/delivery.js'
import {
  DELEGATED,
  LOCAL_SSH,
  prepareSuiteRecipe,
  publicBindings,
  REPOSITORY,
  SEED,
  SYNTHETIC_CODEX,
  SYNTHETIC_GH,
  toPr,
} from '../../support/public-implementation.js'
import { runnerGitFixture } from '../../support/runner-git.js'

/** Fixed SDK CI continuation with synthetic native/host facts and actual Git/Docker. */
const destination = process.argv[2]
if (!destination) throw new Error('Provide an external evidence directory')
mkdirSync(destination, { recursive: true })
const dir = realpathSync(destination),
  log = join(dir, 'calls.jsonl'),
  report = {
    status: 'failed',
    store: '',
    run: '',
    cleanupFailures: [] as string[],
    scope:
      'Installed SDK CI correction: original code-test failure, a new exact-plan grant, complete bodyless feedback admission, published-head rebuild, independent Docker QA and original-topic/PR non-force publication followed by a fresh fixture CI read of the actual pushed commit file. Merge stays blocked and is not granted. Synthetic native client and host facts certify no native/model, GitHub, containment or hosted behavior. The public to-merge route remains unsupported.',
    first: { state: '', outcome: null as string | null, failed: '' },
    second: {
      state: '',
      outcome: null as string | null,
      correction: '',
      stages: 0,
      seededAtPublishedHead: false,
      ci: '',
      publication: '',
      admission: '',
    },
    pullRequest: null as { url: string; head: string; status: string } | null,
    retiredBeforeContinuation: 0,
    environments: [] as { id: string; retirement: string }[],
    reason: '',
    acceptance: 'not-established',
    publication: 'not-performed' as string,
  }
mkdirSync(join(dir, 'bin'), { recursive: true })
mkdirSync(join(dir, 'codex-home'), { recursive: true, mode: 0o700 })
writeFileSync(join(dir, 'bin', 'codex'), SYNTHETIC_CODEX(log, 'ci-correction'))
chmodSync(join(dir, 'bin', 'codex'), 0o700)
try {
  const bare = join(dir, 'remote.git')
  execFileSync('git', ['init', '--quiet', '--bare', bare])
  writeFileSync(join(dir, 'bin', 'ssh'), LOCAL_SSH(bare))
  const syntheticGh = SYNTHETIC_GH(join(dir, 'pulls.json'), bare, join(dir, 'gh.jsonl'))
    .replace('const load=()=>fs.existsSync(', 'const load=()=>sync(fs.existsSync(')
    .replace("'utf8')):[],save=v=>", "'utf8')):[]),save=v=>")
    .replace(
      "if(args[0]==='pr'",
      "const sync=v=>{for(const p of v)p.head.sha=cp.execFileSync('git',['--git-dir'," +
        JSON.stringify(bare) +
        ",'rev-parse','refs/heads/'+p.head.ref],{encoding:'utf8'}).trim();return v};\nif(args[0]==='pr'",
    )
    .replace(
      "if(method==='GET'&&endpoint.startsWith('repos/fixture/app/pulls?'))",
      "if(method==='GET'&&/^repos\\/fixture\\/app\\/pulls\\/[1-9][0-9]*$/.test(endpoint)){const p=load().find(p=>p.number===Number(endpoint.split('/').at(-1)));if(!p)process.exit(1);console.log(JSON.stringify(p));process.exit(0)}\nif(method==='GET'&&/^repos\\/fixture\\/app\\/(issues|pulls)\\/[1-9][0-9]*\\/(comments|reviews)\\?per_page=100&page=[1-3]$/.test(endpoint)){console.log('[]');process.exit(0)}\nif(method==='GET'&&endpoint.startsWith('repos/fixture/app/pulls?'))",
    )
  writeFileSync(join(dir, 'bin', 'gh'), syntheticGh)
  chmodSync(join(dir, 'bin', 'ssh'), 0o700)
  chmodSync(join(dir, 'bin', 'gh'), 0o700)
  process.env.GIT_SSH_COMMAND = join(dir, 'bin', 'ssh')
  await runnerGitFixture(
    async ({ store, request, digest, root }) => {
      report.store = store.files.root
      report.run = request.run
      const driver = new DockerCli(),
        recipe = prepareSuiteRecipe(store.files.root, root),
        runtime: NativeRuntime = {
          schema: 'wholeloop/native-runtime@1',
          clients: [
            { target: 'codex', client: join(dir, 'bin', 'codex'), store: join(dir, 'codex-home') },
          ],
          repositories: [REPOSITORY(recipe)],
          codeHost: { kind: 'github-cli', client: join(dir, 'bin', 'gh') },
        },
        compose = (current: typeof request) => {
          const plan = store.basis(current).plan,
            input = {
              store,
              request: current,
              plan,
              stages: runnerRoute(plan),
              configuration: { bindings: publicBindings, runtime },
            },
            ci: RunnerCiHost = {
              observe: async (target, pr) => ({
                schema: 'wholeloop/delivery-ci@1',
                codeHost: 'github',
                repository: 'https://github.com/fixture/app',
                pr,
                candidate: target.head,
                head: target.head,
                base: target.base,
                observedAt: new Date().toISOString(),
                complete: true,
                checks: [
                  {
                    name: 'test',
                    issuer: 'github-app:15368',
                    attempt: 1,
                    head: target.head,
                    status: 'completed',
                    conclusion:
                      execFileSync(
                        'git',
                        ['--git-dir', bare, 'show', `${target.head}:ci-status.txt`],
                        { encoding: 'utf8' },
                      ).trim() === 'passed'
                        ? 'success'
                        : 'failure',
                  },
                ],
                protection: {
                  status: 'observed',
                  required: [{ name: 'test', issuer: 'github-app:15368' }],
                },
                reviews: { status: 'observed', required: 0, approvals: 0 },
                provenance: 'host-observed',
              }),
            }
          assert.equal(
            composePublicHost(input),
            undefined,
            'The public route must not acquire merge capability.',
          )
          const host = composeInstalledImplementation(input, {
            ci: { identity: current.host, host: ci },
            merge: {
              identity: current.host,
              ci,
              runtime: { allowsMerge: true },
              facts: {
                provenance: 'host-observed',
                facts: async (target) => ({
                  state: 'open',
                  draft: false,
                  head: target.head,
                  base: target.base,
                  mergeable: 'unknown',
                  files: ['app.txt', 'status.txt', 'ci-status.txt'],
                  unresolvedDiscussions: 0,
                  allowedMethods: ['squash'],
                  baseCurrent: true,
                  observedAt: new Date().toISOString(),
                }),
              },
              merge: {
                provenance: 'host-observed',
                actor: async () => {
                  throw new Error('Merge actor must never be read')
                },
                read: async (target) => ({ state: 'open', head: target.head }),
                merge: async () => {
                  throw new Error('Merge must never execute')
                },
              },
            },
          })
          if (!host) throw new Error('The explicitly installed SDK route must compose')
          return host
        }
      const owned = store.record(digest)
      if (!owned.controller) throw new Error('Fixture owner missing')
      store.release(
        { request: digest, controller: owned.controller, generation: owned.generation },
        'Hand the public to-pr route to its actual engine.',
      )
      // First run: product QA passes; the fixed synthetic required CI check fails.
      const first = await new DeliveryRunner(store).run(digest, compose(request)),
        failure = first.stages.find((stage) => stage.id === 'ci')
      report.first = {
        state: first.state,
        outcome: first.outcome ?? null,
        failed: failure?.id ?? '',
      }
      assert.equal(
        failure?.status,
        'failed',
        JSON.stringify(first.stages.map((s) => [s.id, s.status])),
      )
      const failedHead = originalCiFailure(store, {
        request: digest,
        failure: failure?.evidence ?? '',
        repository: 'app',
      }).target.head
      assert.equal(
        execFileSync('git', ['--git-dir', bare, 'show', `${failedHead}:ci-status.txt`], {
          encoding: 'utf8',
        }),
        'failed',
      )
      // The failed run's environments stay alive as evidence and hold Docker
      // capacity. The operator retires them explicitly (observations are kept)
      // before recording the correction revision.
      for (const entry of new EnvironmentResources(store.files)
        .list()
        .filter((item) => item.record.run === request.run && item.record.state !== 'retired')) {
        const retired = await new EnvironmentLifecycle(store.files, driver).execute({
          schema: 'wholeloop/environment-lifecycle-request@1',
          id: `public-continuation-failed-${entry.record.id.slice(-8)}`,
          environment: entry.record.id,
          expected: entry.digest,
          action: 'retire',
          reason: 'Retire the failed run environment after retaining its observations.',
        })
        assert.equal(retired.state, 'retired', JSON.stringify(retired))
        report.retiredBeforeContinuation++
      }
      // The operator records the correction revision; a new exact-plan grant opens it.
      const continued = continueCiDelivery(
        store.lifecycle,
        request.run,
        { request: digest, unit: 'search' },
        {
          operator: 'Fixture Operator',
          reason: 'Correct the original retained code-test failure.',
        },
      )
      assert.equal(continued.accepted, true, JSON.stringify(continued.admission))
      const next = store.planning.getPlan(request.run, 2),
        base = authorization(next.plan, next.digest),
        grant = store.lifecycle.authority.authorize({
          ...base,
          id: 'authorization-fedcba9876543210',
          decisions: [...DELEGATED],
          effects: [...base.effects, 'git.push', 'pr.create', 'pr.ready'],
        })
      store.lifecycle.track({ run: request.run, revision: 2, grant: grant.grant.id })
      const successor = store.prepare({
          ...request,
          key: 'continuation-1',
          revision: 2,
          plan: next.digest,
          grant: grant.grant.id,
        }),
        second = await new DeliveryRunner(store).run(
          successor.digest,
          compose(store.get(successor.digest)),
        ),
        correction = second.stages.find((stage) => stage.id === 'correction-1:search')
      report.second = {
        state: second.state,
        outcome: second.outcome ?? null,
        correction: correction?.status ?? '',
        stages: second.stages.length,
        ci: second.stages.find((stage) => stage.id === 'ci')?.status ?? '',
        publication: second.stages.find((stage) => stage.id === 'publication')?.status ?? '',
        admission:
          second.stages.find((stage) => stage.id === 'ci-correction-admission')?.status ?? '',
        seededAtPublishedHead:
          new RunnerGitStages(store).workspace(store.get(successor.digest), 'search').seed?.head ===
          failedHead,
      }
      assert.equal(report.second.seededAtPublishedHead, true)
      assert.equal(
        second.state,
        'blocked',
        JSON.stringify(second.stages.map((s) => [s.id, s.status])),
      )
      assert.equal(report.second.ci, 'passed')
      assert.equal(report.second.publication, 'passed')
      assert.equal(report.second.admission, 'passed')
      assert.equal(second.stages.find((stage) => stage.id === 'merge')?.status, 'blocked')
      assert.equal(correction?.status, 'passed')
      const verified = await verifyCiContinuation({
        store,
        first: digest,
        second: successor.digest,
        bare,
        host: new GithubCliCodeHost(runtimeGithub(join(dir, 'bin', 'gh'))),
      })
      report.pullRequest = { url: verified.pr, head: verified.head, status: verified.application }
      report.publication = 'original-pr-updated-and-still-ready'
      const environments = new EnvironmentResources(store.files)
        .list()
        .filter((entry) => entry.record.run === request.run && entry.record.state !== 'retired')
      for (const entry of environments) {
        const item = { id: entry.record.id, retirement: 'not-requested' }
        if (process.argv.includes('--retire-success')) {
          const retired = await new EnvironmentLifecycle(store.files, driver).execute({
            schema: 'wholeloop/environment-lifecycle-request@1',
            id: `public-continuation-retire-${entry.record.id.slice(-8)}`,
            environment: entry.record.id,
            expected: entry.digest,
            action: 'retire',
            reason: 'Retire this exact disposable environment after retaining its observations.',
          })
          assert.equal(retired.state, 'retired', JSON.stringify(retired))
          item.retirement = 'observed-retired'
        }
        report.environments.push(item)
      }
    },
    {
      singleUnit: true,
      stageBudget: 'plan',
      retain: true,
      seed: SEED,
      decisions: [...DELEGATED],
      effects: ['git.push', 'pr.create', 'pr.ready'],
      configure: (plan, files) => {
        toPr(plan, files, 'ssh')
        plan.policy.endpoint = 'to-merge'
        plan.policy.merge = mergePolicy()
        plan.budgets.attemptMs = 240000
        plan.budgets.wallTimeMs = 1800000
      },
    },
  )
  report.status = 'passed'
} catch (error) {
  report.reason =
    error instanceof Error ? error.message : 'Installed CI continuation evaluation failed'
  process.exitCode = 1
} finally {
  if (process.argv.includes('--retire-success') && report.store && report.run) {
    try {
      const store = new RunnerStore(report.store),
        driver = new DockerCli()
      for (const entry of new EnvironmentResources(store.files)
        .list()
        .filter((value) => value.record.run === report.run && value.record.state !== 'retired')) {
        try {
          const retired = await new EnvironmentLifecycle(store.files, driver).execute({
            schema: 'wholeloop/environment-lifecycle-request@1',
            id: `ci-continuation-final-${entry.record.id.slice(-8)}`,
            environment: entry.record.id,
            expected: entry.digest,
            action: 'retire',
            reason:
              'Retire this exact disposable trial environment after preserving success or failure evidence.',
          })
          if (retired.state !== 'retired') report.cleanupFailures.push(entry.record.id)
          else report.environments.push({ id: entry.record.id, retirement: 'observed-retired' })
        } catch {
          report.cleanupFailures.push(entry.record.id)
        }
      }
    } catch {
      report.cleanupFailures.push('original-environment-list-unavailable')
    }
    if (report.cleanupFailures.length) {
      report.status = 'failed'
      process.exitCode = 1
    }
  }
  writeFileSync(join(dir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report))
}
