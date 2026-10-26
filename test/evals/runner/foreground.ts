import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DeliveryQueue } from '../../../src/delivery/queue.js'
import { decodeWorkerProposal } from '../../../src/delivery/worker-proposal.js'
import { createWorkerAssignment } from '../../../src/delivery/worker-protocol.js'
import { OwnedForegroundRunner, receiveOwnedForeground } from '../../../src/runner/foreground.js'
import { FOREGROUND_ARGUMENT } from '../../../src/runner/foreground-owner.js'
import { RunnerNativeScope } from '../../../src/runner/native-scope.js'
import { runnerDecisionRequirements } from '../../../src/runner/route.js'
import { type RunnerRequest, RunnerStore } from '../../../src/runner/store.js'
import { RunnerWorkerStages } from '../../../src/runner/worker-stages.js'
import { assertExternal } from '../../../src/state/paths.js'
import { authorization, fixture, git } from '../../support/delivery.js'
import { deliveryCommitFixture, prepareFixtureCommit } from '../../support/delivery-commits.js'
import { deliveryWorkspaceFixture } from '../../support/delivery-workspaces.js'
import { nativeDecisionFixture } from '../../support/native-decisions.js'
import { runnerGitRouteFixture } from '../../support/runner-git.js'
import { runnerWorkerFixture } from '../../support/runner-worker.js'

