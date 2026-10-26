import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodeWorkerProposal } from '../../../src/delivery/worker-proposal.js'
import { createWorkerAssignment } from '../../../src/delivery/worker-protocol.js'
import { OwnedForegroundRunner, receiveOwnedForeground } from '../../../src/runner/foreground.js'
import { FOREGROUND_ARGUMENT } from '../../../src/runner/foreground-owner.js'
import { runnerDecisionRequirements } from '../../../src/runner/route.js'
import { type RunnerRequest, RunnerStore } from '../../../src/runner/store.js'
import { assertExternal } from '../../../src/state/paths.js'
import { authorization, fixture } from '../../support/delivery.js'

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
    retained: { store: string; request: string }[] = []
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
  const report = {
    status: 'passed',
    provenance: 'fixture',
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    checks,
    retained,
    nativeAcceptance: 'not-established',
    publication: 'not-performed',
  }
  writeFileSync(join(destination, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report))
}
