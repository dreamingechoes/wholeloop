import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { EnvironmentLifecycle } from '../../../src/environment/lifecycle.js'
import { DeliveryEnvironments } from '../../../src/environment/provision.js'
import { EnvironmentResources } from '../../../src/environment/runtime.js'
import { gateRuns } from '../../../src/gates/state.js'
import { GateWorkflow } from '../../../src/gates/workflow.js'
import { RunnerEnvironmentScope } from '../../../src/runner/environment-scope.js'
import { RunnerNativeScope } from '../../../src/runner/native-scope.js'
import { RunnerRepairCommits } from '../../../src/runner/repair-commits.js'
import { RunnerRepairWorkers } from '../../../src/runner/repair-workers.js'
import { RunnerSuiteStages } from '../../../src/runner/suite-stages.js'
import { RunnerVerificationStages } from '../../../src/runner/verification-stages.js'
import { runnerSuiteFixture } from '../../support/runner-suite.js'

const destination = process.argv[2]
if (!destination) throw new Error('Supply an external report directory')
const checks: string[] = []
await runnerSuiteFixture(
  async ({ store, context, engine, selection, driver, production }) => {
    assert.ok(production)
    console.log(`Retained original store: ${store.files.root}`)
    const abort = new AbortController(),
      timer = setTimeout(() => abort.abort(), 240000)
    context.signal = abort.signal
    context.deadline = new Date(
      Math.min(Date.parse(context.deadline), Date.now() + 240000),
    ).toISOString()
    try {
      const stages = new RunnerVerificationStages(store, {
        identity: context.request.host,
        engine: () => engine,
        driver,
        suite: () => selection,
        gate: () => {
          throw new Error('A failed suite cannot invoke a verifier')
        },
      })
      assert.equal((await stages.execute(context)).status, 'blocked')
      const originalScope = new RunnerEnvironmentScope(store, context.invocation).inspect(),
        originalFile = store.files.path(`delivery/runner-suites/${context.invocation}.json`),
        originalBytes = readFileSync(originalFile),
        original = JSON.parse(originalBytes.toString()),
        deadline = store.budgets.inspect(context.request.run).deadline,
        controllerDeadline = context.deadline,
        repair = new RunnerRepairWorkers(store, production.queue, production.options)
      // Narrow the correction window so later suites cannot regain the broader original bound.
      context.deadline = new Date(Date.parse(context.deadline) - 1000).toISOString()
      assert.equal((await repair.execute(stages, context)).status, 'produced')
      const commits = new RunnerRepairCommits(repair),
        committed = await commits.execute(context)
      assert.equal(committed.status, 'committed', JSON.stringify(committed))
      if (!('receipt' in committed)) throw new Error('Corrected commit required')
      console.log('Original failed suite corrected and committed')
      const criteria = context.stage.criteria.map((id) => {
          const criterion = context.plan.criteria.find((criterion) => criterion.id === id)
          assert.ok(criterion)
          return { id: criterion.id, text: criterion.text, test: criterion.test }
        }),
        gate = new GateWorkflow(engine).plan(original.gate.subject, 'verify', {
          repo: original.gate.repository,
          base: 'main',
          criteria,
        }).plan,
        resources = new EnvironmentResources(store.files),
        first = resources.get(selection.environment).record,
        environments = new DeliveryEnvironments(store.files.root, driver),
        provisioned = await environments.provision({
          schema: 'wholeloop/environment-provision-request@1',
          run: context.request.run,
          recipe: first.recipe,
          key: 'runner-suite-next-round',
          helperImage: first.helperImage,
          workspaces: [
            {
              repository: 'app',
              path: gate.repository,
              head: committed.receipt.head,
              snapshot: gate.snapshot.digest,
            },
          ],
        })
      assert.equal(provisioned.status, 'ready', JSON.stringify(provisioned))
      assert.ok(provisioned.environment)
      const environment = provisioned.environment.record.id
      assert.notEqual(environment, selection.environment)
      store.lifecycle.transition(context.request.run, {
        to: 'queued',
        reason: 'Observe fresh suite work under the original controller.',
      })
      const phase = contractDigest(gate),
        suite = new RunnerSuiteStages(store, {
          identity: context.request.host,
          engine: () => engine,
          correction: commits,
          phase,
        }),
        selected = { ...selection, environment }
      let forbiddenCalls = 0
      const deniedDriver = {
        provenance: driver.provenance,
        call: async () => {
          forbiddenCalls++
          throw new Error('Invalid continuation cannot call Docker')
        },
      }
      for (const [attempt, inputs] of [
        [
          { ...context, deadline: new Date(Date.parse(context.deadline) + 86400000).toISOString() },
          selected,
        ],
        [{ ...context, deadline: controllerDeadline }, selected],
        [context, selection],
        [context, { ...selected, mapping: { 'package.json#check': 'another-case' } }],
      ] as const) {
        await assert.rejects(
          () => suite.execute(attempt, gate, inputs, deniedDriver),
          /suite-stage-original-phase-binding/,
        )
      }
      assert.equal(forbiddenCalls, 0)
      checks.push(
        'expanded or regained correction deadlines, reused environments and changed pinned command mappings refuse before Docker dispatch',
      )
      const observed = await suite.execute(context, gate, selected, driver)
      assert.equal(observed.status, 'failed', JSON.stringify(observed))
      assert.equal(observed.provenance, 'host-observed')
      assert.ok(observed.result?.commands.some((command) => command.exitCode === 7))
      assert.equal(observed.acceptance, 'not-established')
      assert.deepEqual(readFileSync(originalFile), originalBytes)
      assert.deepEqual(
        new RunnerEnvironmentScope(store, context.invocation).inspect(),
        originalScope,
      )
      assert.equal(
        new RunnerEnvironmentScope(store, context.invocation, phase).inspect().invocationState,
        'stopped',
      )
      assert.equal(new RunnerNativeScope(store.files, context.invocation).calls().length, 1)
      assert.equal(store.budgets.inspect(context.request.run).deadline, deadline)
      const run = gateRuns(engine.store.events()).find((run) => run.run === gate.run)
      assert.equal(run?.run, original.gate.run)
      assert.equal(run?.budget, original.gate.budget)
      assert.equal(run?.rounds.length, 2)
      assert.equal(gate.snapshot.head, committed.receipt.head)
      checks.push(
        'same original gate allowance executes the corrected HEAD in a distinct actual owned Docker environment',
      )
      store.lifecycle.transition(context.request.run, {
        to: 'paused',
        reason: 'Recover only the exact fresh suite observations.',
      })
      const record = store.stage(contractDigest(context.request), context.stage.id)
      assert.ok(record)
      const recovered = await new RunnerSuiteStages(store, suite.options).inspect(
        context.request,
        record,
        { gate, selection: selected },
      )
      assert.deepEqual(recovered, observed)
      assert.equal(record.status, 'running')
      checks.push(
        'original suite bytes and ownership remain intact while paused recovery retains the new known failure without model or command replay',
      )
      if (process.argv.includes('--retire-success')) {
        for (const id of [selection.environment, environment]) {
          const retired = await new EnvironmentLifecycle(store.files, driver).execute({
            schema: 'wholeloop/environment-lifecycle-request@1',
            id: `suite-continuation-${id}`,
            environment: id,
            expected: resources.get(id).digest,
            action: 'retire',
            reason: 'Retire only this exact observed suite-control environment.',
          })
          assert.equal(retired.state, 'retired', JSON.stringify(retired))
        }
        checks.push('both exact observed environments are retired explicitly without broad cleanup')
      }
    } finally {
      clearTimeout(timer)
    }
  },
  { backend: 'docker', production: true, unattended: true, exit: 7, retain: true },
)
const report = {
  status: 'passed',
  provenance: 'fixture',
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  checks,
  acceptance: 'not-established',
  publication: 'not-performed',
  applicationHostAcceptance: 'not-established',
}
mkdirSync(destination, { recursive: true })
writeFileSync(join(destination, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report))
