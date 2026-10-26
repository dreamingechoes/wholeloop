import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { findBudget } from '../../../src/delivery/budget-events.js'
import { deliveryAttempts } from '../../../src/delivery/reducer.js'
import { RunnerNativeScope } from '../../../src/runner/native-scope.js'
import { RunnerRepairWorkers } from '../../../src/runner/repair-workers.js'
import { runnerRepairFixture } from '../../support/runner-repair.js'

const destination = process.argv[2]
if (!destination) throw new Error('Supply an external report directory')
const checks: string[] = []
for (const mode of ['complete', 'lost-claim'] as const) {
  await runnerRepairFixture(async ({ store, queue, options, request, reader, context, host }) => {
    const abort = new AbortController(),
      timer = setTimeout(() => abort.abort(), 120000)
    context.signal = abort.signal
    context.deadline = new Date(
      Math.min(Date.parse(context.deadline), Date.now() + 120000),
    ).toISOString()
    try {
      const repair = new RunnerRepairWorkers(store, queue, options),
        scope = new RunnerNativeScope(store.files, context.invocation),
        calls = scope.calls().length,
        before = findBudget(store.lifecycle.journal.get(request.run)),
        original = queue.claim.bind(queue)
      let claims = 0
      if (mode === 'lost-claim')
        queue.claim = (...args) => {
          claims++
          assert.equal(original(...args).assignment?.generation, 2)
          throw new Error('Lose the response after committing the correction reservation')
        }
      const result = await repair.execute(reader, context)
      assert.equal(
        result.status,
        mode === 'complete' ? 'produced' : 'unknown',
        JSON.stringify(result),
      )
      assert.equal(result.commit, 'pending')
      assert.equal(result.qa, 'pending')
      const entries = queue.inspect(request.run).filter((entry) => entry.role === 'builder')
      assert.equal(entries.length, 1)
      assert.equal(entries[0]?.generation, 2)
      assert.equal(entries[0]?.status, mode === 'complete' ? 'complete' : 'claimed')
      const builders = deliveryAttempts(store.lifecycle.journal.get(request.run)).records.filter(
        (attempt) => attempt.role === 'builder',
      )
      assert.equal(builders.length, 2)
      assert.equal(builders[0]?.state, 'fenced')
      const budget = findBudget(store.lifecycle.journal.get(request.run))
      assert.equal(budget?.reservations.length, (before?.reservations.length ?? 0) + 1)
      assert.equal(budget?.deadline, before?.deadline)
      assert.equal(budget?.failures.length, 1)
      assert.deepEqual(budget?.progress, before?.progress)
      assert.equal(store.stage(contractDigest(request), context.stage.id)?.status, 'running')
      assert.equal(scope.calls().length, calls + (mode === 'complete' ? 1 : 0))
      if (mode === 'complete') {
        const lease = queue.assigned(request.run, entries[0]?.attempt ?? ''),
          binding = repair.native.binding(lease),
          brief = JSON.parse(binding?.assignment.brief ?? '{}')
        assert.equal(binding?.assignment.deadline, context.deadline)
        assert.equal(brief.task.kind, 'repair')
        assert.equal(JSON.parse(brief.task.prompt).feedback.category, 'review-findings')
        assert.equal(JSON.parse(brief.task.prompt).feedback.origin.invocation, context.invocation)
        const workspace = host.workspace(request, 'search').repository.path,
          path = join(workspace, 'app.txt'),
          current = readFileSync(path)
        assert.equal(current.toString(), 'Synthetic owned correction.\n')
        writeFileSync(path, 'Changed after correction.\n')
        assert.equal((await repair.inspect(request, context.invocation)).status, 'blocked')
        writeFileSync(path, current)
      }
      store.lifecycle.transition(request.run, {
        to: 'paused',
        reason: 'Inspect only the original correction.',
      })
      options.context = () => {
        throw new Error('Recovery cannot select inputs')
      }
      options.boundary = () => {
        throw new Error('Recovery cannot construct another host')
      }
      const recovered = new RunnerRepairWorkers(store, queue, options)
      for (let index = 0; index < 2; index++) {
        const observed = await recovered.execute(reader, context)
        if (mode === 'complete') assert.deepEqual(observed, result)
        else assert.equal(observed.status, 'unknown')
      }
      assert.equal(scope.calls().length, calls + (mode === 'complete' ? 1 : 0))
      assert.equal(claims, mode === 'lost-claim' ? 1 : 0)
      checks.push(
        mode === 'complete'
          ? 'one original bounded correction preserves failure, generation, pending commit/QA and paused recovery without replay'
          : 'lost original correction claim response retains reservation and intent without reclaim or native dispatch',
      )
    } finally {
      clearTimeout(timer)
    }
  })
}
const report = {
  status: 'passed',
  provenance: 'fixture',
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  checks,
  nativeAcceptance: 'not-established',
  publication: 'not-performed',
}
mkdirSync(destination, { recursive: true })
writeFileSync(join(destination, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report))
