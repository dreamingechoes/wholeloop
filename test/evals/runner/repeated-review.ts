import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { findBudget } from '../../../src/delivery/budget-events.js'
import { gateRuns } from '../../../src/gates/state.js'
import { RunnerNativeScope } from '../../../src/runner/native-scope.js'
import { RunnerRepairCommits } from '../../../src/runner/repair-commits.js'
import { RunnerRepairWorkers } from '../../../src/runner/repair-workers.js'
import { RunnerReviewStages } from '../../../src/runner/review-stages.js'
import { runnerRepairFixture } from '../../support/runner-repair.js'

const destination = process.argv[2]
if (!destination) throw new Error('Supply an external report directory')
const checks: string[] = []
await runnerRepairFixture(
  async ({ store, queue, options, request, reader, context }) => {
    // Declare the complete finite composition before its first correction. Later
    // workers and gate rounds must retain this same window rather than renew it.
    const abort = new AbortController(),
      timer = setTimeout(() => abort.abort(), 600000)
    context.signal = abort.signal
    context.deadline = new Date(
      Math.min(Date.parse(context.deadline), Date.now() + 600000),
    ).toISOString()
    try {
      console.log(`Retained original store: ${store.files.root}`)
      const engine = reader.options.engine(request, ''),
        first = gateRuns(engine.store.events()).at(-1),
        before = findBudget(store.lifecycle.journal.get(request.run)),
        repair = new RunnerRepairWorkers(store, queue, options)
      assert.ok(first)
      assert.equal(first.budget, 3)
      assert.equal((await repair.execute(reader, context)).status, 'produced')
      const commits = new RunnerRepairCommits(repair),
        committed = await commits.execute(context)
      assert.equal(committed.status, 'committed', JSON.stringify(committed))
      if (!('receipt' in committed)) throw new Error('First correction receipt required')
      const second = new RunnerReviewStages(store, { ...reader.options, correction: commits }),
        secondResult = await second.advance(context)
      assert.equal(secondResult.status, 'blocked', JSON.stringify(secondResult))
      assert.equal(secondResult.provenance, 'host-observed')
      const originalPath = store.files.path(
          `delivery/runner-review-continuations/${context.invocation}.json`,
        ),
        originalIntent = readFileSync(originalPath, 'utf8'),
        next = RunnerRepairWorkers.after(
          commits,
          request,
          context.invocation,
          committed.receipt.digest,
        )
      console.log('First correction retains its independently confirmed finding')
      const produced = await next.execute(second, context)
      assert.equal(produced.status, 'produced', JSON.stringify(produced))
      const nextCommits = new RunnerRepairCommits(next),
        pinned = await nextCommits.execute(context)
      assert.equal(pinned.status, 'committed', JSON.stringify(pinned))
      if (!('receipt' in pinned)) throw new Error('Second correction receipt required')
      assert.equal(pinned.receipt.parent, committed.receipt.head)
      console.log('Second correction committed under the original review allowance')
      const third = new RunnerReviewStages(store, { ...reader.options, correction: nextCommits }),
        result = await third.advance(context)
      assert.equal(result.status, 'passed', JSON.stringify(result))
      assert.equal(result.provenance, 'host-observed')
      assert.equal(readFileSync(originalPath, 'utf8'), originalIntent)
      const scope = new RunnerNativeScope(store.files, context.invocation),
        calls = scope.calls().length,
        run = gateRuns(engine.store.events()).find((run) => run.run === first.run)
      assert.equal(run?.rounds.length, 3)
      assert.equal(run?.budget, first.budget)
      assert.equal(run?.rounds[2]?.plan.snapshot.head, pinned.receipt.head)
      assert.equal(run?.rounds[2]?.decision?.report.verdict, 'PASS')
      checks.push(
        'two corrections receive three independent original review rounds without overwriting the first continuation or renewing allowance',
      )
      store.lifecycle.transition(request.run, {
        to: 'paused',
        reason: 'Recover exact third-round review metadata only.',
      })
      third.options.gate = () => {
        throw new Error('Recovery cannot construct another native host')
      }
      const pointer = store.files.path(`delivery/runner-reviews/${context.invocation}.json`)
      renameSync(pointer, `${pointer}.lost`)
      assert.deepEqual(await new RunnerReviewStages(store, third.options).advance(context), result)
      assert.equal(scope.calls().length, calls)
      assert.equal(
        gateRuns(engine.store.events()).find((run) => run.run === first.run)?.rounds.length,
        3,
      )
      const budget = findBudget(store.lifecycle.journal.get(request.run))
      assert.equal(budget?.failures.length, 2)
      assert.equal(budget?.deadline, before?.deadline)
      assert.equal(store.stage(contractDigest(request), context.stage.id)?.status, 'running')
      checks.push(
        'paused third-round recovery preserves original failures/deadline/root-stage status without a model, plan or replay',
      )
    } finally {
      clearTimeout(timer)
    }
  },
  'second-repair-aware',
  3,
)
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
