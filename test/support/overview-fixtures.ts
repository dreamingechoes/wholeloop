import { readFileSync } from 'node:fs'
import { contractDigest } from '../../src/contracts/compatibility.js'
import type { AuthorizationReceipt, DeliveryGrant } from '../../src/delivery/authority.js'
import {
  type DeliveryEvent,
  type DeliveryPayload,
  type DeliveryState,
  deliveryEvent,
  validateDeliveryEvent,
} from '../../src/delivery/events.js'
import { DEFAULT_DELIVERY_BUDGETS } from '../../src/delivery/plan.js'
import { replayDelivery } from '../../src/delivery/reducer.js'
import { STEP_NAMES } from '../../src/flow/registry.js'
import { measurementDigest } from '../../src/launch/measurement.js'
import { encodeCursor, journalPosition } from '../../src/overview/cursor.js'
import { type OverviewInput, overviewProblem, projectOverview } from '../../src/overview/project.js'
import { projectDeliveryReport } from '../../src/runner/operator-report.js'
import { parseSlicePlan } from '../../src/slices/contract.js'
import { parseSpec } from '../../src/spec/contract.js'
import {
  type EventData,
  event,
  replay,
  type StateEvent,
  validateEvent,
} from '../../src/state/events.js'

export const FIXTURE_AT = '2026-11-04T20:00:00.000Z'
const run: string = 'delivery-0123456789abcdef',
  basis = 'a'.repeat(64),
  request = 'd'.repeat(64),
  controller = `controller-${'e'.repeat(32)}`,
  invocation = 'f'.repeat(64)
const configuration = { additions: [], checkpoints: ['launch', 'd7', 'd30'] }
export const OVERVIEW_CASES = [
  'empty',
  'ready',
  'idle',
  'complete',
  'running',
  'fixture-worker',
  'host-worker',
  'waiting',
  'store-problem',
  'item-decision',
  'unread-mail',
  'inactive-grant',
  'unavailable-basis',
  'budget-boundary',
  'failed-run',
  'exhausted-run',
  'blocked-run',
  'paused-run',
  'unknown-worker',
  'human-decision',
  'ambiguous-effect',
  'blocked-dependency',
  'due-checkpoint',
] as const
export type OverviewCase = (typeof OVERVIEW_CASES)[number]

