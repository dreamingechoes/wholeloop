import assert from 'node:assert/strict'
import { contractDigest } from '../../src/contracts/compatibility.js'
import { RunnerNativeScope } from '../../src/runner/native-scope.js'
import { RunnerReviewStages } from '../../src/runner/review-stages.js'
import { RunnerStore } from '../../src/runner/store.js'
import { nativeGateFixture } from './native-gate.js'

/** Complete rounds use their original plan budget outside ordinary per-test file-worker limits. */
export async function runnerReviewFixture() {
  const observations: { provenance: string; status: string; calls: number; mode: string }[] = []
  for (const { provenance, mode } of [
    { provenance: 'host-observed', mode: 'valid' },
    { provenance: 'fixture', mode: 'valid' },
    { provenance: 'host-observed', mode: 'majority' },
  ] as const) {
    await nativeGateFixture(
      async ({ store, context, engine, options }) => {
        // This fresh control narrows its already declared plan allowance before
        // invocation; it never extends an issued attempt or a test deadline.
        const abort = new AbortController(),
          timer = setTimeout(() => abort.abort(), 120000)
        context.signal = abort.signal
        context.deadline = new Date(
          Math.min(Date.parse(context.deadline), Date.now() + 120000),
        ).toISOString()
        const stages = new RunnerReviewStages(store, {
            identity: context.request.host,
            engine: () => engine,
            gate: options,
          }),
          atomic = engine.store.files.atomic.bind(engine.store.files)
        let failedWrite = false
        engine.store.files.atomic = (path, body) => {
          if (
            provenance === 'host-observed' &&
            !failedWrite &&
            path.startsWith('journal/') &&
            body.toString().includes('"type":"gate.decided"')
          ) {
            failedWrite = true
            throw new Error('Fixture final review journal write failed')
          }
          return atomic(path, body)
        }
        try {
          if (provenance === 'host-observed') {
            await assert.rejects(
              stages.execute(context),
              /Fixture final review journal write failed/,
            )
            assert.equal(failedWrite, true)
          } else assert.equal((await stages.execute(context)).status, 'blocked')
          engine.store.files.atomic = atomic
          const record = store.stage(contractDigest(context.request), context.stage.id)
          assert.ok(record)
          const count = new RunnerNativeScope(store.files, context.invocation).calls().length
          assert.ok(count > 0)
          store.lifecycle.transition(context.request.run, {
            to: 'paused',
            reason: 'Recover original review metadata without resuming native work.',
          })
          const fresh = new RunnerReviewStages(new RunnerStore(store.files.root), {
              identity: context.request.host,
              engine: () => engine,
              gate: () => {
                throw new Error('Inspection must not construct another native host')
              },
            }),
            recovered = await fresh.inspect(context.request, record)
          assert.equal(recovered.status, provenance === 'host-observed' ? 'passed' : 'blocked')
          assert.equal(recovered.provenance, provenance)
          assert.equal(recovered.invocationState, 'stopped')
          assert.deepEqual(await fresh.inspect(context.request, record), recovered)
          assert.equal(new RunnerNativeScope(store.files, context.invocation).calls().length, count)
          assert.equal(store.lifecycle.journal.get(context.request.run).state, 'paused')
          observations.push({ provenance, status: recovered.status, calls: count, mode })
        } finally {
          clearTimeout(timer)
          engine.store.files.atomic = atomic
          abort.abort()
          new RunnerNativeScope(store.files, context.invocation).requestCancellation()
        }
      },
      mode,
      provenance,
      'plan',
    )
  }
  return observations
}
