import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { findBudget } from '../../../src/delivery/budget-events.js'
import type { DockerTransport } from '../../../src/environment/docker-command.js'
import { DOCKER_REFERENCE_HELPER } from '../../../src/environment/docker-policy.js'
import { EnvironmentLifecycle } from '../../../src/environment/lifecycle.js'
import { EnvironmentResources } from '../../../src/environment/runtime.js'
import { gateRuns } from '../../../src/gates/state.js'
import { DEFAULT_REVIEW_RUBRIC } from '../../../src/review/input.js'
import { RunnerEnvironmentScope } from '../../../src/runner/environment-scope.js'
import { RunnerNativeScope } from '../../../src/runner/native-scope.js'
import { admitRunnerRepair } from '../../../src/runner/repair-admission.js'
import { runnerRepairFeedback } from '../../../src/runner/repair-feedback.js'
import { RunnerRepairWorkers } from '../../../src/runner/repair-workers.js'
import { RunnerStore } from '../../../src/runner/store.js'
import { RunnerSuiteStages } from '../../../src/runner/suite-stages.js'
import { RunnerUnitEnvironments } from '../../../src/runner/unit-environments.js'
import { RunnerVerificationStages } from '../../../src/runner/verification-stages.js'
import { gateWorkerFixture } from '../../support/gate-worker.js'
import { runnerSuiteFixture } from '../../support/runner-suite.js'

const destination = process.argv[2],
  scenario = process.argv[3]
const samples = [
  { key: 'suite-correction', exit: 7, native: 'host-observed' },
  { key: 'repair-admission', exit: 7, native: 'host-observed' },
  { key: 'observed-findings', exit: 0, native: 'host-observed' },
  { key: 'contract-pass', exit: 0, native: 'host-observed' },
  { key: 'observed-pass', exit: 0, native: 'host-observed' },
  { key: 'observed-fail', exit: 7, native: 'host-observed' },
  { key: 'fixture-refusal', exit: 0, native: 'fixture' },
] as const
if (!samples.some((sample) => sample.key === scenario) && scenario !== 'unit-environment')
  throw new Error('Select an explicit owned verification scenario')
