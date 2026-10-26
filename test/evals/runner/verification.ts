import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import type { DockerTransport } from '../../../src/environment/docker-command.js'
import { EnvironmentLifecycle } from '../../../src/environment/lifecycle.js'
import { EnvironmentResources } from '../../../src/environment/runtime.js'
import { gateRuns } from '../../../src/gates/state.js'
import { DEFAULT_REVIEW_RUBRIC } from '../../../src/review/input.js'
import { RunnerEnvironmentScope } from '../../../src/runner/environment-scope.js'
import { RunnerNativeScope } from '../../../src/runner/native-scope.js'
import { RunnerStore } from '../../../src/runner/store.js'
import { RunnerSuiteStages } from '../../../src/runner/suite-stages.js'
import { RunnerVerificationStages } from '../../../src/runner/verification-stages.js'
import { gateWorkerFixture } from '../../support/gate-worker.js'
import { runnerSuiteFixture } from '../../support/runner-suite.js'

const destination = process.argv[2],
  scenario = process.argv[3]
const samples = [
  { key: 'observed-pass', exit: 0, native: 'host-observed' },
  { key: 'observed-fail', exit: 7, native: 'host-observed' },
  { key: 'fixture-refusal', exit: 0, native: 'fixture' },
] as const
if (!samples.some((sample) => sample.key === scenario))
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
  for (const sample of samples.filter((sample) => sample.key === scenario)) {
    await runnerSuiteFixture(
      async ({ store, context, engine, selection, driver }) => {
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
          'valid',
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
          store.lifecycle.transition(context.request.run, {
            to: 'paused',
            reason:
              'Recover the exact original verification without new native or application work.',
          })
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
            sample.exit === 0 && sample.native === 'host-observed' ? 'passed' : 'blocked',
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
      { backend: 'docker', retain: true, exit: sample.exit, guidance: DEFAULT_REVIEW_RUBRIC },
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
