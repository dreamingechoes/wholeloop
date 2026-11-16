import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { DeliveryEffects } from '../../../src/delivery/effects.js'
import type { DeliveryPlan } from '../../../src/delivery/plan.js'
import { continueDelivery } from '../../../src/runner/continuation.js'
import {
  DeliveryRunner,
  type DeliveryRunnerHost,
  envelopeContinuation,
  type RunnerStageObservation,
} from '../../../src/runner/engine.js'
import { deliveryRunner } from '../../../src/runner/events.js'
import { deliveryReport } from '../../../src/runner/operator-report.js'
import { runnerRoute } from '../../../src/runner/route.js'
import { type RunnerRequest, RunnerStore } from '../../../src/runner/store.js'
import { authorization, envelope, fixture } from '../../support/delivery.js'

const FAILURE = 'f'.repeat(64)
/**
 * A synthetic controller host: it records every observation it issues, can
 * re-inspect them by invocation, and fails integration while `failing` is set.
 */
function syntheticHost(identity: RunnerRequest['host']) {
  const issued = new Map<string, RunnerStageObservation>(),
    executed: string[] = [],
    state = { failing: true, stale: new Set<string>() }
  const host: DeliveryRunnerHost = {
    identity,
    preflight: async () => ({
      available: true,
      interactive: 'disabled',
      humanRequired: false,
      reason: 'The explicit synthetic controller protocol is available.',
    }),
    execute: async (context) => {
      context.started({
        backend: 'fixture',
        instance: context.invocation,
        worker: context.stage.id,
      })
      executed.push(context.stage.id)
      const failed = state.failing && context.stage.kind === 'integration',
        observation: RunnerStageObservation = {
          schema: 'wholeloop/delivery-runner-stage-observation@1',
          plan: contractDigest(context.plan),
          request: contractDigest(context.request),
          stage: context.stage.id,
          invocation: context.invocation,
          status: failed ? 'failed' : 'passed',
          invocationState: 'stopped',
          evidence: failed ? FAILURE : contractDigest({ stage: context.stage.id }),
          provenance: 'fixture',
          reason: failed
            ? 'Original bounded product QA fails at the current QA-ready assembly.'
            : 'The selected normalized fixture host observed its exact stage.',
        }
      issued.set(context.invocation, observation)
      return observation
    },
    inspect: async (_request, record) => {
      const observation = issued.get(record.invocation)
      if (!observation) throw new Error('Unknown invocation')
      // A stale original no longer inspects with its evidence and must run again.
      return state.stale.has(record.id)
        ? { ...observation, evidence: 'e'.repeat(64) }
        : structuredClone(observation)
    },
    endpoint: async () => {
      throw new Error('No endpoint is certified by the fixture host.')
    },
  }
  return { host, executed, state }
}

async function setup(
  run: (input: {
    store: RunnerStore
    plan: DeliveryPlan
    request: RunnerRequest
    digest: string
  }) => Promise<void>,
  options: {
    envelope?: boolean
    repairs?: number
    /** Start a none run under its own envelope grant with these effects (ADR-0198). */
    unattended?: readonly string[]
  } = {},
) {
  await fixture(async ({ planning, plan }) => {
    plan.work = plan.work
      .filter((work) => work.id === 'search')
      .map((work) => ({ ...work, after: [], consumes: [] }))
    plan.milestones = plan.milestones.map((milestone) => ({ ...milestone, work: ['search'] }))
    plan.policy.intervention = options.unattended ? 'none' : 'supervised'
    if (options.repairs !== undefined) plan.budgets.integrationRepairs = options.repairs
    if (options.envelope || options.unattended)
      plan.envelope = planning.prepareEnvelope(envelope(plan)).digest
    const store = new RunnerStore(planning.sources.files.root),
      prepared = planning.preparePlan(plan),
      grant = store.lifecycle.authority.authorize(
        options.unattended
          ? {
              ...authorization(plan, prepared.digest),
              basis: { kind: 'envelope', digest: plan.envelope ?? '' },
              effects: [...options.unattended] as never,
            }
          : authorization(plan, prepared.digest),
      )
    store.lifecycle.track({ run: plan.run, revision: 1, grant: grant.grant.id })
    const request: RunnerRequest = {
      schema: 'wholeloop/delivery-runner-request@1',
      key: 'first',
      run: plan.run,
      revision: 1,
      plan: prepared.digest,
      grant: grant.grant.id,
      host: { id: 'fixture', version: '1', configuration: 'a'.repeat(64) },
      pollMs: 50,
    }
    await run({ store, plan, request, digest: prepared.digest })
  })
}
const failedRun = async (store: RunnerStore, request: RunnerRequest) => {
  const synthetic = syntheticHost(request.host),
    prepared = store.prepare(request),
    result = await new DeliveryRunner(store).run(prepared.digest, synthetic.host)
  return { synthetic, prepared, result }
}

