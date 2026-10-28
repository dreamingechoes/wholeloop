import assert from 'node:assert/strict'
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { findBudget } from '../../../src/delivery/budget-events.js'
import { EnvironmentLifecycle } from '../../../src/environment/lifecycle.js'
import { DeliveryEnvironments } from '../../../src/environment/provision.js'
import { EnvironmentResources } from '../../../src/environment/runtime.js'
import { workspaceSnapshot } from '../../../src/gates/snapshot.js'
import { gateRuns } from '../../../src/gates/state.js'
import { GateWorkflow } from '../../../src/gates/workflow.js'
import { RunnerNativeScope } from '../../../src/runner/native-scope.js'
import { RunnerRepairCommits } from '../../../src/runner/repair-commits.js'
import { RunnerRepairWorkers } from '../../../src/runner/repair-workers.js'
import { RunnerVerificationStages } from '../../../src/runner/verification-stages.js'
import { gateWorkerFixture } from '../../support/gate-worker.js'
import { runnerSuiteFixture } from '../../support/runner-suite.js'

const destination = process.argv[2]
if (!destination) throw new Error('Supply an external report directory')
const checks: string[] = []
await runnerSuiteFixture(
  async ({ store, context, engine, selection, driver, production, gate: initial }) => {
    assert.ok(production)
    console.log(`Retained original store: ${store.files.root}`)
    const abort = new AbortController(),
      timer = setTimeout(() => abort.abort(), 240000)
    context.signal = abort.signal
    context.deadline = new Date(
      Math.min(Date.parse(context.deadline), Date.now() + 240000),
    ).toISOString()
    try {
      const options = gateWorkerFixture(store, initial.repository, 'valid', 'host-observed'),
        original = new RunnerVerificationStages(store, {
          identity: context.request.host,
          engine: () => engine,
          suite: () => selection,
          driver,
          gate: options,
        })
      assert.equal((await original.execute(context)).status, 'blocked')
      const before = findBudget(store.lifecycle.journal.get(context.request.run)),
        first = gateRuns(engine.store.events()).at(-1)
      assert.ok(first)
      context.deadline = new Date(Date.parse(context.deadline) - 1000).toISOString()
      const repair = new RunnerRepairWorkers(store, production.queue, production.options)
      assert.equal((await repair.execute(original, context)).status, 'produced')
      const commits = new RunnerRepairCommits(repair),
        committed = await commits.execute(context)
      assert.equal(committed.status, 'committed', JSON.stringify(committed))
      if (!('receipt' in committed)) throw new Error('Correction receipt required')
      console.log('Original failing candidate corrected and committed')
      const resources = new EnvironmentResources(store.files),
        firstEnvironment = resources.get(selection.environment).record,
        environments = new DeliveryEnvironments(store.files.root, driver),
        prepared = await environments.provision({
          schema: 'wholeloop/environment-provision-request@1',
          run: context.request.run,
          recipe: firstEnvironment.recipe,
          key: 'verification-continuation',
          helperImage: firstEnvironment.helperImage,
          workspaces: [
            {
              repository: 'app',
              path: initial.repository,
              head: committed.receipt.head,
              snapshot: workspaceSnapshot(initial.repository).digest,
            },
          ],
        })
      assert.equal(prepared.status, 'ready', JSON.stringify(prepared))
      assert.ok(prepared.environment)
      const environment = prepared.environment.record.id
      store.lifecycle.transition(context.request.run, {
        to: 'queued',
        reason: 'Continue exact original verification after fresh environment readiness.',
      })
      const continued = new RunnerVerificationStages(store, {
          ...original.options,
          correction: commits,
          suite: () => ({ ...selection, environment }),
        }),
        scope = new RunnerNativeScope(store.files, context.invocation),
        beforeCalls = scope.calls().length,
        plan = GateWorkflow.prototype.plan
      GateWorkflow.prototype.plan = function (...args) {
        const selected = plan.apply(this, args)
        if (selected.plan.gate === 'verify' && selected.plan.round === 2)
          throw new Error('Lose the original verification planning response')
        return selected
      }
      try {
        await assert.rejects(
          () => continued.advance(context),
          /Lose the original verification planning response/,
        )
      } finally {
        GateWorkflow.prototype.plan = plan
      }
      assert.equal(scope.calls().length, beforeCalls)
      const atomic = engine.store.files.atomic.bind(engine.store.files)
      let lostVerdict = false
      engine.store.files.atomic = (path, body) => {
        if (
          !lostVerdict &&
          path.endsWith('.ndjson') &&
          typeof body === 'string' &&
          body.includes('gate.decided') &&
          body
            .trim()
            .split('\n')
            .some((line) => {
              const event = JSON.parse(line)
              return event.type === 'gate.decided' && event.data.round === 2
            })
        ) {
          lostVerdict = true
          throw new Error('Lose the original continued verification verdict')
        }
        return atomic(path, body)
      }
      try {
        await assert.rejects(
          () => continued.advance(context),
          /Lose the original continued verification verdict/,
        )
      } finally {
        engine.store.files.atomic = atomic
      }
      assert.equal(lostVerdict, true)
      console.log('Corrected candidate passed its actual suite and independent synthetic judgments')
      const calls = scope.calls().length
      assert.ok(calls > beforeCalls)
      store.lifecycle.transition(context.request.run, {
        to: 'paused',
        reason: 'Recover exact continued verification without any new host.',
      })
      continued.options.gate = () => {
        throw new Error('Recovery cannot construct another native host')
      }
      continued.options.suite = () => {
        throw new Error('Recovery cannot select another suite')
      }
      const pointer = store.files.path(`delivery/runner-verifications/${context.invocation}.json`)
      renameSync(pointer, `${pointer}.lost`)
      const recovered = new RunnerVerificationStages(store, continued.options),
        observation = await recovered.advance(context)
      mkdirSync(destination, { recursive: true })
      writeFileSync(join(destination, 'recovery.json'), `${JSON.stringify(observation, null, 2)}\n`)
      assert.equal(observation.status, 'passed', JSON.stringify(observation))
      assert.equal(observation.provenance, 'host-observed')
      const run = gateRuns(engine.store.events()).find((run) => run.run === first.run),
        budget = findBudget(store.lifecycle.journal.get(context.request.run))
      assert.equal(run?.rounds.length, 2)
      assert.equal(run?.budget, first.budget)
      assert.equal(run?.rounds[1]?.decision?.report.verdict, 'PASS')
      assert.equal(run?.rounds[1]?.plan.snapshot.head, committed.receipt.head)
      assert.equal(scope.calls().length, calls)
      assert.equal(budget?.deadline, before?.deadline)
      assert.equal(budget?.failures.length, 1)
      assert.equal(
        store.stage(contractDigest(context.request), context.stage.id)?.status,
        'running',
      )
      checks.push(
        'the original failed verify run receives a fresh actual suite and independent synthetic judgments over the exact correction without renewing its allowance or narrower deadline',
      )
      checks.push(
        'lost planning response, verdict and active locator recover while paused without model, command or selector replay',
      )
      checks.push(
        'global failure/deadline history and root-stage completion remain separate from the observed gate verdict',
      )
      if (process.argv.includes('--retire-success')) {
        for (const id of [selection.environment, environment]) {
          const retired = await new EnvironmentLifecycle(store.files, driver).execute({
            schema: 'wholeloop/environment-lifecycle-request@1',
            id: `verify-continuation-${id}`,
            environment: id,
            expected: resources.get(id).digest,
            action: 'retire',
            reason: 'Retire only the exact original continued-verification environment.',
          })
          assert.equal(retired.state, 'retired', JSON.stringify(retired))
        }
        checks.push('both exact observed environments retire without broad cleanup')
      }
    } finally {
      clearTimeout(timer)
    }
  },
  { backend: 'docker', production: true, unattended: true, repairSensitive: true, retain: true },
)
const report = {
  status: 'passed',
  provenance: 'fixture',
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  checks,
  nativeAcceptance: 'not-established',
  applicationHostAcceptance: 'not-established',
  publication: 'not-performed',
}
mkdirSync(destination, { recursive: true })
writeFileSync(join(destination, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report))
