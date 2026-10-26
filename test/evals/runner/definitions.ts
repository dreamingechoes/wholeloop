import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { RunnerDefinitionStages } from '../../../src/runner/definition-stages.js'
import { RunnerNativeScope } from '../../../src/runner/native-scope.js'
import { RunnerStore } from '../../../src/runner/store.js'
import { runnerDefinitionFixture } from '../../support/runner-definition.js'

const destination = process.argv[2]
if (!destination) throw new Error('An external report destination is required')
const checks: string[] = []
for (const rejected of [false, true]) {
  await runnerDefinitionFixture(
    async (f) => {
      const abort = new AbortController(),
        timer = setTimeout(() => abort.abort(), 60000)
      f.context.signal = abort.signal
      f.context.deadline = new Date(
        Math.min(Date.parse(f.context.deadline), Date.now() + 60000),
      ).toISOString()
      try {
        const originalDeadline = f.store.budgets.inspect(f.context.request.run).deadline
        const prepare = f.store.planning.preparePlan.bind(f.store.planning)
        if (!rejected)
          f.store.planning.preparePlan = (proposal) => {
            const prepared = prepare(proposal)
            throw new Error(`Interrupt after exact revision ${prepared.plan.revision} reservation`)
          }
        if (rejected) {
          const result = await f.stages.execute(f.context)
          assert.equal(result.status, 'blocked', JSON.stringify(result))
          assert.equal(result.invocationState, 'stopped')
          assert.equal(result.derivedPlan, undefined)
          assert.throws(() => f.store.planning.getPlan(f.context.request.run, 2))
        } else {
          await assert.rejects(
            f.stages.execute(f.context),
            /Interrupt after exact revision 2 reservation/,
          )
          f.store.planning.preparePlan = prepare
        }
        const native = new RunnerNativeScope(f.store.files, f.context.invocation)
        assert.equal(native.calls().length, 7)
        assert.ok(
          native
            .inspect()
            .every((call) => ['stopped', 'not-started'].includes(call.observed.invocationState)),
        )
        const binding = JSON.parse(
          readFileSync(
            f.store.files.path(`delivery/runner-decisions/${f.context.invocation}.json`),
            'utf8',
          ),
        )
        assert.equal(binding.version, 2)
        assert.equal(binding.production.calls.length, 1)
        assert.equal(binding.production.prepared.revision, 2)
        assert.equal(binding.production.deadline, f.context.deadline)
        assert.equal(binding.requests.length, 3)
        const record = f.store.stage(contractDigest(f.context.request), f.context.stage.id)
        assert.ok(record)
        f.store.lifecycle.transition(f.context.request.run, {
          to: 'paused',
          reason: 'Recover only the original definition and published decisions.',
        })
        const fresh = new RunnerDefinitionStages(new RunnerStore(f.store.files.root), {
          production: {
            identity: f.context.request.host,
            native: () => {
              throw new Error('Recovery cannot launch a producer')
            },
            context: () => {
              throw new Error('Recovery cannot select context')
            },
          },
          decisions: () => {
            throw new Error('Recovery cannot select decisions')
          },
          host: () => {
            throw new Error('Recovery cannot launch judgments')
          },
        })
        const recovered = await fresh.inspect(f.context.request, record)
        assert.equal(recovered.status, rejected ? 'blocked' : 'passed', JSON.stringify(recovered))
        assert.equal(recovered.decisions?.length, 3)
        assert.deepEqual(await fresh.inspect(f.context.request, record), recovered)
        assert.equal(native.calls().length, 7)
        assert.equal(f.store.budgets.inspect(f.context.request.run).deadline, originalDeadline)
        if (!rejected) {
          assert.ok(recovered.derivedPlan)
          f.store.lifecycle.transition(f.context.request.run, {
            to: 'queued',
            reason: 'Explicit trusted fixture continuation after paused recovery.',
          })
          f.observe(recovered)
          f.adopt(recovered.derivedPlan)
          assert.equal(
            f.store.record(contractDigest(f.context.request)).basis,
            recovered.derivedPlan.digest,
          )
          assert.equal(
            f.store.get(contractDigest(f.context.request)).grant,
            f.context.request.grant,
          )
          assert.equal(f.store.get(contractDigest(f.context.request)).plan, f.context.request.plan)
          assert.equal(f.store.budgets.inspect(f.context.request.run).deadline, originalDeadline)
          assert.deepEqual(
            f.store.permittedStages(contractDigest(f.context.request)).map((s) => s.id),
            ['plan'],
          )
        } else assert.throws(() => f.store.planning.getPlan(f.context.request.run, 2))
        checks.push(
          rejected
            ? 'independent rejection leaves the immutable next revision unreserved, including paused recovery'
            : 'three independent approvals recover interrupted revision reservation and adopt under the same grant and deadline without model replay',
        )
      } finally {
        clearTimeout(timer)
        abort.abort()
      }
    },
    {
      provenance: 'host-observed',
      stageBudget: 'plan',
      mode: rejected ? 'decision-reject' : 'valid',
    },
  )
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
