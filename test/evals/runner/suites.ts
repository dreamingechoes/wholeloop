import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { EnvironmentLifecycle } from '../../../src/environment/lifecycle.js'
import { EnvironmentResources } from '../../../src/environment/runtime.js'
import { RunnerEnvironmentScope } from '../../../src/runner/environment-scope.js'
import { RunnerStore } from '../../../src/runner/store.js'
import { RunnerSuiteStages } from '../../../src/runner/suite-stages.js'
import { runnerSuiteFixture } from '../../support/runner-suite.js'

const destination = process.argv[2]
if (!destination) throw new Error('Provide an external evidence directory')
mkdirSync(destination, { recursive: true })
const report = {
  status: 'failed',
  controller: { node: process.version, platform: process.platform, arch: process.arch },
  scope:
    'Actual model-free owned Docker suite processes and original metadata recovery; no native-client, independent Linux host or whole-feature acceptance.',
  checks: [] as {
    exit: number
    status: string
    evidence: string
    store: string
    environment: string
    retirement: string
  }[],
  reason: '',
  acceptance: 'not-established',
  publication: 'not-performed',
}
try {
  for (const exit of [0, 7] as const) {
    await runnerSuiteFixture(
      async ({ store, context, suite, engine, gate, selection, driver }) => {
        const abort = new AbortController(),
          timer = setTimeout(() => abort.abort(), 120000),
          atomic = engine.store.files.atomic.bind(engine.store.files)
        context.signal = abort.signal
        context.deadline = new Date(
          Math.min(Date.parse(context.deadline), Date.now() + 120000),
        ).toISOString()
        let writes = 0
        // Retain the original successful application command while both the final
        // suite write and the first in-process recovery encounter the same failure.
        if (exit === 0)
          engine.store.files.atomic = (path, body) => {
            if (
              path.startsWith('journal/') &&
              body.toString().includes('"type":"verify.suite-finished"')
            ) {
              writes++
              throw new Error('Fixture suite metadata write failed')
            }
            return atomic(path, body)
          }
        try {
          const result = await suite.execute(context, gate, selection, driver)
          assert.equal(result.status, exit === 0 ? 'unknown' : 'failed', JSON.stringify(result))
          if (exit === 0) assert.ok(writes >= 2, JSON.stringify({ writes, result }))
          engine.store.files.atomic = atomic
          const record = store.stage(contractDigest(context.request), context.stage.id)
          assert.ok(record)
          const original = new RunnerEnvironmentScope(store, context.invocation).inspect()
          assert.equal(original.invocationState, 'stopped')
          assert.ok(original.operations.length > 0)
          assert.ok(original.reads.length > 0)
          store.lifecycle.transition(context.request.run, {
            to: 'paused',
            reason: 'Recover original suite facts without executing another command.',
          })
          const fresh = new RunnerSuiteStages(new RunnerStore(store.files.root), {
              identity: context.request.host,
              engine: () => engine,
            }),
            observed = await fresh.inspect(context.request, record)
          assert.equal(observed.status, exit === 0 ? 'passed' : 'failed', JSON.stringify(observed))
          assert.equal(observed.result?.commands[0]?.exitCode, exit)
          assert.equal(observed.provenance, 'host-observed')
          assert.equal(observed.acceptance, 'not-established')
          assert.deepEqual(await fresh.inspect(context.request, record), observed)
          assert.deepEqual(
            new RunnerEnvironmentScope(store, context.invocation).inspect(),
            original,
          )
          // Losing only the command's root ownership must invalidate a cached
          // passing case even though all remaining metadata clients are closed.
          const scopePath = store.files.path(
              `delivery/runner-environments/${context.invocation}.json`,
            ),
            originalBinding = readFileSync(scopePath, 'utf8'),
            withoutEffects = JSON.parse(originalBinding)
          withoutEffects.operations = []
          writeFileSync(scopePath, `${JSON.stringify(withoutEffects)}\n`)
          try {
            assert.equal((await fresh.inspect(context.request, record)).status, 'unknown')
          } finally {
            writeFileSync(scopePath, originalBinding)
          }
          assert.deepEqual(await fresh.inspect(context.request, record), observed)
          const item = {
            exit,
            status: observed.status,
            evidence: observed.evidence,
            store: store.files.root,
            environment: selection.environment,
            retirement: 'not-requested',
          }
          if (process.argv.includes('--retire-success')) {
            const resources = new EnvironmentResources(store.files),
              retired = await new EnvironmentLifecycle(store.files, driver).execute({
                schema: 'wholeloop/environment-lifecycle-request@1',
                id: 'owned-suite-evaluation-retire',
                environment: selection.environment,
                expected: resources.get(selection.environment).digest,
                action: 'retire',
                reason:
                  'Explicitly retire only this disposable owned suite environment after retaining its observations.',
              })
            assert.equal(retired.state, 'retired', JSON.stringify(retired))
            item.retirement = 'observed-retired'
          }
          report.checks.push(item)
          console.log(`Observed original suite exit ${exit}: ${observed.status}`)
        } finally {
          engine.store.files.atomic = atomic
          clearTimeout(timer)
          abort.abort()
        }
      },
      { backend: 'docker', retain: true, exit },
    )
  }
  report.status = 'passed'
} catch (error) {
  report.reason = error instanceof Error ? error.message : 'Owned suite evaluation failed'
  process.exitCode = 1
} finally {
  writeFileSync(join(destination, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report))
}
