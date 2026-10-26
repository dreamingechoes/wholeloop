import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DeliveryAcceptance } from '../../../src/acceptance/store.js'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { sourceHash } from '../../../src/delivery/input.js'
import { FlowEngine } from '../../../src/flow/engine.js'
import { gateRuns } from '../../../src/gates/state.js'
import { GateWorkflow } from '../../../src/gates/workflow.js'
import { RunnerAcceptanceDefinitionStages } from '../../../src/runner/acceptance-definition-stages.js'
import { RunnerDefinitionStages } from '../../../src/runner/definition-stages.js'
import { RunnerNativeScope } from '../../../src/runner/native-scope.js'
import { RunnerPlanStages } from '../../../src/runner/plan-stages.js'
import { admitRunnerRepair } from '../../../src/runner/repair-admission.js'
import {
  knownSuiteFailure,
  repairFailureFingerprint,
  runnerRepairFeedback,
} from '../../../src/runner/repair-feedback.js'
import { RunnerReviewStages } from '../../../src/runner/review-stages.js'
import { RunnerStore } from '../../../src/runner/store.js'
import { StateStore } from '../../../src/state/store.js'
import { observeContractArtifacts } from '../../../src/verification/contract-artifacts.js'
import { fixture, git } from '../../support/delivery.js'
import { nativeGateFixture } from '../../support/native-gate.js'
import { runnerArtifactFixture } from '../../support/runner-artifact.js'
import { runnerDefinitionFixture } from '../../support/runner-definition.js'
import { runnerPlanFixture } from '../../support/runner-plan.js'

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
await runnerArtifactFixture(async (f) => {
  const stage = new RunnerAcceptanceDefinitionStages(f.store, {
      identity: f.context.request.host,
      native: (process) => ({ ...f.native, process }),
      context: () => f.input,
    }),
    result = await stage.execute(f.context)
  assert.equal(result.status, 'passed', JSON.stringify(result))
  assert.equal(result.invocationState, 'stopped')
  assert.deepEqual(new StateStore(f.store.files.root).events(), [])
  const record = f.store.stage(contractDigest(f.context.request), f.context.stage.id)
  assert.ok(record)
  const produced = await stage.artifacts.inspect(f.context.request, record)
  assert.ok(produced.prepared)
  const acceptance = new DeliveryAcceptance(f.store.files.root)
  for (const test of acceptance.get(produced.prepared.digest).plan.cases)
    assert.deepEqual(acceptance.observedResults(produced.prepared.digest, test.id), [])
  assert.equal(
    existsSync(f.store.files.path(`delivery/acceptance-human/${produced.prepared.digest}`)),
    false,
  )
  const index = f.store.files.path(`delivery/acceptance-index/${produced.prepared.digest}.json`)
  renameSync(index, `${index}.retained`)
  f.store.lifecycle.transition(f.context.request.run, {
    to: 'paused',
    reason: 'Recover original test definitions without executing acceptance.',
  })
  const fresh = new RunnerAcceptanceDefinitionStages(new RunnerStore(f.store.files.root), {
    identity: f.context.request.host,
    native: () => {
      throw new Error('Recovery cannot launch a test-definition producer')
    },
    context: () => {
      throw new Error('Recovery cannot select test-definition context')
    },
  })
  assert.deepEqual(await fresh.inspect(f.context.request, record), result)
  assert.equal(existsSync(index), true)
  assert.equal(new RunnerNativeScope(f.store.files, f.context.invocation).calls().length, 1)
  assert.equal(f.store.lifecycle.journal.get(f.context.request.run).state, 'paused')
  checks.push(
    'observed pre-builder acceptance definitions recover lost pin metadata without tests, human approval or worker replay',
  )
}, 'host-observed')
for (const withinEnvelope of [false, true]) {
  await runnerPlanFixture(
    async (f) => {
      const result = await f.stages.execute(f.context)
      assert.equal(result.status, 'passed', JSON.stringify(result))
      assert.equal(result.invocationState, 'stopped')
      assert.equal(result.decisions?.length, withinEnvelope ? 1 : 0)
      assert.equal(
        new RunnerNativeScope(f.store.files, f.context.invocation).calls().length,
        withinEnvelope ? 2 : 0,
      )
      assert.throws(() => f.store.planning.getPlan(f.context.request.run, 2))
      // Exercise actual journal admission: a positive envelope alone is not a
      // started stage. Exact-plan metadata records its genuine core operation.
      f.observe(result)
      const record = f.store.stage(contractDigest(f.context.request), f.context.stage.id)
      assert.ok(record)
      f.store.lifecycle.transition(f.context.request.run, {
        to: 'paused',
        reason: 'Inspect only original plan authorization without another revision.',
      })
      const fresh = new RunnerPlanStages(new RunnerStore(f.store.files.root), {
        identity: f.context.request.host,
        requests: () => {
          throw new Error('Recovery cannot select another plan decision')
        },
        host: () => {
          throw new Error('Recovery cannot launch another plan judgment')
        },
      })
      assert.deepEqual(await fresh.inspect(f.context.request, record), result)
      checks.push(
        withinEnvelope
          ? 'current envelope plan acceptance cites exact pinned bytes and recovers both original independent workers without another revision'
          : 'exact-plan authority admits genuine core metadata work without model calls or another revision',
      )
    },
    { provenance: 'host-observed', withinEnvelope },
  )
}
await fixture(async (f) => {
  const body = 'Title query returns matching task IDs.\n',
    ref = 'search-contract.txt'
  writeFileSync(join(f.root, ref), body)
  git(f.root, ['add', ref])
  git(f.root, [
    'commit',
    '-m',
    'test: pin the mechanical contract',
    '-m',
    'Observe actual declared artifact bytes without inferring QA.',
  ])
  for (const repo of f.plan.repositories) repo.base = git(f.root, ['rev-parse', 'HEAD'])
  const declared = f.plan.work.find((work) => work.id === 'contract')?.produces[0]
  assert.ok(declared)
  declared.sha256 = sourceHash(body)
  f.planning.preparePlan(f.plan)
  const workspace = join(f.dir, 'contract-topic')
  git(f.root, ['worktree', 'add', '-b', 'wl/contract-observation', workspace, 'HEAD'])
  const observed = observeContractArtifacts(f.plan, 'contract', workspace, { 'search-api': ref })
  assert.equal(observed.status, 'matched')
  assert.equal(observed.contracts[0]?.sha256, sourceHash(body))
  assert.equal(observed.qa, 'not-established')
  assert.equal(observed.humanApproval, 'not-recorded')
  assert.deepEqual(f.plan.work.find((work) => work.id === 'contract')?.criteria, [])
  const engine = new FlowEngine(
      new StateStore(f.planning.sources.files.root),
      f.root,
      join(f.dir, 'gate-config.yml'),
      join(f.dir, 'gate-home'),
    ),
    subject = engine.store.create({
      kind: 'review',
      title: 'Inspect committed contracts independently',
      owner: f.plan.owner,
      body: 'No product criteria or human approval are invented.',
      repository: workspace,
    }).id,
    gates = new GateWorkflow(engine),
    gate = gates.plan(subject, 'verify', {
      repo: workspace,
      base: 'main',
      contracts: {
        run: f.plan.run,
        revision: f.plan.revision,
        unit: 'contract',
        refs: { 'search-api': ref },
      },
    }).plan
  assert.equal(gate.units.filter((unit) => unit.origin === 'delivery:contracts').length, 1)
  assert.equal(gate.units.filter((unit) => unit.origin === 'agreed:criteria').length, 0)
  assert.ok(gate.units.find((unit) => unit.id === 'suite')?.failSafe)
  assert.deepEqual(gates.plan(subject, 'verify').plan, gate)
  assert.equal(engine.store.events().filter((event) => event.type === 'verify.agreed').length, 0)
  checks.push(
    'independent contract requirements retain the mandatory suite and exact original locators without product criteria or another selector',
  )
  writeFileSync(
    join(workspace, ref),
    'A changed committed contract is not the declared artifact.\n',
  )
  git(workspace, ['add', ref])
  git(workspace, [
    'commit',
    '-m',
    'test: change the observed contract',
    '-m',
    'Retain exact approved bytes rather than trusting a clean candidate alone.',
  ])
  assert.throws(
    () => observeContractArtifacts(f.plan, 'contract', workspace, { 'search-api': ref }),
    /contract-checksum-mismatch/,
  )
  checks.push(
    'actual external worktree contract bytes match exact declared identities while a changed clean commit refuses without invented QA or product criteria',
  )
})
const finding = {
    unit: 'contracts/search-api',
    id: 'one',
    location: 'contract.txt:1',
    text: 'Duplicate titles lose matching IDs.',
    evidence: ['observed fixture input'],
  },
  originalFingerprint = repairFailureFingerprint({
    category: 'verification-findings',
    unit: 'contract',
    commands: [],
    findings: [finding],
  })