/**
 * A none route needs delegated decision records at several stages. Those are
 * covered by their own suites; here the decision store accepts every required
 * decision so the test isolates the unattended continuation (ADR-0198).
 */
const DECISION_IDS = [
  'delivery-plan',
  'frame-outcome',
  'approve-spec',
  'approve-scopes',
  'approve-build-plan',
  'acceptance',
] as const
const DECISION_DIGESTS = DECISION_IDS.map((id) => contractDigest({ decision: id }))
function delegateEverything(store: RunnerStore, host: DeliveryRunnerHost) {
  vi.spyOn(store.decisions, 'pin').mockImplementation(() => ({}) as never)
  vi.spyOn(store.decisions, 'preflight').mockImplementation(() => ({ status: 'ready' }) as never)
  vi.spyOn(store.decisions, 'inspect').mockImplementation((digest: string) => {
    const id = DECISION_IDS[DECISION_DIGESTS.indexOf(digest)],
      run = store.lifecycle.journal.events().at(-1)?.run ?? '',
      state = store.lifecycle.journal.view(run),
      authority = store.lifecycle.authority.inspect(state.grant?.id ?? '')
    return {
      status: 'current',
      record: {
        request: { plan: state.basis.digest, decision: id },
        grantDigest: authority.digest,
        judgment: { outcome: id === 'frame-outcome' ? 'go' : 'accept' },
      },
    } as never
  })
  const execute = host.execute
  host.execute = async (context) => ({ ...(await execute(context)), decisions: DECISION_DIGESTS })
}

afterEach(() => vi.restoreAllMocks())

