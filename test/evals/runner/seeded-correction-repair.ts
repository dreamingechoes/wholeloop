import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DeliveryAcceptance } from '../../../src/acceptance/store.js'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { sourceHash } from '../../../src/delivery/input.js'
import { DockerCli } from '../../../src/environment/docker-command.js'
import { DOCKER_REFERENCE_HELPER } from '../../../src/environment/docker-policy.js'
import { EnvironmentLifecycle } from '../../../src/environment/lifecycle.js'
import { DeliveryEnvironments } from '../../../src/environment/provision.js'
import { FlowEngine } from '../../../src/flow/engine.js'
import { workspaceSnapshot } from '../../../src/gates/snapshot.js'
import { RunnerNativeScope } from '../../../src/runner/native-scope.js'
import { RunnerRepairCommits } from '../../../src/runner/repair-commits.js'
import { RunnerRepairWorkers } from '../../../src/runner/repair-workers.js'
import { RunnerVerificationStages } from '../../../src/runner/verification-stages.js'
import { StateStore } from '../../../src/state/store.js'
import { environmentRecipe } from '../../support/environment.js'
import { gateWorkerFixture } from '../../support/gate-worker.js'
import { runnerCorrectionFixture } from '../../support/runner-correction.js'

const destination = process.argv[2]
if (!destination) throw new Error('Provide an external evidence directory')
mkdirSync(destination, { recursive: true })
const expected = 'Verified correction output.\n',
  app =
    "require('node:http').createServer((_q,r)=>r.end('owned verification fixture')).listen(3000,'0.0.0.0')\n",
  suite = `const fs=require('node:fs');process.exitCode=fs.readFileSync('app.txt','utf8')===${JSON.stringify(expected)}?0:7\n`,
  pkg = JSON.stringify({ private: true, scripts: { check: 'node suite.cjs' } }),
  report = {
    status: 'failed',
    scope:
      'Actual seeded owned Git production and two Docker verification suites, with synthetic builders and independent judges. No native/model, containment or hosted endpoint acceptance.',
    store: '',
    checks: [] as { id: string; evidence: string }[],
    environments: [] as { id: string; retirement: string }[],
    reason: '',
  }
let acceptance = '',
  recipe = ''