assert.equal(
  originalFingerprint,
  repairFailureFingerprint({
    category: 'verification-findings',
    unit: 'contract',
    commands: [],
    findings: [
      { ...finding, id: 'another-model-id', text: ' Duplicate titles lose\n matching IDs. ' },
    ],
  }),
)
assert.equal(
  knownSuiteFailure([
    { ref: 'package.json#check', exitCode: 7, signal: '', diagnostic: 'a'.repeat(64) },
  ]),
  true,
)
assert.equal(
  knownSuiteFailure([
    { ref: 'package.json#check', exitCode: -1, signal: 'SIGTERM', diagnostic: 'a'.repeat(64) },
  ]),
  false,
)
checks.push(
  'repair fingerprints retain observed substance without counting model IDs or whitespace as progress',
)
for (const repairRounds of [1, 2]) {
  await nativeGateFixture(
    async ({ store, context, engine, options }) => {
      const abort = new AbortController(),
        timer = setTimeout(() => abort.abort(), 120000)
      context.signal = abort.signal
      context.deadline = new Date(
        Math.min(Date.parse(context.deadline), Date.now() + 120000),
      ).toISOString()
      try {
        if (!engine.userFile) throw new Error('Fixture explicit gate settings path missing')
        writeFileSync(
          engine.userFile,
          JSON.stringify({ version: 1, gates: { review: { rounds: repairRounds } } }),
        )
        const stages = new RunnerReviewStages(store, {
            identity: context.request.host,
            engine: () => engine,
            gate: options,
          }),
          result = await stages.execute(context),
          record = store.stage(contractDigest(context.request), context.stage.id)
        assert.equal(result.status, 'blocked', JSON.stringify(result))
        assert.equal(result.provenance, 'host-observed')
        const beforeAdmission = store.budgets.inspect(context.request.run),
          admission = await admitRunnerRepair(stages, context)
        if (repairRounds === 1) {
          assert.equal(admission.status, 'blocked')
          assert.equal(admission.reason, 'original-gate-budget-exhausted')
        } else {
          assert.equal(admission.status, 'admitted', JSON.stringify(admission))
          if (admission.status !== 'admitted')
            throw new Error('Original review repair admission unavailable')
          const repeated = await admitRunnerRepair(stages, context)
          assert.equal(repeated.status, 'admitted')
          if (repeated.status !== 'admitted')
            throw new Error('Repeated original admission unavailable')
          assert.equal(repeated.failure, admission.failure)
          assert.deepEqual(
            store.budgets.inspect(context.request.run).reservations,
            beforeAdmission.reservations,
          )
          assert.equal(
            store.budgets.inspect(context.request.run).deadline,
            beforeAdmission.deadline,
          )
        }
        assert.equal(admission.repairDispatch, 'not-performed')
        assert.ok(record)
        const round = gateRuns(engine.store.events()).at(-1)?.rounds.at(-1)
        assert.ok(round)
        const scope = new RunnerNativeScope(store.files, context.invocation),
          calls = scope.calls().length,
          deadline = store.budgets.inspect(context.request.run).deadline
        assert.equal(calls, round.plan.units.length + round.plan.verifiers)
        store.lifecycle.transition(context.request.run, {
          to: 'paused',
          reason: 'Read original kept findings without launching repair or judgment.',
        })
        const reader = new RunnerReviewStages(new RunnerStore(store.files.root), {
            identity: context.request.host,
            engine: () => engine,
            gate: () => {
              throw new Error('Feedback cannot construct a new judgment host')
            },
          }),
          feedback = await runnerRepairFeedback(reader, context.request, record)
        assert.notEqual(feedback.status, 'unavailable', JSON.stringify(feedback))
        if (feedback.status === 'unavailable')
          throw new Error('Original kept review finding unavailable')
        assert.equal(
          feedback.status,
          round.plan.round >= round.plan.budget ? 'exhausted' : 'actionable',
        )
        assert.equal(feedback.category, 'review-findings')
        assert.equal(feedback.findings.length, 1)
        assert.deepEqual(feedback.commands, [])
        assert.equal(feedback.repairDispatch, 'not-authorized')
        assert.equal(
          (await runnerRepairFeedback(reader, context.request, record)).status,
          feedback.status,
        )
        assert.equal(scope.calls().length, calls)
        assert.equal(store.budgets.inspect(context.request.run).deadline, deadline)
        checks.push(
          repairRounds === 1
            ? 'explicitly exhausted review refuses repair admission without another round or dispatch'
            : 'unattended review repair admission records the same original failure once without workers, deadline renewal or extra reservation',
        )
      } finally {
        clearTimeout(timer)
        abort.abort()
      }
    },
    'confirmed',
    'host-observed',
    'plan',
    true,
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