if (!destination) throw new Error('Provide an external evidence directory')
mkdirSync(destination, { recursive: true })
const report = {
  status: 'failed',
  scenario,
  controller: { node: process.version, platform: process.platform, arch: process.arch },
  scope:
    'Actual owned Docker suites joined to synthetic native verifier processes. Normalized native evidence does not certify models, containment, independent Linux application hosts or whole-feature acceptance.',
  checks: [] as {
    exit: number
    native: string
    status: string
    calls: number
    evidence: string
    store: string
    environment: string
    retirement: string
  }[],
  reason: '',
  traces: [] as {
    exit: number
    native: string
    reads: {
      operation: string
      effect: boolean
      elapsedMs: number
      durationMs: number
      status: string
    }[]
  }[],
  acceptance: 'not-established',
  publication: 'not-performed',
}
try {
  // ADR-0207: the verification invocation provisions its own unit environment.
  if (scenario === 'unit-environment')
    await runnerSuiteFixture(
      async ({ store, context, engine, selection, driver, recipe }) => {
        assert.ok(recipe, 'The fixture must leave the prepared recipe unprovisioned')
        const abort = new AbortController(),
          timer = setTimeout(() => abort.abort(), 180000)
        context.signal = abort.signal
        context.deadline = new Date(
          Math.min(Date.parse(context.deadline), Date.now() + 180000),
        ).toISOString()
        let provisions = 0
        const counted: DockerTransport = {
            provenance: driver.provenance,
            call: async (args, options) => {
              if (options?.registration) provisions++
              return driver.call(args, options)
            },
          },
          native = gateWorkerFixture(
            store,
            engine.store.get(gateRuns(engine.store.events())[0]?.subject ?? '').repository ?? '',
            'valid',
            'host-observed',
          ),
          options = {
            identity: context.request.host,
            engine: () => engine,
            driver: counted,
            // The placeholder environment must be replaced by the prepared one.
            suite: () => ({ ...selection, environment: `environment-${'0'.repeat(32)}` }),
            gate: native,
          },
          environments = (store: RunnerStore) =>
            new RunnerUnitEnvironments(
              store,
              [
                {
                  repository: 'app',
                  recipe,
                  helperImage: DOCKER_REFERENCE_HELPER,
                  suite: {
                    refs: selection.refs,
                    mapping: selection.mapping,
                    timeoutMs: selection.timeoutMs,
                  },
                },
              ],
              counted,
            )
        try {
          const observed = await new RunnerVerificationStages(store, {
            ...options,
            environments: environments(store),
          }).execute(context)
          assert.equal(observed.status, 'passed', JSON.stringify(observed))
          const binding = JSON.parse(
              readFileSync(
                store.files.path(`delivery/runner-verifications/${context.invocation}.json`),
                'utf8',
              ),
            ),
            environment = new EnvironmentResources(store.files).get(
              binding.selection.environment,
            ).record
          assert.notEqual(binding.selection.environment, `environment-${'0'.repeat(32)}`)
          assert.equal(environment.recipe, recipe)
          assert.equal(environment.provenance, 'host-observed')
          assert.ok(provisions > 0)
          // A recovered controller reads the original binding and preparation back.
          const before = provisions,
            again = await new RunnerVerificationStages(new RunnerStore(store.files.root), {
              ...options,
              environments: environments(new RunnerStore(store.files.root)),
            }).execute(context)
          assert.equal(again.status, 'passed')
          assert.equal(provisions, before)
          const item = {
            exit: 0,
            native: 'host-observed',
            status: observed.status,
            calls: new RunnerNativeScope(store.files, context.invocation).calls().length,
            evidence: observed.evidence,
            store: store.files.root,
            environment: binding.selection.environment,
            retirement: 'not-requested',
          }
          if (process.argv.includes('--retire-success')) {
            const resources = new EnvironmentResources(store.files),
              retired = await new EnvironmentLifecycle(store.files, driver).execute({
                schema: 'wholeloop/environment-lifecycle-request@1',
                id: 'owned-unit-environment-evaluation-retire',
                environment: binding.selection.environment,
                expected: resources.get(binding.selection.environment).digest,
                action: 'retire',
                reason:
                  'Explicitly retire this exact disposable unit environment after retaining all original observations.',
              })
            assert.equal(retired.state, 'retired', JSON.stringify(retired))
            item.retirement = 'observed-retired'
          }
          report.checks.push(item)
          console.log(`Observed unit environment verification: ${observed.status}`)
        } finally {
          clearTimeout(timer)
          abort.abort()
        }
      },
      {
        backend: 'docker',
        retain: true,
        exit: 0,
        guidance: DEFAULT_REVIEW_RUBRIC,
        unitEnvironment: true,
      },
    )
  for (const sample of samples.filter((sample) => sample.key === scenario)) {
    await runnerSuiteFixture(
      async ({ store, context, engine, selection, driver, production }) => {
        const abort = new AbortController(),
          timer = setTimeout(() => abort.abort(), 120000),
          atomic = engine.store.files.atomic.bind(engine.store.files)
        context.signal = abort.signal
        context.deadline = new Date(
          Math.min(Date.parse(context.deadline), Date.now() + 120000),
        ).toISOString()
        let factories = 0,
          failedWrite = false
        const native = gateWorkerFixture(
          store,
          engine.store.get(gateRuns(engine.store.events())[0]?.subject ?? '').repository ?? '',
          sample.key === 'observed-findings' ? 'confirmed' : 'valid',
          sample.native,
        )
        const trace = {
            exit: sample.exit,
            native: sample.native,
            reads: [] as (typeof report.traces)[number]['reads'],
          },
          origin = performance.now(),
          timed: DockerTransport = {
            provenance: driver.provenance,
            call: async (args, options) => {
              const start = performance.now()
              const result = await driver.call(args, options)
              trace.reads.push({
                operation: args.slice(0, 2).join(' '),
                effect: !!options?.registration,
                elapsedMs: performance.now() - origin,
                durationMs: performance.now() - start,
                status: result.status,
              })
              return result
            },
          }
        report.traces.push(trace)
        const stages = new RunnerVerificationStages(store, {
          identity: context.request.host,
          engine: () => engine,
          driver: timed,
          suite: () => selection,
          ...(sample.key === 'contract-pass'
            ? { contracts: () => ({ 'search-api': 'search-contract.txt' }) }
            : {}),
          gate: (process) => {
            factories++
            return native(process)
          },
        })
        if (sample.exit === 0 && sample.native === 'host-observed')
          engine.store.files.atomic = (path, body) => {
            if (
              !failedWrite &&
              path.startsWith('journal/') &&
              body.toString().includes('"type":"gate.decided"')
            ) {
              failedWrite = true
              throw new Error('Fixture final verification write failed')
            }
            return atomic(path, body)
          }
        try {
          if (sample.exit === 0 && sample.native === 'host-observed') {
            await assert.rejects(stages.execute(context), /Fixture final verification write failed/)
            assert.equal(failedWrite, true)
          } else {
            assert.equal((await stages.execute(context)).status, 'blocked')
          }
          engine.store.files.atomic = atomic
          const record = store.stage(contractDigest(context.request), context.stage.id)
          assert.ok(record)
          const originalEnvironment = new RunnerEnvironmentScope(
              store,
              context.invocation,
            ).inspect(),
            calls = new RunnerNativeScope(store.files, context.invocation).calls().length
          assert.equal(originalEnvironment.invocationState, 'stopped')
          assert.equal(factories, sample.exit === 7 ? 0 : 1)
          if (sample.exit === 7) assert.equal(calls, 0)
          else assert.ok(calls > 0)
          if (sample.key === 'suite-correction') {
            assert.ok(production, 'Original builder production must precede the failed suite')
            const original = store.budgets.inspect(context.request.run),
              repair = new RunnerRepairWorkers(store, production.queue, production.options),
              corrected = await repair.execute(stages, context)
            assert.equal(corrected.status, 'produced', JSON.stringify(corrected))
            assert.equal(corrected.qa, 'pending')
            assert.equal(corrected.commit, 'pending')
            const binding = JSON.parse(
              readFileSync(
                store.files.path(`delivery/runner-repairs/${context.invocation}/binding.json`),
                'utf8',
              ),
            )
            assert.deepEqual(binding.prefix, [])
            assert.equal(binding.admission.feedback.category, 'suite-failure')
            assert.ok(
              binding.admission.feedback.commands.some(
                (command: { exitCode: number }) => command.exitCode === 7,
              ),
            )
            const entries = production.queue
              .inspect(context.request.run)
              .filter((entry) => entry.role === 'builder')
            assert.equal(entries.length, 1)
            assert.equal(entries[0]?.generation, 2)
            assert.equal(entries[0]?.status, 'complete')
            assert.equal(new RunnerNativeScope(store.files, context.invocation).calls().length, 1)
            const budget = store.budgets.inspect(context.request.run)
            assert.equal(budget.deadline, original.deadline)
            assert.equal(budget.reservations.length, original.reservations.length + 1)
            assert.equal(
              findBudget(store.lifecycle.journal.get(context.request.run))?.failures.length,
              1,
            )
            assert.equal(
              store.stage(contractDigest(context.request), context.stage.id)?.status,
              'running',
            )
            assert.deepEqual(
              new RunnerEnvironmentScope(store, context.invocation).inspect(),
              originalEnvironment,
            )
            store.lifecycle.transition(context.request.run, {
              to: 'paused',
              reason: 'Inspect only original suite-failure correction.',
            })
            production.options.context = () => {
              throw new Error('No repair input reselection while paused')
            }
            production.options.boundary = () => {
              throw new Error('No new correction host while paused')
            }
            const fresh = new RunnerRepairWorkers(store, production.queue, production.options)
            assert.deepEqual(await fresh.inspect(context.request, context.invocation), corrected)
            assert.deepEqual(await fresh.execute(stages, context), corrected)
            assert.equal(new RunnerNativeScope(store.files, context.invocation).calls().length, 1)
            const item = {
              exit: sample.exit,
              native: sample.native,
              status: 'blocked',
              calls: 1,
              evidence: 'evidence' in corrected ? String(corrected.evidence) : '',
              store: store.files.root,
              environment: selection.environment,
              retirement: 'not-requested',
            }
            if (process.argv.includes('--retire-success')) {
              const resources = new EnvironmentResources(store.files),
                retired = await new EnvironmentLifecycle(store.files, driver).execute({
                  schema: 'wholeloop/environment-lifecycle-request@1',
                  id: 'owned-verification-evaluation-retire',
                  environment: selection.environment,
                  expected: resources.get(selection.environment).digest,
                  action: 'retire',
                  reason:
                    'Retire only the exact original suite-failure environment after correction observations.',
                })
              assert.equal(retired.state, 'retired', JSON.stringify(retired))
              item.retirement = 'observed-retired'
            }
            report.checks.push(item)
            console.log('Observed suite-only correction with zero original QA model calls')
            return
          }
          let admittedFailure: string | undefined
          if (sample.key === 'repair-admission') {
            const original = store.budgets.inspect(context.request.run),
              recordFailure = store.budgets.failure.bind(store.budgets)
            let lostReply = false
            store.budgets.failure = (run, failure) => {
              recordFailure(run, failure)
              lostReply = true
              throw new Error('Fixture repair admission reply lost after journal commit')
            }
            try {
              const lost = await admitRunnerRepair(stages, context)
              assert.equal(lostReply, true)
              assert.equal(lost.status, 'blocked')
            } finally {
              store.budgets.failure = recordFailure
            }
            const admission = await admitRunnerRepair(stages, context)
            assert.equal(admission.status, 'admitted', JSON.stringify(admission))
            if (admission.status !== 'admitted')
              throw new Error('Original repair admission unavailable')
            admittedFailure = admission.failure
            assert.equal(admission.repairDispatch, 'not-performed')
            const repeated = await admitRunnerRepair(stages, context)
            assert.equal(repeated.status, 'admitted', JSON.stringify(repeated))
            if (repeated.status !== 'admitted') throw new Error('Idempotent admission unavailable')
            assert.equal(repeated.failure, admittedFailure)
            assert.equal(
              findBudget(store.lifecycle.journal.get(context.request.run))?.failures.filter(
                (failure) => failure.key === admittedFailure,
              ).length,
              1,
            )
            assert.deepEqual(
              store.budgets.inspect(context.request.run).reservations,
              original.reservations,
            )
            assert.equal(store.budgets.inspect(context.request.run).deadline, original.deadline)
            const deadline = context.deadline
            try {
              context.deadline = new Date(Date.parse(deadline) + 60000).toISOString()
              const extended = await admitRunnerRepair(stages, context)
              assert.equal(extended.status, 'blocked')
              assert.equal(extended.reason, 'original-repair-deadline-cannot-extend')
            } finally {
              context.deadline = deadline
            }
            assert.equal(new RunnerNativeScope(store.files, context.invocation).calls().length, 0)
          }
          store.lifecycle.transition(context.request.run, {
            to: 'paused',
            reason:
              'Recover the exact original verification without new native or application work.',
          })
          if (sample.key === 'repair-admission') {
            assert.equal((await admitRunnerRepair(stages, context)).status, 'blocked')
            assert.equal(
              findBudget(store.lifecycle.journal.get(context.request.run))?.failures.filter(
                (failure) => failure.key === admittedFailure,
              ).length,
              1,
            )
          }
          const fresh = new RunnerVerificationStages(new RunnerStore(store.files.root), {
              identity: context.request.host,
              engine: () => engine,
              suite: () => {
                throw new Error('Recovery cannot select a new suite')
              },
              gate: () => {
                throw new Error('Recovery cannot construct another native host')
              },
            }),
            observed = await fresh.inspect(context.request, record)
          assert.equal(
            observed.status,
            sample.exit === 0 &&
              sample.native === 'host-observed' &&
              sample.key !== 'observed-findings'
              ? 'passed'
              : 'blocked',
            JSON.stringify(observed),
          )
          assert.equal(observed.invocationState, 'stopped')
          assert.deepEqual(await fresh.inspect(context.request, record), observed)
          assert.equal(new RunnerNativeScope(store.files, context.invocation).calls().length, calls)
          assert.deepEqual(
            new RunnerEnvironmentScope(store, context.invocation).inspect(),
            originalEnvironment,
          )
          assert.equal(store.lifecycle.journal.get(context.request.run).state, 'paused')
          assert.equal(
            engine.store.events().some((e) => e.type === 'verify.agreed'),
            false,
          )
          const originalGate = gateRuns(engine.store.events()).at(-1)?.rounds.at(-1)?.plan
          assert.ok(originalGate)
          const originalDeadline = store.budgets.inspect(context.request.run).deadline,
            feedback = await runnerRepairFeedback(fresh, context.request, record)
          assert.equal(feedback.repairDispatch, 'not-authorized')
          assert.equal(feedback.limits, 'unchanged')
          if (sample.exit === 7 || sample.key === 'observed-findings') {
            assert.notEqual(feedback.status, 'unavailable', JSON.stringify(feedback))
            if (feedback.status === 'unavailable')
              throw new Error('Observed nonzero suite feedback unavailable')
            assert.equal(
              feedback.status,
              originalGate.round >= originalGate.budget ? 'exhausted' : 'actionable',
            )
            assert.equal(
              feedback.category,
              sample.exit === 7 ? 'suite-failure' : 'verification-findings',
            )
            assert.equal(feedback.origin.gate, contractDigest(originalGate))
            assert.equal(feedback.origin.candidate, originalGate.snapshot.head)
            assert.equal(feedback.origin.deadline, context.deadline)
            if (sample.exit === 7)
              assert.ok(feedback.commands.some((command) => command.exitCode === 7))
            else {
              assert.equal(feedback.findings.length, 1)
              assert.deepEqual(feedback.commands, [])
            }
            const file = join(originalGate.repository, 'app.txt'),
              body = readFileSync(file)
            try {
              writeFileSync(file, 'Deliberately stale disposable candidate.\n')
              assert.equal(
                (await runnerRepairFeedback(fresh, context.request, record)).status,
                'unavailable',
              )
            } finally {
              writeFileSync(file, body)
            }
            const restored = await runnerRepairFeedback(fresh, context.request, record)
            assert.notEqual(restored.status, 'unavailable')
            if (restored.status === 'unavailable')
              throw new Error('Restored original feedback unavailable')
            assert.equal(restored.fingerprint, feedback.fingerprint)
          } else assert.equal(feedback.status, 'unavailable')
          assert.equal(store.budgets.inspect(context.request.run).deadline, originalDeadline)
          assert.equal(new RunnerNativeScope(store.files, context.invocation).calls().length, calls)
          await assert.rejects(
            new RunnerSuiteStages(store, {
              identity: context.request.host,
              engine: () => engine,
            }).inspect(context.request, record, {
              gate: originalGate,
              selection: { ...selection, environment: `environment-${'a'.repeat(32)}` },
            }),
            /suite-stage-parent-binding/,
          )

          const item = {
            exit: sample.exit,
            native: sample.native,
            status: observed.status,
            calls,
            evidence: observed.evidence,
            store: store.files.root,
            environment: selection.environment,
            retirement: 'not-requested',
          }
          if (process.argv.includes('--retire-success')) {
            const resources = new EnvironmentResources(store.files),
              retired = await new EnvironmentLifecycle(store.files, driver).execute({
                schema: 'wholeloop/environment-lifecycle-request@1',
                id: 'owned-verification-evaluation-retire',
                environment: selection.environment,
                expected: resources.get(selection.environment).digest,
                action: 'retire',
                reason:
                  'Explicitly retire this exact disposable verification environment after retaining all original observations.',
              })
            assert.equal(retired.state, 'retired', JSON.stringify(retired))
            item.retirement = 'observed-retired'
          }
          report.checks.push(item)
          console.log(
            `Observed verification exit ${sample.exit}, native ${sample.native}: ${observed.status}`,
          )
        } finally {
          engine.store.files.atomic = atomic
          clearTimeout(timer)
          abort.abort()
        }
      },
      {
        backend: 'docker',
        retain: true,
        exit: sample.exit,
        guidance: DEFAULT_REVIEW_RUBRIC,
        ...(sample.key === 'contract-pass' ? { unit: 'contract' as const } : {}),
        ...(['repair-admission', 'suite-correction'].includes(sample.key)
          ? { unattended: true }
          : {}),
        ...(sample.key === 'suite-correction' ? { production: true } : {}),
      },
    )
  }
  report.status = 'passed'
} catch (error) {
  report.reason = error instanceof Error ? error.message : 'Owned verification evaluation failed'
  process.exitCode = 1
} finally {
  writeFileSync(join(destination, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report))
}