const core = fileURLToPath(import.meta.url)
if (process.argv[2] === FOREGROUND_ARGUMENT) {
  let input = ''
  for await (const chunk of process.stdin) {
    input += chunk
    if (Buffer.byteLength(input) > 65536) throw new Error('Bounded private bootstrap required')
  }
  await receiveOwnedForeground(JSON.parse(input), core, (request) => ({
    identity: request.host,
    preflight: async () => ({
      available: false,
      interactive: 'disabled',
      humanRequired: false,
      reason: 'This model-free fixture has no actual native model/runtime admission.',
    }),
    execute: async () => {
      throw new Error('A control fixture cannot execute an application')
    },
    inspect: async () => {
      throw new Error('No stage invocation exists')
    },
    endpoint: async () => {
      throw new Error('A control fixture cannot certify an endpoint')
    },
  }))
} else {
  const destination = process.argv[2]
  if (!destination || process.argv.length !== 3)
    throw new Error('Provide one external evidence directory')
  assertExternal(destination)
  mkdirSync(destination, { recursive: true })
  const checks: string[] = [],
    retained: { store: string; request: string }[] = [],
    nativeDecisions: { store: string; decision: string }[] = []
  for (const intervention of ['supervised', 'none'] as const)
    await fixture(
      async ({ planning, plan }) => {
        plan.policy.intervention = intervention
        const store = new RunnerStore(planning.sources.files.root),
          prepared = planning.preparePlan(plan),
          grant = store.lifecycle.authority.authorize(authorization(plan, prepared.digest))
        store.lifecycle.track({ run: plan.run, revision: 1, grant: grant.grant.id })
        const request: RunnerRequest = {
            schema: 'wholeloop/delivery-runner-request@1',
            key: 'model-free-control',
            run: plan.run,
            revision: 1,
            plan: prepared.digest,
            grant: grant.grant.id,
            host: { id: 'fixture', version: '1', configuration: 'a'.repeat(64) },
            pollMs: 50,
          },
          digest = store.prepare(request).digest,
          runner = new OwnedForegroundRunner(store),
          first = await runner.run(digest, core)
        assert.equal(first.status.state, intervention === 'none' ? 'blocked' : 'paused')
        assert.equal(first.status.ownership, 'released')
        assert.equal(first.process.invocationState, 'stopped')
        assert.equal(first.process.code, 0)
        assert.deepEqual(first.status.stages, [])
        retained.push({ store: store.files.root, request: digest })
        checks.push(
          `${intervention}: actual group-bound private bootstrap and honest no-model endpoint limitation`,
        )
        if (intervention === 'none') {
          const research = structuredClone(plan)
          research.policy.endpoint = 'research-report'
          research.definition = {
            ready: false,
            missing: ['Select bounded independent research angles.'],
          }
          assert.deepEqual(
            runnerDecisionRequirements(research, { kind: 'definition' }, 'envelope'),
            [{ id: 'research-plan', outcome: 'accept' }],
          )
          assert.deepEqual(runnerDecisionRequirements(research, { kind: 'research' }, 'plan'), [
            { id: 'research-sources', outcome: 'accept' },
          ])
          checks.push('initial research and later source judgments retain their own decision scope')
          const assigned = createWorkerAssignment({
              identity: {
                run: plan.run,
                plan: prepared.digest,
                revision: 0,
                role: 'planner',
                attempt: 'attempt-aaaaaaaaaaaaaaaa',
                generation: 1,
              },
              grantDigest: grant.digest,
              source: plan.source,
              brief: 'Return one scoped fixture proposal.',
              endpoint: plan.policy.endpoint,
              intervention: plan.policy.intervention,
              environment: { id: 'fixture', recipe: 'b'.repeat(64), boundary: 'c'.repeat(64) },
              candidates: [],
              criteria: [],
              findings: [],
              contracts: [],
              context: [],
              deadline: '2030-01-01T00:00:00.000Z',
              limits: plan.budgets,
            }),
            body = 'A bounded source report with exact Unicode: Δ.\n',
            proposed = decodeWorkerProposal(
              Buffer.from(
                JSON.stringify({
                  schema: 'wholeloop/delivery-worker-proposal@1',
                  assignment: assigned.assignment,
                  status: 'complete',
                  summary: 'Keep this normalized artifact as a fixture claim.',
                  artifacts: [{ ref: 'artifacts/report.md', kind: 'report', text: body }],
                  criteria: [],
                  findings: [],
                  unknowns: [],
                }),
              ),
              assigned,
            )
          assert.equal(proposed.artifacts[0]?.bytes.toString('utf8'), body)
          assert.equal(proposed.result.artifacts[0]?.bytes, Buffer.byteLength(body))
          assert.equal(proposed.result.origin, 'worker-claim')
          assert.equal(assigned.tools.workspace, 'none')
          checks.push(
            'read-only planner inline artifacts retain exact UTF-8 bytes and worker provenance',
          )
        }
        if (intervention === 'supervised') {
          const deadline = store.budgets.inspect(request.run).deadline
          store.control(digest, 'resume', 'Fixture Operator')
          const second = await runner.run(digest, core)
          assert.equal(second.status.generation, 2)
          assert.equal(second.process.invocationState, 'stopped')
          assert.equal(second.process.code, 0)
          assert.equal(store.budgets.inspect(request.run).deadline, deadline)
          checks.push('fresh owned controller generation retains the exact original run deadline')
        }
      },
      { retain: true },
    )
  await nativeDecisionFixture(
    async ({ host, decisions, request, purposes }) => {
      const result = await decisions.decide(request, host)
      assert.equal(result.record.status, 'fixture-only')
      assert.equal(result.record.judgment.identity.role, 'planner')
      assert.equal(result.record.challenge.identity.role, 'challenger')
      assert.notEqual(
        result.record.judgment.identity.invocation,
        result.record.challenge.identity.invocation,
      )
      assert.equal(result.record.humanApproval, 'not-recorded')
      assert.equal(host.current(result.record.judgment.identity, result.record.basis), true)
      nativeDecisions.push({
        store: purposes.queue.lifecycle.journal.files.root,
        decision: result.digest,
      })
      checks.push(
        'independent actual native fixture planner/challenger processes retain original budgets and fixture-only authority',
      )
    },
    'valid',
    'claude',
    { retain: true },
  )
  await deliveryWorkspaceFixture(async ({ workspaces, request, root }) => {
    const base = git(root, ['rev-parse', 'HEAD']),
      record = workspaces.prepare(request)
    assert.equal((await workspaces.execute(record.digest)).status, 'ready')
    assert.equal((await workspaces.reconcile(record.digest)).status, 'ready')
    assert.equal(git(root, ['rev-parse', 'HEAD']), base)
    assert.equal(workspaces.effects.inspect(request.run).length, 1)
    checks.push(
      'actual owned subjectless Git workspace creation and read-only reconciliation preserve the personal checkout',
    )
  })
  await deliveryCommitFixture(async ({ commits, workspace, path, root }) => {
    const base = git(root, ['rev-parse', 'HEAD'])
    writeFileSync(join(path, 'app.txt'), 'Pin an actual disposable owned candidate.\n')
    const prepared = prepareFixtureCommit(commits, workspace),
      result = await commits.execute(prepared.digest)
    assert.equal(result.status, 'committed')
    assert.equal(result.receipt?.parent, base)
    assert.equal(commits.workspaces.inspect(workspace).head, result.receipt?.head)
    assert.equal(git(root, ['rev-parse', 'HEAD']), base)
    assert.equal((await commits.reconcile(prepared.digest)).status, 'committed')
    assert.equal(commits.effects.inspect(prepared.run).length, 3)
    assert.equal(result.acceptance, 'not-established')
    checks.push(
      'actual owned staging/commit and private head recovery retain the personal branch and grant no QA authority',
    )
  })
  const gitRoute = await runnerGitRouteFixture()
  assert.equal(gitRoute.state, 'paused')
  assert.equal(gitRoute.outcome, null)
  assert.equal(gitRoute.effects, 7)
  const actualGit = gitRoute.stages.filter((stage) => /^(workspace|commit):/.test(stage.id))
  assert.equal(actualGit.length, 4)
  assert.ok(
    actualGit.every((stage) => stage.status === 'passed' && stage.provenance === 'host-observed'),
  )
  assert.ok(gitRoute.stages.every((stage) => stage.status === 'passed'))
  checks.push(
    'the actual runner drives both owned Git units and committed predecessors while fixture-only semantic stages cannot establish an endpoint',
  )
  await runnerWorkerFixture(
    async ({ workers, store, request, queue, options, dispatch, digest }) => {
      const context = dispatch('implementation:search'),
        result = await workers.execute(context),
        stage = store.stage(digest, context.stage.id),
        entry = queue.inspect(request.run)[0]
      assert.equal(result.status, 'passed')
      assert.equal(result.provenance, 'fixture')
      assert.equal(result.invocationState, 'stopped')
      assert.ok(stage && entry?.attempt)
      const lease = queue.assigned(request.run, entry.attempt)
      assert.equal(workers.native.completed(lease), true)
      assert.equal(workers.native.retained(lease)?.receipt?.acceptance, 'not-established')
      store.lifecycle.transition(request.run, {
        to: 'paused',
        reason: 'Observe the original native completion without resuming.',
      })
      const fresh = new RunnerWorkerStages(
        new RunnerStore(store.files.root),
        new DeliveryQueue(store.files.root),
        options,
      )
      assert.equal((await fresh.inspect(request, stage)).status, 'passed')
      assert.equal(new RunnerNativeScope(store.files, context.invocation).calls().length, 1)
      assert.equal(store.inspect(digest).outcome, null)
      checks.push(
        'an actual synthetic native worker joins its original root stage and recovers while paused without replay, QA or endpoint authority',
      )
    },
  )
  const report = {
    status: 'passed',
    provenance: 'fixture',
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    checks,
    retained,
    nativeDecisions,
    nativeAcceptance: 'not-established',
    publication: 'not-performed',
  }
  writeFileSync(join(destination, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report))
}
