import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { NativeRuntime } from '../../../src/delivery/native-runtime.js'
import { DockerCli } from '../../../src/environment/docker-command.js'
import { EnvironmentLifecycle } from '../../../src/environment/lifecycle.js'
import { EnvironmentResources } from '../../../src/environment/runtime.js'
import { continueDelivery } from '../../../src/runner/continuation.js'
import { DeliveryRunner } from '../../../src/runner/engine.js'
import { RunnerGitStages } from '../../../src/runner/git-stages.js'
import { composePublicHost } from '../../../src/runner/public-composition.js'
import { runnerRoute } from '../../../src/runner/route.js'
import { authorization } from '../../support/delivery.js'
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

/**
 * ADR-0208, increment 4: a none-policy to-pr run whose product QA fails is
 * continued by an operator under a new exact-plan grant. The real engine then
 * seeds the unit at its failed head, rebuilds it, corrects it from the
 * retained failure and completes the route to a ready PR. Synthetic client
 * behind the real Codex observer, real Docker QA, real Git; nothing certified.
 */
const destination = process.argv[2]
if (!destination) throw new Error('Provide an external evidence directory')
mkdirSync(destination, { recursive: true })
const dir = realpathSync(destination),
  log = join(dir, 'calls.jsonl'),
  report = {
    status: 'failed',
    scope:
      'Composed public to-pr continuation: a failed product QA, an operator-recorded correction revision under a new grant, then seeded rebuild, correction and completion. Synthetic native client behind the real Codex observer, real owned Docker QA, real Git push to a local bare repository and a synthetic gh. No model, containment or GitHub behavior is certified.',
    first: { state: '', outcome: null as string | null, failed: '' },
    second: {
      state: '',
      outcome: null as string | null,
      correction: '',
      stages: 0,
      seededAtFailedHead: false,
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
writeFileSync(join(dir, 'bin', 'codex'), SYNTHETIC_CODEX(log, 'correction'))
chmodSync(join(dir, 'bin', 'codex'), 0o700)
try {
  const bare = join(dir, 'remote.git')
  execFileSync('git', ['init', '--quiet', '--bare', bare])
  writeFileSync(join(dir, 'bin', 'ssh'), LOCAL_SSH(bare))
  writeFileSync(
    join(dir, 'bin', 'gh'),
    SYNTHETIC_GH(join(dir, 'pulls.json'), bare, join(dir, 'gh.jsonl')),
  )
  chmodSync(join(dir, 'bin', 'ssh'), 0o700)
  chmodSync(join(dir, 'bin', 'gh'), 0o700)
  process.env.GIT_SSH_COMMAND = join(dir, 'bin', 'ssh')
  await runnerGitFixture(
    async ({ store, request, digest, root }) => {
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
            host = composePublicHost({
              store,
              request: current,
              plan,
              stages: runnerRoute(plan),
              configuration: { bindings: publicBindings, runtime },
            })
          if (!host) throw new Error('The to-pr route must compose')
          return host
        }
      const owned = store.record(digest)
      if (!owned.controller) throw new Error('Fixture owner missing')
      store.release(
        { request: digest, controller: owned.controller, generation: owned.generation },
        'Hand the public to-pr route to its actual engine.',
      )
      // First run: the build writes a wrong status, so product QA fails.
      const first = await new DeliveryRunner(store).run(digest, compose(request)),
        failure = first.stages.find((stage) => stage.id.startsWith('integration:'))
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
      const failedHead = new RunnerGitStages(store).candidate(request, 'search').receipt.head
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
      const continued = continueDelivery(
        store.lifecycle,
        request.run,
        { request: digest, stage: failure?.id ?? '', unit: 'search' },
        { operator: 'Fixture Operator', reason: 'Correct the failed product QA case.' },
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
        seededAtFailedHead:
          new RunnerGitStages(store).workspace(store.get(successor.digest), 'search').seed?.head ===
          failedHead,
      }
      assert.equal(report.second.seededAtFailedHead, true)
      assert.equal(
        second.state,
        'completed',
        JSON.stringify(second.stages.map((s) => [s.id, s.status])),
      )
      assert.equal(second.outcome, 'ready-pr')
      assert.equal(correction?.status, 'passed')
      const pulls = JSON.parse(readFileSync(join(dir, 'pulls.json'), 'utf8')) as {
          html_url: string
          head: { ref: string; sha: string }
          draft: boolean
        }[],
        [pull] = pulls
      assert.equal(pulls.length, 1)
      assert.ok(pull)
      const status = execFileSync(
        'git',
        ['--git-dir', bare, 'show', `${pull.head.sha}:status.txt`],
        {
          encoding: 'utf8',
        },
      )
      // The published head carries the correction, not the failed build.
      assert.equal(status, 'public fixture')
      report.pullRequest = { url: pull.html_url, head: pull.head.sha, status }
      report.publication = pull.draft ? 'draft-opened' : 'opened-and-readied'
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
      configure: (plan, files) => toPr(plan, files, 'ssh'),
    },
  )
  report.status = 'passed'
} catch (error) {
  report.reason = error instanceof Error ? error.message : 'Public continuation evaluation failed'
  process.exitCode = 1
} finally {
  writeFileSync(join(dir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report))
}
