import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { RunnerNativeScope } from '../../../src/runner/native-scope.js'
import { RunnerRepairWorkers } from '../../../src/runner/repair-workers.js'
import { runnerRepairFixture } from '../../support/runner-repair.js'

const destination = process.argv[2]
if (!destination) throw new Error('Supply an external report directory')
const checks: string[] = []
await runnerRepairFixture(async ({ store, queue, options, request, reader, context }) => {
  const abort = new AbortController(),
    timer = setTimeout(() => abort.abort(), 180000)
  context.signal = abort.signal
  context.deadline = new Date(
    Math.min(Date.parse(context.deadline), Date.now() + 180000),
  ).toISOString()
  try {
    const workers = new RunnerRepairWorkers(store, queue, options)
    assert.equal((await workers.execute(reader, context)).status, 'produced')
    const original = workers.production(request, context.invocation),
      native = workers.native.historical(original.lease),
      scope = new RunnerNativeScope(store.files, context.invocation),
      calls = scope.calls().length
    assert.ok(native)
    assert.deepEqual(native.receipt, original.receipt)
    assert.deepEqual(Object.keys(original).sort(), [
      'binding',
      'calls',
      'lease',
      'provenance',
      'receipt',
    ])
    queue.fence(original.lease)
    queue.requeue(original.lease, contractDigest(original.receipt))
    store.lifecycle.transition(request.run, {
      to: 'queued',
      reason: 'Reserve, but never launch, the next original history-control generation.',
    })
    const next = queue.claim(
      `controller-${contractDigest({ invocation: context.invocation, history: true }).slice(0, 32)}`,
      () => ({ ready: true, provenance: 'host-observed', evidence: 'f'.repeat(64) }),
      { run: request.run, queue: original.lease.queue, deadline: context.deadline },
    ).assignment
    assert.equal(next?.generation, 3)
    assert.ok(next)
    assert.equal(workers.native.completed(original.lease), false)
    assert.deepEqual(workers.native.historical(original.lease), native)
    assert.deepEqual(workers.production(request, context.invocation), original)
    assert.equal((await workers.inspect(request, context.invocation)).status, 'unknown')
    assert.equal(scope.calls().length, calls)
    assert.equal(
      workers.native.historical({ ...original.lease, controller: `controller-${'e'.repeat(32)}` }),
      undefined,
    )
    const captured = original.receipt.artifacts?.[0]
    assert.ok(captured)
    const path = store.files.path(captured.ref),
      bytes = readFileSync(path)
    try {
      writeFileSync(path, 'Changed historical output.')
      assert.equal(workers.native.historical(original.lease), undefined)
      assert.throws(
        () => workers.production(request, context.invocation),
        /original-repair-observation-incomplete/,
      )
    } finally {
      writeFileSync(path, bytes)
    }
    const guidance = join(native.binding.contextRoot, 'artifacts/guidance.txt'),
      input = readFileSync(guidance)
    try {
      writeFileSync(guidance, 'Changed historical input.')
      assert.equal(workers.native.historical(original.lease), undefined)
    } finally {
      writeFileSync(guidance, input)
    }
    assert.deepEqual(workers.production(request, context.invocation), original)
    checks.push(
      'a later reserved generation leaves the exact original completed production proof unchanged while strict current inspection refuses it',
    )
    checks.push(
      'historical transport audit rejects substituted controllers and changed captured input/output bytes without launching another worker',
    )
    queue.finish(
      next,
      'stopped',
      contractDigest({ history: 'The reserved control generation was never launched.' }),
    )
    options.context = () => {
      throw new Error('Historical inspection cannot select inputs')
    }
    options.boundary = () => {
      throw new Error('Historical inspection cannot construct a host')
    }
    store.lifecycle.transition(request.run, {
      to: 'paused',
      reason: 'Inspect only the original historical producer.',
    })
    assert.deepEqual(
      new RunnerRepairWorkers(store, queue, options).production(request, context.invocation),
      original,
    )
    store.lifecycle.authority.revoke({
      schema: 'wholeloop/delivery-revocation-request@1',
      grant: request.grant,
      operator: 'Fixture Operator',
      reason: 'Original transport completion does not grant new authority.',
    })
    assert.deepEqual(workers.native.historical(original.lease), native)
    assert.equal(scope.calls().length, calls)
    workers.stop(request, context.invocation)
    checks.push(
      'paused producer recovery selects no new inputs or hosts, and original transport history survives revocation without dispatch authority',
    )
  } finally {
    clearTimeout(timer)
  }
})
const report = {
  status: 'passed',
  provenance: 'fixture',
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  checks,
  nextGeneration: 'reserved-and-stopped-without-launch',
  nativeAcceptance: 'not-established',
  publication: 'not-performed',
}
mkdirSync(destination, { recursive: true })
writeFileSync(join(destination, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report))