const check = (id: string, value: unknown) => {
  report.checks.push({ id, evidence: contractDigest(value) })
  console.log(`Observed: ${id}`)
}
try {
  await runnerCorrectionFixture(
    async ({ store, request, host, production, dispatch, observe, root }) => {
      report.store = store.files.root
      const context = dispatch('verification:search'),
        abort = new AbortController(),
        timer = setTimeout(() => abort.abort(), 240000),
        driver = new DockerCli(),
        environments = new DeliveryEnvironments(store.files.root, driver),
        original = host.candidate(request, 'search'),
        provision = async (key: string, head: string) => {
          const result = await environments.provision({
            schema: 'wholeloop/environment-provision-request@1',
            run: request.run,
            recipe,
            key,
            helperImage: DOCKER_REFERENCE_HELPER,
            workspaces: [
              {
                repository: 'app',
                path: original.allocation.repository.path,
                head,
                snapshot: workspaceSnapshot(original.allocation.repository.path).digest,
              },
            ],
          })
          assert.equal(result.status, 'ready', JSON.stringify(result))
          assert.ok(result.environment)
          const id = result.environment.record.id
          report.environments.push({ id, retirement: 'not-requested' })
          store.lifecycle.transition(request.run, {
            to: 'queued',
            reason: 'Observe original ready verification environment before its exact suite.',
          })
          return id
        }
      context.signal = abort.signal
      context.deadline = new Date(
        Math.min(Date.parse(context.deadline), Date.now() + 240000),
      ).toISOString()
      try {
        const environment = await provision('seeded-first-suite', original.receipt.head),
          selection = {
            acceptance,
            environment,
            refs: ['package.json#check'],
            // Include owned Docker preparation; the application command remains five seconds.
            timeoutMs: 30000,
            // Selection maps to the pinned case ID, not its recipe command ID.
            mapping: { 'package.json#check': 'declared-suite' },
          },
          settings = store.files.path('seeded-verification-settings.json')
        writeFileSync(settings, JSON.stringify({ version: 1, gates: { verify: { rounds: 2 } } }))
        const engine = new FlowEngine(
            new StateStore(store.files.root),
            root,
            settings,
            store.files.path('fixture-home'),
          ),
          verification = new RunnerVerificationStages(store, {
            identity: request.host,
            engine: () => engine,
            suite: () => selection,
            driver,
            gate: gateWorkerFixture(
              store,
              original.allocation.repository.path,
              'valid',
              'host-observed',
            ),
          }),
          first = await verification.execute(context)
        assert.equal(first.status, 'blocked', JSON.stringify(first))
        const scope = new RunnerNativeScope(store.files, context.invocation)
        assert.equal(scope.calls().length, 0)
        check('original-actual-suite-fails-before-independent-judges', first)
        const workers = new RunnerRepairWorkers(store, production.queue, production.options),
          produced = await workers.execute(verification, context)
        assert.equal(produced.status, 'produced', JSON.stringify(produced))
        assert.equal(produced.qa, 'pending')
        const checkpoint = new RunnerRepairCommits(workers),
          committed = await checkpoint.execute(context)
        assert.equal(committed.status, 'committed', JSON.stringify(committed))
        if (!('receipt' in committed)) throw new Error('Original repair receipt required')
        assert.equal(committed.receipt.parent, original.receipt.head)
        check('fresh-suite-failure-repaired-on-exact-seeded-correction-root', committed)
        // Release only this already observed failed environment before the next
        // captured candidate. This is explicit fixture lifecycle, not automatic cleanup.
        const lifecycle = new EnvironmentLifecycle(store.files, driver),
          stopped = await lifecycle.execute({
            schema: 'wholeloop/environment-lifecycle-request@1',
            id: 'seeded-verification-stop',
            environment,
            expected: lifecycle.records.get(environment).digest,
            action: 'stop',
            reason: 'Release this exact failed-suite fixture after retaining its original proof.',
          })
        assert.equal(stopped.state, 'retained', JSON.stringify(stopped))
        const nextEnvironment = await provision('seeded-repaired-suite', committed.receipt.head),
          continued = new RunnerVerificationStages(store, {
            ...verification.options,
            correction: checkpoint,
            suite: () => ({ ...selection, environment: nextEnvironment }),
          }),
          result = await continued.advance(context)
        assert.equal(result.status, 'passed', JSON.stringify(result))
        assert.notEqual(environment, nextEnvironment)
        assert.ok(scope.calls().length > 0)
        observe(result)
        assert.equal(
          new DeliveryAcceptance(store.files.root).pinnedFor(request.run, request.revision).digest,
          acceptance,
        )
        assert.equal(
          readFileSync(join(original.allocation.repository.path, 'suite.cjs'), 'utf8'),
          suite,
        )
        check(
          'unchanged-definition-and-new-candidate-pass-actual-suite-and-independent-fixture-judgments',
          result,
        )
        const calls = scope.calls().length,
          journal = contractDigest(store.lifecycle.journal.events()),
          reopened = RunnerRepairCommits.reopen(
            new RunnerRepairWorkers(store, production.queue, production.options),
            request,
            'search',
          )
        assert.equal(
          host.candidate(request, 'search', reopened).receipt.digest,
          committed.receipt.digest,
        )
        assert.equal(contractDigest(store.lifecycle.journal.events()), journal)
        assert.equal(scope.calls().length, calls)
        check('fresh-fixed-checkpoint-reopens-without-worker-or-journal-replay', committed.receipt)
        if (process.argv.includes('--retire-success')) {
          for (const entry of report.environments) {
            const receipt = await lifecycle.execute({
              schema: 'wholeloop/environment-lifecycle-request@1',
              id: 'seeded-verification-retire',
              environment: entry.id,
              expected: lifecycle.records.get(entry.id).digest,
              action: 'retire',
              reason:
                'Retire the exact seeded-verification fixture after retaining the observations.',
            })
            assert.equal(receipt.state, 'retired', JSON.stringify(receipt))
            entry.retirement = 'retired'
          }
          check(
            'exact-owned-environments-retired-with-original-proof-preserved',
            report.environments,
          )
        }
        report.status = 'passed'
      } finally {
        clearTimeout(timer)
      }
    },
    {
      restarts: 3,
      retain: true,
      seed: { 'app.cjs': app, 'suite.cjs': suite, 'package.json': pkg },
      repairText: { 4: expected },
      beforeBuild({ store, request, plan, root }) {
        acceptance = new DeliveryAcceptance(store.files.root).prepare({
          schema: 'wholeloop/acceptance-plan@1',
          run: request.run,
          revision: request.revision,
          plan: request.plan,
          source: plan.source,
          cases: [
            {
              id: 'declared-suite',
              criteria: ['search'],
              owner: 'machine',
              applicability: 'applicable',
              rationale: 'Observe the immutable declared command against each exact candidate.',
              initial: 'The owned service is ready.',
              actions: ['Run the declared repository check.'],
              assertions: [
                {
                  id: 'exit',
                  subject: 'exit',
                  operator: 'equals',
                  expected: '0',
                  description: 'The actual declared command exits zero.',
                },
              ],
              failureConditions: ['An observed nonzero exit fails the unchanged check.'],
              runner: {
                kind: 'cli',
                capability: 'process.exec',
                input: JSON.stringify({
                  schema: 'wholeloop/behavior-input@1',
                  kind: 'cli',
                  service: 'web',
                  command: 'suite',
                }),
              },
              fixture: { ref: 'fixture:seeded-verification', sha256: sourceHash(suite) },
              timeoutMs: 30000,
            },
          ],
          retention: { reviewAfterMs: 86400000, expiryAction: 'retain' },
        }).digest
        const definition = environmentRecipe(root, app, process.arch === 'x64' ? 'amd64' : 'arm64')
        definition.data = []
        for (const service of definition.services)
          service.mounts = service.mounts.filter((mount) => mount.kind !== 'data')
        definition.files.push(
          {
            id: 'package',
            repository: 'app',
            ref: 'package.json',
            sha256: sourceHash(pkg),
            kind: 'package',
          },
          {
            id: 'suite',
            repository: 'app',
            ref: 'suite.cjs',
            sha256: sourceHash(suite),
            kind: 'script',
          },
        )
        definition.commands.push({
          id: 'suite',
          service: 'web',
          phase: 'test',
          command: {
            argv: ['npm', 'run', 'check'],
            cwd: '/workspace/app',
            origin: { kind: 'package-script', file: 'package', script: 'check' },
          },
          timeoutMs: 5000,
        })
        recipe = new DeliveryEnvironments(store.files.root).recipes.prepare(definition).digest
      },
    },
  )
} catch (error) {
  report.reason = error instanceof Error ? error.message : 'Seeded verification repair failed'
  process.exitCode = 1
} finally {
  writeFileSync(join(destination, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report, null, 2))
}
