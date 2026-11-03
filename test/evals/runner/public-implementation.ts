import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { NativeRuntime } from '../../../src/delivery/native-runtime.js'
import { DockerCli } from '../../../src/environment/docker-command.js'
import { EnvironmentLifecycle } from '../../../src/environment/lifecycle.js'
import { EnvironmentResources } from '../../../src/environment/runtime.js'
import { composePublicHost } from '../../../src/runner/public-composition.js'
import { runnerRoute } from '../../../src/runner/route.js'
import {
  DELEGATED,
  prepareSuiteRecipe,
  publicBindings,
  REPOSITORY,
  SEED,
  SYNTHETIC_CODEX,
  toPr,
} from '../../support/public-implementation.js'
import { runnerGitFixture } from '../../support/runner-git.js'

/**
 * ADR-0207, increments 4 and 5: the composed public to-pr host runs plan
 * through acceptance with a synthetic client behind the real Codex observer and
 * real Docker unit and product QA. It certifies no model, containment or
 * product; acceptance is a synthetic delegated decision.
 */
const destination = process.argv[2]
if (!destination) throw new Error('Provide an external evidence directory')
mkdirSync(destination, { recursive: true })
const dir = realpathSync(destination),
  log = join(dir, 'calls.jsonl'),
  report = {
    status: 'failed',
    scope:
      'Composed public to-pr host from plan to acceptance: synthetic native client behind the real Codex observer, real owned Docker unit and product QA. No model, containment or publication is certified, and acceptance is a synthetic delegated decision.',
    stages: [] as { id: string; status: string; provenance: string }[],
    launches: 0,
    environments: [] as { id: string; retirement: string }[],
    reason: '',
    acceptance: 'not-established',
    publication: 'not-performed',
  }
mkdirSync(join(dir, 'bin'), { recursive: true })
mkdirSync(join(dir, 'codex-home'), { recursive: true, mode: 0o700 })
writeFileSync(join(dir, 'bin', 'codex'), SYNTHETIC_CODEX(log))
chmodSync(join(dir, 'bin', 'codex'), 0o700)
try {
  await runnerGitFixture(
    async ({ store, request, dispatch, observe, root }) => {
      const driver = new DockerCli(),
        // Pinned, never provisioned here: each verification round provisions its own.
        recipe = prepareSuiteRecipe(store.files.root, root),
        runtime: NativeRuntime = {
          schema: 'wholeloop/native-runtime@1',
          clients: [
            { target: 'codex', client: join(dir, 'bin', 'codex'), store: join(dir, 'codex-home') },
          ],
          repositories: [REPOSITORY(recipe)],
          // Publication is not dispatched here; the binary is never run.
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
      if (!host) throw new Error('The route through acceptance must compose')
      for (const id of [
        'plan',
        'acceptance-definition',
        'workspace:search',
        'build-plan:search',
        'implementation:search',
        'commit:search',
        'verification:search',
        'review:search',
        'reverification:search',
        'integration:feature',
        'acceptance',
      ]) {
        const context = dispatch(id),
          observed = await host.execute(context)
        report.stages.push({ id, status: observed.status, provenance: observed.provenance })
        assert.equal(observed.status, 'passed', `${id}: ${observed.reason}`)
        observe(observed)
      }
      const calls = readFileSync(log, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as string[])
      report.launches = calls.filter((args) => args.includes('exec')).length
      // Every launch, gate workers included, was preceded by the observer's controls.
      assert.equal(calls.filter((args) => args.includes('sandbox')).length, 2 * report.launches)
      assert.equal(calls.filter((args) => args.includes('login')).length, report.launches)
      const owned = new EnvironmentResources(store.files)
        .list()
        .filter((entry) => entry.record.run === request.run)
      // One unit environment (the re-entry attested the same head) and one
      // product environment for the integrated milestone.
      assert.equal(owned.filter((entry) => entry.record.recipe === recipe).length, 1)
      assert.equal(owned.length, 2)
      for (const entry of owned) {
        const item = { id: entry.record.id, retirement: 'not-requested' }
        if (process.argv.includes('--retire-success')) {
          const retired = await new EnvironmentLifecycle(store.files, driver).execute({
            schema: 'wholeloop/environment-lifecycle-request@1',
            id: `public-implementation-retire-${entry.record.id.slice(-8)}`,
            environment: entry.record.id,
            expected: entry.digest,
            action: 'retire',
            reason:
              'Retire this exact disposable unit environment after retaining its observations.',
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
      configure: (plan, files) => toPr(plan, files),
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