/** Static archives are consumer examples, never imported as runtime grants or observations. */
export function overviewFixture(name: OverviewCase) {
  const state: StateEvent[] = [],
    delivery: DeliveryEvent[] = []
  const grant: DeliveryGrant = {
    schema: 'wholeloop/delivery-grant@1',
    id: 'authorization-0123456789abcdef',
    operator: 'Fixture Operator',
    basis: { kind: 'plan', digest: basis, run, revision: 1 },
    effects: ['source.read', 'report.write'],
    decisions: [],
    repositories: [],
    reads: [],
    effectLimit: 20,
    requestDigest: 'b'.repeat(64),
    issuedAt: '2026-11-04T12:00:00.000Z',
    expiresAt: '2026-11-05T12:00:00.000Z',
    source: 'c'.repeat(64),
    owner: 'Fixture Owner',
    policy: {
      endpoint: 'local-handoff',
      intervention: 'supervised',
      uncertainty: 'blocked',
      delegations: [],
    },
    budgets: { ...DEFAULT_DELIVERY_BUDGETS },
    provenance: 'operator-control',
  }
  const receipt: AuthorizationReceipt = {
    schema: 'wholeloop/delivery-authorization@1',
    digest: contractDigest(grant),
    grant,
    status: name === 'inactive-grant' ? 'expired' : 'active',
    revocation: null,
    runtime: 'not-observed-by-this-command',
  }
  let index = 0
  const uuid = () => `00000000-0000-4000-8000-${(++index).toString(16).padStart(12, '0')}`
  const append = (subject: string, data: EventData) => {
    const value = { ...event(subject, data, FIXTURE_AT), id: `ev-${uuid()}` }
    validateEvent(value)
    state.push(value)
    replay(state)
    return value
  }
  const emit = (payload: DeliveryPayload) => {
    const value = deliveryEvent(
      run,
      { kind: 'controller', name: 'Fixture' },
      payload,
      delivery.at(-1),
      FIXTURE_AT,
    )
    const { digest: _digest, ...body } = { ...value, id: `delivery-event-${uuid()}` }
    const canonical = { ...body, digest: contractDigest(body) }
    validateDeliveryEvent(canonical)
    delivery.push(canonical)
    replayDelivery(delivery)
    return canonical
  }
  let current: DeliveryState = 'planned'
  const transition = (to: DeliveryState) => {
    emit({
      schema: 'wholeloop/delivery-control-event@1',
      basis,
      from: current,
      to,
      reason: 'Synthetic consumer fixture.',
      ...(['failed', 'blocked', 'exhausted'].includes(to)
        ? { outcome: to as 'failed' | 'blocked' | 'exhausted' }
        : {}),
    })
    current = to
  }
  const item = (
    id = 'init-00000001',
    kind: 'initiative' | 'scope' | 'slice' = 'initiative',
    parent?: string,
  ) =>
    append(id, {
      type: 'item.created',
      data: {
        kind,
        title: 'PRIVATE_FIXTURE_TITLE',
        owner: 'PRIVATE_FIXTURE_OWNER',
        body: 'PRIVATE_FIXTURE_BODY',
        ...(parent ? { parent } : {}),
      },
    })
  const observedWorker = name === 'fixture-worker' || name === 'host-worker'
  const isDelivery =
    observedWorker ||
    [
      'running',
      'waiting',
      'inactive-grant',
      'unavailable-basis',
      'budget-boundary',
      'failed-run',
      'exhausted-run',
      'blocked-run',
      'paused-run',
      'unknown-worker',
      'human-decision',
      'ambiguous-effect',
    ].includes(name)
  if (isDelivery) {
    emit({
      schema: 'wholeloop/delivery-registration-event@1',
      basis: { kind: 'plan', digest: basis, revision: 1 },
      source: grant.source,
      policy: {
        digest: contractDigest(grant.policy),
        endpoint: 'local-handoff',
        intervention: 'supervised',
      },
      units: [{ id: 'work', role: 'implementation', repository: 'app' }],
    })
    emit({
      schema: 'wholeloop/delivery-grant-event@1',
      id: grant.id,
      digest: receipt.digest,
      basis,
      status: 'active',
    })
    transition('queued')
    emit({ schema: 'wholeloop/delivery-runner-event@1', basis, request, action: 'prepared' })
    if (name === 'unknown-worker' || name === 'human-decision') {
      emit({
        schema: 'wholeloop/delivery-runner-event@1',
        basis,
        request,
        action: 'claimed',
        controller,
        generation: 1,
      })
      if (name === 'unknown-worker')
        emit({
          schema: 'wholeloop/delivery-runner-event@1',
          basis,
          request,
          action: 'recovered',
          controller,
          generation: 1,
          status: 'unknown',
          evidence: '1'.repeat(64),
          provenance: 'fixture',
          reason: 'Synthetic unknown ownership.',
        })
      else
        emit({
          schema: 'wholeloop/delivery-runner-event@1',
          basis,
          request,
          action: 'dispatched',
          controller,
          generation: 1,
          stage: 'plan',
          invocation,
        })
    }
    if (name === 'ambiguous-effect') {
      const intent = {
          schema: 'wholeloop/delivery-effect-intent@1' as const,
          id: `effect-${contractDigest({ run, basis, key: 'fixture' }).slice(0, 32)}`,
          key: 'fixture',
          run,
          basis,
          grant: grant.id,
          grantDigest: receipt.digest,
          operation: 'report.write' as const,
          ref: 'fixture:report',
          inputDigest: '2'.repeat(64),
        },
        digest = contractDigest(intent)
      emit({
        schema: 'wholeloop/delivery-effect-event@1',
        basis,
        id: intent.id,
        digest,
        action: 'prepared',
        intent,
      })
      emit({
        schema: 'wholeloop/delivery-effect-event@1',
        basis,
        id: intent.id,
        digest,
        action: 'issued',
        invocation: 'invocation-0123456789abcdef',
        admission: { evidence: '3'.repeat(64), provenance: 'fixture' },
        deadline: '2026-11-04T21:00:00.000Z',
      })
      emit({
        schema: 'wholeloop/delivery-effect-event@1',
        basis,
        id: intent.id,
        digest,
        action: 'observed',
        invocation: 'invocation-0123456789abcdef',
        observation: {
          binding: digest,
          status: 'unknown',
          evidence: '4'.repeat(64),
          provenance: 'fixture',
          invocationState: 'unknown',
          reason: 'lost-response',
        },
      })
    }
    const targets: Partial<Record<OverviewCase, DeliveryState>> = {
      running: 'running',
      waiting: 'waiting-external',
      'human-decision': 'waiting-input',
      'failed-run': 'failed',
      'exhausted-run': 'exhausted',
      'blocked-run': 'blocked',
      'paused-run': 'paused',
    }
    if (name === 'running' || observedWorker)
      emit({
        schema: 'wholeloop/delivery-attempt-event@1',
        basis,
        id: 'attempt-0123456789abcdef',
        role: 'builder',
        unit: 'work',
        generation: 1,
        action: 'claimed',
      })
    if (observedWorker) {
      const runtime = {
        backend: 'fixture-runtime',
        instance: 'PRIVATE_FIXTURE_INSTANCE',
        worker: 'PRIVATE_FIXTURE_WORKER',
      }
      emit({
        schema: 'wholeloop/delivery-attempt-event@1',
        basis,
        id: 'attempt-0123456789abcdef',
        role: 'builder',
        unit: 'work',
        generation: 1,
        action: 'started',
        runtime,
      })
      emit({
        schema: 'wholeloop/delivery-runner-event@1',
        basis,
        request,
        action: 'claimed',
        controller,
        generation: 1,
      })
      emit({
        schema: 'wholeloop/delivery-runner-event@1',
        basis,
        request,
        action: 'dispatched',
        controller,
        generation: 1,
        stage: 'implementation:work',
        invocation,
      })
      emit({
        schema: 'wholeloop/delivery-runner-event@1',
        basis,
        request,
        action: 'started',
        controller,
        generation: 1,
        stage: 'implementation:work',
        invocation,
        runtime,
      })
      emit({
        schema: 'wholeloop/delivery-runner-event@1',
        basis,
        request,
        action: 'observed',
        controller,
        generation: 1,
        stage: 'implementation:work',
        invocation,
        status: 'pending',
        evidence: '8'.repeat(64),
        provenance: name === 'fixture-worker' ? 'fixture' : 'host-observed',
        reason: 'Synthetic provenance distinction, not native acceptance.',
      })
    }
    const target = observedWorker ? 'running' : targets[name]
    if (target) transition(target)
  } else if (!['empty', 'store-problem'].includes(name)) {
    item()
    if (name === 'complete') append('init-00000001', { type: 'item.closed', data: {} })
    if (name === 'item-decision')
      append('init-00000001', {
        type: 'step.skipped',
        data: { step: 'write-spec', run: 'run-0123456789abcdef', reason: 'PRIVATE_FIXTURE_REASON' },
      })
    if (name === 'idle') {
      const skipped = STEP_NAMES.map((step) =>
        append('init-00000001', {
          type: 'step.skipped',
          data: { step, run: 'run-0123456789abcdef', reason: 'Synthetic completed flow.' },
        }),
      )
      for (const [id, step] of [
        ['approve-spec', 'write-spec'],
        ['approve-scopes', 'cut-scopes'],
      ]) {
        const producer = skipped.find((e) => e.type === 'step.skipped' && e.data.step === step)
        if (!producer) throw new Error('Fixture decision basis unavailable')
        append('init-00000001', {
          type: 'decision.recorded',
          data: {
            decision: id ?? '',
            outcome: 'approved',
            by: 'Fixture Owner',
            basis: producer.id,
          },
        })
      }
    }
    if (name === 'unread-mail')
      append('init-00000001', {
        type: 'msg.sent',
        data: {
          to: 'conductor',
          from: 'fixture',
          kind: 'question',
          body: 'PRIVATE_FIXTURE_MESSAGE',
        },
      })
    if (name === 'blocked-dependency') {
      item('scope-00000001', 'scope', 'init-00000001')
      item('slice-00000001', 'slice', 'scope-00000001')
      item('slice-00000002', 'slice', 'scope-00000001')
      const definition = parseSlicePlan(readFileSync('test/fixtures/slicing/plan.md', 'utf8'))
        .slices[0]
      if (!definition) throw new Error('Fixture requires a slice definition')
      append('slice-00000002', {
        type: 'slice.defined',
        data: {
          scope: 'scope-00000001',
          run: 'run-0123456789abcdef',
          definition,
          repositories: [
            { key: 'api', path: '/fixture/api' },
            { key: 'web', path: '/fixture/web' },
          ],
          blockedBy: ['slice-00000001'],
          parts: [],
          tracker: {
            provider: 'fixture',
            operation: 'tracker.create-item',
            status: 'stored',
            ref: 'fixture:consumer',
          },
        },
      })
    }
    if (name === 'due-checkpoint') {
      item('scope-00000001', 'scope', 'init-00000001')
      const spec = parseSpec(readFileSync('test/fixtures/spec/spec.md', 'utf8')),
        plan = {
          schema: 'wholeloop/measurement-plan@1' as const,
          impact: spec.impact,
          metrics: spec.metrics,
          rollout: spec.rollout,
        },
        revision = 'fixture-v1'
      append('scope-00000001', {
        type: 'step.started',
        data: {
          step: 'measure-impact',
          run: 'run-0123456789abcdef',
          mode: 'standalone',
          input: 'fixture',
        },
      })
      append('scope-00000001', {
        type: 'impact.planned',
        data: {
          run: 'run-0123456789abcdef',
          source: {
            ref: 'fixture:measurement',
            revision,
            digest: measurementDigest({ revision, plan }),
            plan,
          },
          checkpoint: 'launch',
          launchedAt: '2026-09-01T00:00:00.000Z',
          afterDays: 0,
          at: '2026-09-01T00:00:00.000Z',
          qualitative: [],
          guidance: { ref: 'fixture:guidance', origin: 'fixture', digest: '5'.repeat(64) },
        },
      })
    }
  }
  const observations = {
    grants: isDelivery ? [[run, receipt] as const] : [],
    runners: isDelivery
      ? [
          [
            request,
            {
              request: {
                schema: 'wholeloop/delivery-runner-request@1' as const,
                key: 'fixture',
                run,
                revision: 1,
                plan: basis,
                grant: grant.id,
                host: { id: 'fixture', version: '1', configuration: '6'.repeat(64) },
                pollMs: 50,
              },
              route: [{ id: 'plan', kind: 'plan' as const, after: [], criteria: [] }],
              problems: name === 'unavailable-basis' ? ['unavailable-or-changed-basis'] : [],
            },
          ] as const,
        ]
      : [],
    humans:
      name === 'human-decision'
        ? [
            [
              `${request}:plan`,
              {
                version: 1 as const,
                request,
                plan: basis,
                stage: 'plan',
                invocation,
                decision: 'delivery-plan' as const,
                subject: '7'.repeat(64),
                at: FIXTURE_AT,
              },
            ] as const,
          ]
        : [],
    budgetReports: isDelivery
      ? [
          [
            run,
            {
              problem: name === 'budget-boundary' ? 'deadline-exhausted' : null,
              limits: { ...DEFAULT_DELIVERY_BUDGETS },
              deadline: null,
            },
          ] as const,
        ]
      : [],
  }
  return {
    schema: 'wholeloop/overview-fixture@1' as const,
    name,
    provenance: 'fixture' as const,
    at: FIXTURE_AT,
    journals: { state, delivery },
    observations,
    problem: name === 'store-problem' ? ('store-busy' as const) : null,
  }
}
export function replayOverviewFixture(fixture: ReturnType<typeof overviewFixture>) {
  if (fixture.problem) return overviewProblem(fixture.problem, fixture.at)
  const states = replayDelivery(fixture.journals.delivery),
    budgetReports = new Map(fixture.observations.budgetReports),
    grants = new Map(fixture.observations.grants)
  const input: OverviewInput = {
    at: fixture.at,
    store: '/fixture/store',
    cursor: encodeCursor(journalPosition(fixture.journals.state, fixture.journals.delivery)),
    stateEvents: fixture.journals.state,
    deliveryEvents: fixture.journals.delivery,
    items: replay(fixture.journals.state),
    states,
    configuration,
    configurationDigest: contractDigest(configuration),
    runners: new Map(fixture.observations.runners),
    humans: new Map(fixture.observations.humans),
    decidedHumans: new Map(),
    budgetReports,
    reports: new Map(
      [...states].map(([id, state]) => [
        id,
        projectDeliveryReport(
          state,
          fixture.journals.delivery,
          grants.get(id),
          budgetReports.get(id)?.problem ?? null,
        ),
      ]),
    ),
  }
  return projectOverview(input)
}
