import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { NativeRuntime } from '../../../src/delivery/native-runtime.js'
import { DockerCli } from '../../../src/environment/docker-command.js'
import { EnvironmentLifecycle } from '../../../src/environment/lifecycle.js'
import { EnvironmentResources } from '../../../src/environment/runtime.js'
import { DeliveryRunner } from '../../../src/runner/engine.js'
import { composePublicHost } from '../../../src/runner/public-composition.js'
import { runnerRoute } from '../../../src/runner/route.js'
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
 * ADR-0207, increment 7: the real engine runs the composed public to-pr
 * route from plan to handoff with a synthetic client behind the real Codex
 * observer, real Docker unit and product QA, and real Git publication to a
 * local bare repository. It certifies no model, containment, GitHub behavior
 * or product; acceptance is a synthetic delegated decision.
 */
const destination = process.argv[2]
if (!destination) throw new Error('Provide an external evidence directory')
mkdirSync(destination, { recursive: true })
const dir = realpathSync(destination),
  log = join(dir, 'calls.jsonl'),
  ghLog = join(dir, 'gh.jsonl'),
  report = {
    status: 'failed',
    scope:
      'The real engine runs the composed public to-pr route from plan to handoff: synthetic native client behind the real Codex observer, real owned Docker unit and product QA, real Git push to a local bare repository behind an SSH-form GitHub remote, and a synthetic gh. No model, containment, GitHub behavior or hosted publication is certified; acceptance is a synthetic delegated decision.',
    state: '' as string,
    outcome: null as string | null,
    stages: [] as { id: string; status: string; provenance: string }[],
    launches: 0,
    pullRequest: null as { url: string; branch: string; head: string } | null,
    github: [] as string[],
    environments: [] as { id: string; retirement: string }[],
    reason: '',
    acceptance: 'not-established',
    publication: 'not-performed' as string,
  }
mkdirSync(join(dir, 'bin'), { recursive: true })
mkdirSync(join(dir, 'codex-home'), { recursive: true, mode: 0o700 })
writeFileSync(join(dir, 'bin', 'codex'), SYNTHETIC_CODEX(log))
chmodSync(join(dir, 'bin', 'codex'), 0o700)
try {
  // A local bare repository behind an SSH-form GitHub remote: real Git
  // transport, no network (ADR-0207, increment 7).
  const bare = join(dir, 'remote.git')
  execFileSync('git', ['init', '--quiet', '--bare', bare])
  writeFileSync(join(dir, 'bin', 'ssh'), LOCAL_SSH(bare))
  writeFileSync(join(dir, 'bin', 'gh'), SYNTHETIC_GH(join(dir, 'pulls.json'), bare, ghLog))
  chmodSync(join(dir, 'bin', 'ssh'), 0o700)
  chmodSync(join(dir, 'bin', 'gh'), 0o700)
  process.env.GIT_SSH_COMMAND = join(dir, 'bin', 'ssh')
  await runnerGitFixture(
    async ({ store, request, digest }) => {
      const driver = new DockerCli(),
        // Pinned, never provisioned here: each verification round provisions its own.
        recipe = prepareSuiteRecipe(
          store.files.root,
          store.basis(request).plan.repositories[0]?.root ?? '',
        ),
        runtime: NativeRuntime = {
          schema: 'wholeloop/native-runtime@1',
          clients: [
            { target: 'codex', client: join(dir, 'bin', 'codex'), store: join(dir, 'codex-home') },
          ],
          repositories: [REPOSITORY(recipe)],
          codeHost: { kind: 'github-cli', client: join(dir, 'bin', 'gh') },
        },
        plan = store.basis(request).plan,
        host = composePublicHost({
          store,
          request,
          plan,
          stages: runnerRoute(plan),
          configuration: { bindings: publicBindings, runtime },
        })
      if (!host) throw new Error('The whole to-pr route must compose')
      // The fixture's own controller hands the request to the real engine.
      const owned = store.record(digest)
      if (!owned.controller) throw new Error('Fixture owner missing')
      store.release(
        { request: digest, controller: owned.controller, generation: owned.generation },
        'Hand the public to-pr route to its actual engine.',
      )
      const receipt = await new DeliveryRunner(store).run(digest, host)
      report.state = receipt.state
      report.outcome = receipt.outcome ?? null
      for (const stage of store.record(digest).stages)
        report.stages.push({
          id: stage.id,
          status: stage.status,
          provenance: stage.provenance ?? 'unknown',
        })
      assert.equal(receipt.state, 'completed', JSON.stringify(report.stages))
      assert.equal(report.stages.length, runnerRoute(plan).length)
      assert.ok(report.stages.every((stage) => stage.status === 'passed'))
      // Intervention comes from controller state, never from a model's claim.
      assert.ok(
        !store.lifecycle.journal
          .events()
          .some(
            (event) => event.run === request.run && 'to' in event && event.to === 'waiting-input',
          ),
      )
      const calls = readFileSync(log, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as string[])
      report.launches = calls.filter((args) => args.includes('exec')).length
      // Every launch, gate workers included, was preceded by the observer's controls.
      assert.equal(calls.filter((args) => args.includes('sandbox')).length, 2 * report.launches)
      assert.equal(calls.filter((args) => args.includes('login')).length, report.launches)
      // One owned draft at the pushed head, readied once; nothing forced.
      const pulls = JSON.parse(readFileSync(join(dir, 'pulls.json'), 'utf8')) as {
          html_url: string
          head: { ref: string; sha: string }
          draft: boolean
        }[],
        [pull] = pulls
      assert.equal(pulls.length, 1)
      assert.ok(pull)
      assert.equal(
        execFileSync('git', ['--git-dir', bare, 'rev-parse', `refs/heads/${pull.head.ref}`], {
          encoding: 'utf8',
        }).trim(),
        pull.head.sha,
      )
      report.publication = pull.draft ? 'draft-opened' : 'opened-and-readied'
      report.pullRequest = { url: pull.html_url, branch: pull.head.ref, head: pull.head.sha }
      report.github = readFileSync(ghLog, 'utf8')
        .trim()
        .split('\n')
        .map((line) => {
          const args = JSON.parse(line) as string[],
            endpoint = args.find((arg) => arg.startsWith('repos/'))?.split('?')[0]
          return args[0] === 'api'
            ? `api ${args[args.indexOf('--method') + 1]} ${endpoint}`
            : args.slice(0, 2).join(' ')
        })
      const environments = new EnvironmentResources(store.files)
        .list()
        .filter((entry) => entry.record.run === request.run)
      // One unit environment (the re-entry attested the same head) and one
      // product environment for the integrated milestone.
      assert.equal(environments.filter((entry) => entry.record.recipe === recipe).length, 1)
      assert.equal(environments.length, 2)
      for (const entry of environments) {
        const item = { id: entry.record.id, retirement: 'not-requested' }
        if (process.argv.includes('--retire-success')) {
          const retired = await new EnvironmentLifecycle(store.files, driver).execute({
            schema: 'wholeloop/environment-lifecycle-request@1',
            id: `public-implementation-retire-${entry.record.id.slice(-8)}`,
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
  report.reason = error instanceof Error ? error.message : 'Public implementation evaluation failed'
  process.exitCode = 1
} finally {
  writeFileSync(join(dir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report))
}