describe('cross-invocation correction (ADR-0193, ADR-0197)', () => {
  it('previews a correction for a retained integration failure without writing', () =>
    setup(async ({ store, plan, request }) => {
      const { prepared, result } = await failedRun(store, request)
      expect(result).toMatchObject({ state: 'failed', outcome: 'failed' })
      const integration = result.stages.find((stage) => stage.id.startsWith('integration:'))
      expect(integration).toMatchObject({ status: 'failed', evidence: FAILURE })
      const journal = contractDigest(store.lifecycle.journal.events()),
        preview = continueDelivery(store.lifecycle, plan.run, {
          request: prepared.digest,
          stage: integration?.id ?? '',
          unit: 'search',
        })
      expect(preview.admission).toMatchObject({
        status: 'admissible',
        origin: 'integration',
        failure: FAILURE,
        authority: 'new-exact-plan-grant-required',
      })
      const decisions = Object.fromEntries(
        (preview.impact?.stages ?? []).map((entry) => [entry.id, entry.decision]),
      )
      expect(decisions).toMatchObject({
        plan: 'invalidate',
        'acceptance-definition': 'reuse',
        'workspace:search': 'reuse',
        'build-plan:search': 'reuse',
        'implementation:search': 'reuse',
        'commit:search': 'reuse',
        'correction-1:search': 'new',
        'verification:search': 'invalidate',
        'review:search': 'invalidate',
        'reverification:search': 'invalidate',
        acceptance: 'invalidate',
        handoff: 'invalidate',
      })
      expect(contractDigest(store.lifecycle.journal.events())).toBe(journal)
      expect(store.planning.getPlan(plan.run, 1).plan.corrections).toBeUndefined()
      expect(deliveryReport(store.files.root, plan.run).next).toContain(
        `wl delivery continue --run ${plan.run} --request ${prepared.digest} --stage ${integration?.id} --unit <work-id>`,
      )
      expect(() =>
        continueDelivery(
          store.lifecycle,
          plan.run,
          { request: prepared.digest, stage: 'review:search', unit: 'search' },
          { operator: 'Fixture Operator', reason: 'Wrong stage.' },
        ),
      ).toThrow('continuation-not-admissible')
    }))
  it('reopens only under a new exact-plan grant and runs grant-bound stages again', () =>
    setup(async ({ store, plan, request }) => {
      const { synthetic, prepared, result } = await failedRun(store, request),
        failure = result.stages.find((stage) => stage.id.startsWith('integration:'))
      const accepted = continueDelivery(
        store.lifecycle,
        plan.run,
        { request: prepared.digest, stage: failure?.id ?? '', unit: 'search' },
        { operator: 'Fixture Operator', reason: 'Repair the failed integration case.' },
      )
      expect(accepted.accepted).toBe(true)
      const next = store.planning.getPlan(plan.run, 2)
      // The failed run's grant cannot authorize the correction revision.
      expect(() =>
        store.lifecycle.track({ run: plan.run, revision: 2, grant: request.grant }),
      ).toThrow()
      expect(store.lifecycle.journal.get(plan.run)).toMatchObject({
        state: 'failed',
        outcome: 'failed',
      })
      const grant = store.lifecycle.authority.authorize({
        ...authorization(next.plan, next.digest),
        id: 'authorization-fedcba9876543210',
      })
      store.lifecycle.track({ run: plan.run, revision: 2, grant: grant.grant.id })
      const reopened = store.lifecycle.journal.get(plan.run)
      expect(reopened).toMatchObject({ state: 'planned', basis: { revision: 2 } })
      expect(reopened.outcome).toBeUndefined()
      expect(deliveryRunner(reopened).continuations).toEqual([
        expect.objectContaining({
          revision: 2,
          request: prepared.digest,
          stage: failure?.id,
          failure: FAILURE,
        }),
      ])
      expect(deliveryReport(store.files.root, plan.run).continuations).toEqual([
        { revision: 2, predecessor: prepared.digest, stage: failure?.id, failure: FAILURE },
      ])
      synthetic.state.failing = false
      synthetic.executed.length = 0
      const successor = store.prepare({
          ...request,
          key: 'continuation-1',
          revision: 2,
          plan: next.digest,
          grant: grant.grant.id,
        }),
        continued = await new DeliveryRunner(store).run(successor.digest, synthetic.host)
      // ADR-0208: workspace, commit and acceptance-definition records are bound
      // to the earlier grant and revision, and every stage depends on them, so
      // nothing is reused and the whole route runs under the new grant.
      expect(continued.stages.filter((stage) => stage.origin)).toEqual([])
      expect(synthetic.executed).toEqual(runnerRoute(next.plan).map((stage) => stage.id))
      expect(continued.stages.every((stage) => stage.status === 'passed')).toBe(true)
      // The predecessor's records stay historical: its failure is unchanged and
      // nothing it observed counts for the new basis except explicit reuse.
      const predecessor = deliveryRunner(store.lifecycle.journal.get(plan.run)).records.find(
        (record) => record.request === prepared.digest,
      )
      expect(predecessor?.stages.find((stage) => stage.id === failure?.id)).toMatchObject({
        status: 'failed',
        evidence: FAILURE,
        basis: request.plan,
      })
      expect(predecessor?.stages.every((stage) => stage.basis === request.plan)).toBe(true)
    }))
  it('never reuses grant- or revision-bound stages, even when their originals inspect as current', () =>
    setup(async ({ store, plan, request }) => {
      const { synthetic, prepared, result } = await failedRun(store, request),
        failure = result.stages.find((stage) => stage.id.startsWith('integration:'))
      continueDelivery(
        store.lifecycle,
        plan.run,
        { request: prepared.digest, stage: failure?.id ?? '', unit: 'search' },
        { operator: 'Fixture Operator', reason: 'Repair the failed integration case.' },
      )
      const next = store.planning.getPlan(plan.run, 2),
        grant = store.lifecycle.authority.authorize({
          ...authorization(next.plan, next.digest),
          id: 'authorization-fedcba9876543210',
        })
      store.lifecycle.track({ run: plan.run, revision: 2, grant: grant.grant.id })
      synthetic.state.failing = false
      synthetic.executed.length = 0
      const successor = store.prepare({
          ...request,
          key: 'continuation-1',
          revision: 2,
          plan: next.digest,
          grant: grant.grant.id,
        }),
        continued = await new DeliveryRunner(store).run(successor.digest, synthetic.host)
      // Every original still inspects with its evidence, yet these run again.
      expect(continued.stages.filter((stage) => stage.origin)).toEqual([])
      for (const id of ['acceptance-definition', 'workspace:search', 'commit:search'])
        expect(synthetic.executed).toContain(id)
    }))
  it('refuses an envelope grant, pending effects and an exhausted repair budget', () =>
    setup(
      async ({ store, plan, request }) => {
        const { prepared, result } = await failedRun(store, request),
          failure = result.stages.find((stage) => stage.id.startsWith('integration:'))
        continueDelivery(
          store.lifecycle,
          plan.run,
          { request: prepared.digest, stage: failure?.id ?? '', unit: 'search' },
          { operator: 'Fixture Operator', reason: 'Repair the failed integration case.' },
        )
        // Even a freshly issued envelope grant, which would cover revision 2 by
        // its envelope, cannot start a continuation: it needs the exact plan.
        const wide = store.lifecycle.authority.authorize({
          ...authorization(plan, request.plan),
          id: 'authorization-00000000000e0e0e',
          basis: { kind: 'envelope', digest: plan.envelope ?? '' },
        })
        expect(() =>
          store.lifecycle.track({ run: plan.run, revision: 2, grant: wide.grant.id }),
        ).toThrow('continuation-requires-new-grant')
        expect(store.lifecycle.journal.get(plan.run).state).toBe('failed')
        new DeliveryEffects(store.files.root).prepare(plan.run, {
          key: 'pending-commit',
          operation: 'git.commit',
          repository: 'app',
          ref: 'wl/search',
          expectedHead: plan.repositories[0]?.base ?? '',
          inputDigest: 'c'.repeat(64),
        })
        const input = { request: prepared.digest, stage: failure?.id ?? '', unit: 'search' }
        expect(continueDelivery(store.lifecycle, plan.run, input).admission.reasons).toContain(
          'effects-need-reconciliation',
        )
        expect(() =>
          continueDelivery(store.lifecycle, plan.run, input, {
            operator: 'Fixture Operator',
            reason: 'Repair.',
          }),
        ).toThrow('continuation-not-admissible')
      },
      { envelope: true },
    ))
  it('previews and records through the compiled CLI with exact next steps', () =>
    setup(async ({ store, plan, request }) => {
      const { prepared, result } = await failedRun(store, request),
        failure = result.stages.find((stage) => stage.id.startsWith('integration:')),
        wl = (extra: string[]) =>
          spawnSync(
            process.execPath,
            [
              resolve('dist/wl.mjs'),
              'delivery',
              'continue',
              '--run',
              plan.run,
              '--request',
              prepared.digest,
              '--stage',
              failure?.id ?? '',
              '--unit',
              'search',
              '--store',
              store.files.root,
              ...extra,
              '--json',
            ],
            { encoding: 'utf8' },
          )
      const preview = wl([])
      expect(preview.status, preview.stderr).toBe(0)
      expect(JSON.parse(preview.stdout)).toMatchObject({
        schema: 'wholeloop/delivery-continue@1',
        admission: { status: 'admissible', failure: FAILURE },
        accepted: false,
        record: null,
        next: [],
      })
      expect(wl(['--accept', '--operator', 'Fixture Operator']).status).toBe(2)
      const accepted = wl(['--accept', '--operator', 'Fixture Operator', '--reason', 'Repair.'])
      expect(accepted.status, accepted.stderr).toBe(0)
      const output = JSON.parse(accepted.stdout)
      expect(output).toMatchObject({
        accepted: true,
        record: { revision: 2, authority: 'new-exact-plan-grant-required' },
      })
      expect(output.next[1]).toBe(
        `wl delivery track --run ${plan.run} --revision 2 --grant <new-authorization-id>`,
      )
      // Recording the revision does not reopen the run.
      expect(store.lifecycle.journal.get(plan.run).state).toBe('failed')
    }))
  it('continues a none run under its own envelope grant with no human step (ADR-0198)', () =>
    setup(
      async ({ store, plan, request }) => {
        const synthetic = syntheticHost(request.host),
          prepared = store.prepare(request)
        delegateEverything(store, synthetic.host)
        let failures = 1
        const execute = synthetic.host.execute
        synthetic.host.execute = async (context) => {
          // The first integration fails once; the repaired revision passes.
          synthetic.state.failing = context.stage.kind === 'integration' && failures-- > 0
          return execute(context)
        }
        const result = await new DeliveryRunner(store).runWithRepairs(
          prepared.digest,
          synthetic.host,
        )
        const run = store.lifecycle.journal.get(plan.run)
        expect(run.basis.revision).toBe(2)
        expect(deliveryRunner(run).continuations).toEqual([
          expect.objectContaining({ revision: 2, request: prepared.digest }),
        ])
        // The continuation is started by the controller, under the original grant.
        expect(store.lifecycle.journal.get(plan.run).grant?.id).toBe(request.grant)
        const receipt = JSON.parse(
          store.files.read(`delivery/continuations/${plan.run}/2.json`) ?? '{}',
        )
        expect(receipt).toMatchObject({
          authority: 'envelope-grant-continuation',
          operator: 'wholeloop controller',
        })
        const next = store.planning.getPlan(plan.run, 2)
        expect(synthetic.executed.slice(-runnerRoute(next.plan).length)).toEqual(
          runnerRoute(next.plan).map((stage) => stage.id),
        )
        expect(result.stages.every((stage) => stage.status === 'passed')).toBe(true)
      },
      {
        unattended: [
          'source.read',
          'report.write',
          'workspace.create',
          'code.write',
          'test.run',
          'git.commit',
        ],
        repairs: 2,
      },
    ))

  it.each([
    { released: false, revision: 1 },
    { released: true, revision: 2 },
  ])(
    "releases the failed request's environments first and continues only when that succeeds (released $released)",
    ({ released, revision }) =>
      setup(
        async ({ store, plan, request }) => {
          const synthetic = syntheticHost(request.host),
            prepared = store.prepare(request),
            calls: string[] = []
          delegateEverything(store, synthetic.host)
          let failures = 1
          const execute = synthetic.host.execute
          synthetic.host.execute = async (context) => {
            synthetic.state.failing = context.stage.kind === 'integration' && failures-- > 0
            return execute(context)
          }
          // ADR-0248: the host stops the failed request's environments before the
          // continuation is recorded; a failed stop leaves the run for an operator.
          synthetic.host.release = async (value) => {
            calls.push(contractDigest(value))
            expect(store.files.read(`delivery/continuations/${plan.run}/2.json`)).toBeUndefined()
            return released
          }
          await new DeliveryRunner(store).runWithRepairs(prepared.digest, synthetic.host)
          const run = store.lifecycle.journal.get(plan.run)
          expect(calls).toEqual([prepared.digest])
          expect(run.basis.revision).toBe(revision)
          if (!released) {
            expect(run.state).toBe('failed')
            expect(store.files.read(`delivery/continuations/${plan.run}/2.json`)).toBeUndefined()
          }
        },
        {
          unattended: [
            'source.read',
            'report.write',
            'workspace.create',
            'code.write',
            'test.run',
            'git.commit',
          ],
          repairs: 2,
        },
      ),
  )

  it('keeps the new-grant rule when a condition is missing', () =>
    setup(
      async ({ store, plan, request }) => {
        const synthetic = syntheticHost(request.host),
          prepared = store.prepare(request)
        delegateEverything(store, synthetic.host)
        await new DeliveryRunner(store).run(prepared.digest, synthetic.host)
        // Without test.run the envelope grant cannot start a continuation.
        const failure = store
          .record(prepared.digest)
          .stages.find((stage) => stage.id.startsWith('integration:'))
        continueDelivery(
          store.lifecycle,
          plan.run,
          { request: prepared.digest, stage: failure?.id ?? '', unit: 'search' },
          { operator: 'Fixture Operator', reason: 'Repair the failed integration case.' },
        )
        expect(() =>
          store.lifecycle.track({ run: plan.run, revision: 2, grant: request.grant }),
        ).toThrow('continuation-requires-new-grant')
        expect(store.lifecycle.journal.get(plan.run).state).toBe('failed')
      },
      {
        unattended: ['source.read', 'report.write', 'workspace.create', 'code.write', 'git.commit'],
        repairs: 2,
      },
    ))

  it('ends the run when the repair budget is spent, and never continues under a revoked grant', () =>
    setup(
      async ({ store, plan, request }) => {
        const synthetic = syntheticHost(request.host),
          prepared = store.prepare(request)
        delegateEverything(store, synthetic.host)
        // Every integration fails: one repair is allowed, then the run ends failed.
        const result = await new DeliveryRunner(store).runWithRepairs(
          prepared.digest,
          synthetic.host,
        )
        expect(result.state).toBe('failed')
        expect(deliveryRunner(store.lifecycle.journal.get(plan.run)).continuations).toHaveLength(1)
        // A revoked envelope grant never authorizes another continuation.
        store.lifecycle.authority.revoke({
          schema: 'wholeloop/delivery-revocation-request@1',
          grant: request.grant,
          operator: 'Fixture Operator',
          reason: 'Revoke the envelope grant.',
        })
        const last = deliveryRunner(store.lifecycle.journal.get(plan.run)).records.at(-1)
        expect(envelopeContinuation(store, last?.request ?? prepared.digest)).toBeUndefined()
      },
      {
        unattended: [
          'source.read',
          'report.write',
          'workspace.create',
          'code.write',
          'test.run',
          'git.commit',
        ],
        repairs: 1,
      },
    ))

  it('never exceeds the repair budget of the run', () =>
    setup(
      async ({ store, plan, request }) => {
        const { prepared, result } = await failedRun(store, request),
          failure = result.stages.find((stage) => stage.id.startsWith('integration:')),
          preview = continueDelivery(store.lifecycle, plan.run, {
            request: prepared.digest,
            stage: failure?.id ?? '',
            unit: 'search',
          })
        expect(preview.admission).toMatchObject({
          status: 'refused',
          repairs: { used: 0, limit: 0 },
        })
        expect(preview.admission.reasons).toContain('repair-budget-exhausted')
      },
      { repairs: 0 },
    ))
})
