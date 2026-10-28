import assert from 'node:assert/strict'
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { findBudget } from '../../../src/delivery/budget-events.js'
import { gateRuns } from '../../../src/gates/state.js'
import { GateWorkflow } from '../../../src/gates/workflow.js'
import { RunnerNativeScope } from '../../../src/runner/native-scope.js'
import { RunnerRepairCommits } from '../../../src/runner/repair-commits.js'
import { RunnerRepairWorkers } from '../../../src/runner/repair-workers.js'
import { RunnerReviewStages } from '../../../src/runner/review-stages.js'
import { runnerRepairFixture } from '../../support/runner-repair.js'

const destination = process.argv[2]
if (!destination) throw new Error('Supply an external report directory')
const checks: string[] = []
await runnerRepairFixture(async ({ store, queue, options, request, reader, context }) => {
  // This composition declares its own finite window before correction starts;
  // existing worker and gate controls keep their original shorter deadlines.
  const abort = new AbortController(),
    timer = setTimeout(() => abort.abort(), 240000)
  context.signal = abort.signal
  context.deadline = new Date(
    Math.min(Date.parse(context.deadline), Date.now() + 240000),
  ).toISOString()
  try {
    const repair = new RunnerRepairWorkers(store, queue, options),
      before = findBudget(store.lifecycle.journal.get(request.run)),
      original = gateRuns(reader.options.engine(request, '').store.events()).at(-1)
    assert.ok(original)
    assert.equal(original.budget, 2)
    assert.equal(original.rounds.length, 1)
    assert.equal((await repair.execute(reader, context)).status, 'produced')
    console.log('Original correction produced')
    const commits = new RunnerRepairCommits(repair),
      committed = await commits.execute(context)
    assert.equal(committed.status, 'committed', JSON.stringify(committed))
    console.log('Original correction committed')
    if (!('receipt' in committed)) throw new Error('Correction receipt required')
    const continued = new RunnerReviewStages(store, { ...reader.options, correction: commits }),
      engine = reader.options.engine(request, ''),
      originalPlan = GateWorkflow.prototype.plan,
      originalAtomic = engine.store.files.atomic.bind(engine.store.files),
      scope = new RunnerNativeScope(store.files, context.invocation),
      beforeCalls = scope.calls().length
    const retainedDeadline = context.deadline
    context.deadline = new Date(Date.parse(context.deadline) + 86400000).toISOString()
    await assert.rejects(() => continued.advance(context), /review-continuation-original-binding/)
    context.deadline = retainedDeadline
    assert.equal(gateRuns(engine.store.events()).at(-1)?.rounds.length, 1)
    let lostPlan = false,
      lostVerdict = false
    GateWorkflow.prototype.plan = function (...args) {
      const selected = originalPlan.apply(this, args)
      if (selected.plan.gate === 'review' && selected.plan.round === 2) {
        lostPlan = true
        throw new Error('Lose the response after planning the original next round')
      }
      return selected
    }
    try {
      await assert.rejects(() => continued.advance(context), /Lose the response after planning/)
    } finally {
      GateWorkflow.prototype.plan = originalPlan
    }
    assert.equal(lostPlan, true)
    console.log('Original next-round planning response recovered')
    assert.equal(scope.calls().length, beforeCalls)
    const planned = gateRuns(engine.store.events()).at(-1)
    assert.equal(planned?.run, original.run)
    assert.equal(planned?.budget, 2)
    assert.equal(planned?.rounds.length, 2)
    assert.equal(planned?.rounds[1]?.plan.snapshot.head, committed.receipt.head)
    // All native outputs and submissions precede the verdict transaction. A lost
    // final journal write must be recoverable without another native invocation.
    engine.store.files.atomic = (path, body) => {
      if (
        !lostVerdict &&
        path.endsWith('.ndjson') &&
        typeof body === 'string' &&
        body.includes('gate.decided')
      ) {
        const events = body
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line))
        if (events.some((event) => event.type === 'gate.decided' && event.data.round === 2)) {
          lostVerdict = true
          throw new Error('Lose the original next-round verdict write')
        }
      }
      return originalAtomic(path, body)
    }
    try {
      await assert.rejects(() => continued.advance(context), /Lose the original next-round verdict/)
    } finally {
      engine.store.files.atomic = originalAtomic
    }
    assert.equal(lostVerdict, true)
    console.log('Original next-round outputs submitted')
    const completedCalls = scope.calls().length
    assert.ok(completedCalls > beforeCalls)
    store.lifecycle.transition(request.run, {
      to: 'paused',
      reason: 'Recover only original next-round observations.',
    })
    reader.options.gate = () => {
      throw new Error('Recovery cannot construct a native host')
    }
    const recovered = new RunnerReviewStages(store, { ...reader.options, correction: commits }),
      pointer = store.files.path(`delivery/runner-reviews/${context.invocation}.json`)
    renameSync(pointer, `${pointer}.lost`)
    const observation = await recovered.advance(context)
    mkdirSync(destination, { recursive: true })
    writeFileSync(
      join(destination, 'recovery.json'),
      `${JSON.stringify({ observation, rounds: gateRuns(engine.store.events()), calls: scope.inspect() }, null, 2)}\n`,
    )
    assert.equal(observation.status, 'passed', JSON.stringify(observation))
    assert.equal(observation.provenance, 'host-observed')
    assert.deepEqual(await recovered.advance(context), observation)
    const after = gateRuns(engine.store.events()).at(-1),
      budget = findBudget(store.lifecycle.journal.get(request.run))
    assert.equal(after?.run, original.run)
    assert.equal(after?.budget, original.budget)
    assert.equal(after?.rounds.length, 2)
    assert.equal(after?.rounds[1]?.decision?.report.verdict, 'PASS')
    assert.equal(scope.calls().length, completedCalls)
    assert.equal(budget?.deadline, before?.deadline)
    assert.equal(budget?.failures.length, 1)
    assert.deepEqual(budget?.progress, before?.progress)
    assert.equal(store.stage(contractDigest(request), context.stage.id)?.status, 'running')
    checks.push(
      'corrected HEAD receives a new independent review round in the original run and allowance',
    )
    checks.push(
      'lost planning response reuses the exact second round without another plan or native replay',
    )
    checks.push(
      'paused recovery restores the round locator and verdict from original closed outputs without a host factory',
    )
    checks.push(
      'review preserves global deadline, failure history and root-stage status without human approval',
    )
  } finally {
    clearTimeout(timer)
  }
}, 'repair-aware')
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
