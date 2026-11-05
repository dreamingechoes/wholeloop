import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { findBudget } from '../../../src/delivery/budget-events.js'
import { DeliveryEffects } from '../../../src/delivery/effects.js'
import { continueCiDelivery } from '../../../src/runner/ci-continuation.js'
import {
  CI_CORRECTION_ADMISSION,
  ciCorrectionAdmitted,
  RunnerCiCorrectionAdmission,
} from '../../../src/runner/ci-correction-admission.js'
import { ciCorrectionOrigin } from '../../../src/runner/ci-correction-origin.js'
import { type CiFeedbackRead, ciFeedbackEvidence } from '../../../src/runner/ci-feedback.js'
import type { RunnerStageContext } from '../../../src/runner/engine.js'
import { publicationMarker } from '../../../src/runner/publication-stages.js'
import { runnerRoute } from '../../../src/runner/route.js'
import { authorization } from '../../support/delivery.js'
import { runnerCiFailureFixture } from '../../support/runner-ci.js'
import { StubCodeHost } from '../../support/runner-publication.js'

async function fixture(
  operation: (value: Awaited<ReturnType<typeof setup>>) => Promise<void>,
  options: { missingPush?: boolean; topicPrefix?: string } = {},
) {
  await runnerCiFailureFixture(async ({ store, request, input }) => {
    const old = store.record(input.request)
    if (!old.controller) throw new Error('Original controller required')
    store.release(
      { request: old.request, controller: old.controller, generation: old.generation },
      'Close the original fixture controller.',
    )
    store.lifecycle.transition(request.run, {
      to: 'failed',
      outcome: 'failed',
      reason: 'Retain the original synthetic CI failure.',
    })
    continueCiDelivery(
      store.lifecycle,
      request.run,
      { request: input.request, unit: 'search' },
      { operator: 'Fixture Operator', reason: 'Record a bounded CI correction proposal.' },
    )
    const next = store.planning.getPlan(request.run, 2),
      grant = store.lifecycle.authority.authorize({
        ...authorization(next.plan, next.digest),
        id: 'authorization-fedcba9876543210',
        effects: store.lifecycle.authority
          .inspect(request.grant)
          .grant.effects.filter((effect) => !options.missingPush || effect !== 'git.push'),
        repositories: authorization(next.plan, next.digest).repositories.map((repository) => ({
          ...repository,
          topicPrefix: options.topicPrefix ?? repository.topicPrefix,
        })),
      })
    store.lifecycle.track({ run: request.run, revision: 2, grant: grant.grant.id })
    await operation(
      await setup(store, {
        ...request,
        key: 'ci-admission',
        revision: 2,
        plan: next.digest,
        grant: grant.grant.id,
      }),
    )
  })
}
async function setup(
  store: Parameters<typeof ciCorrectionOrigin>[0],
  request: Parameters<typeof ciCorrectionAdmitted>[1],
) {
  const plan = store.basis(request).plan,
    digest = store.prepare(request).digest,
    lease = store.claim(digest, `controller-${'b'.repeat(32)}`),
    stage = runnerRoute(plan).find((value) => value.id === CI_CORRECTION_ADMISSION),
    origin = ciCorrectionOrigin(store, plan)
  if (!stage || !origin) throw new Error('Fixed CI origin and route required')
  const invocation = contractDigest({ request: digest, plan: request.plan, id: stage.id }),
    abort = new AbortController()
  store.append(lease, { action: 'dispatched', stage: stage.id, invocation })
  const context: RunnerStageContext = {
    request,
    plan,
    stage,
    invocation,
    deadline: new Date(Date.now() + Math.min(15000, plan.budgets.attemptMs)).toISOString(),
    signal: abort.signal,
    current: () => store.live(lease, false),
    started: (runtime) =>
      store.append(lease, { action: 'started', stage: stage.id, invocation, runtime }),
  }
  let reads = 0,
    mode = 'pass'
  class Host extends StubCodeHost {
    override async remoteHead(target: Parameters<StubCodeHost['remoteHead']>[0]) {
      reads++
      return mode === 'head' ? 'e'.repeat(40) : target.head
    }
    override async pullRequests(target: Parameters<StubCodeHost['pullRequests']>[0]) {
      reads++
      return [
        {
          url:
            origin?.proof.targets.find((value) => value.repository === target.repository)?.pr ?? '',
          branch: target.branch,
          base: mode === 'base' ? 'foreign' : target.base,
          sha: target.head,
          draft: mode === 'draft',
          state: 'open' as const,
          body: mode === 'marker' ? 'foreign' : publicationMarker(request.run, target.repository),
        },
      ]
    }
    async readFeedback(
      target: Parameters<StubCodeHost['remoteHead']>[0],
      pr: string,
      signal: AbortSignal,
    ): Promise<CiFeedbackRead> {
      reads++
      if (mode === 'denied') throw new Error('Private host failure canary')
      if (mode === 'cancel')
        await new Promise<void>((resolve) =>
          signal.addEventListener('abort', () => resolve(), { once: true }),
        )
      const facts: Omit<CiFeedbackRead, 'evidence'> = {
        schema: 'wholeloop/delivery-ci-feedback@1',
        repository: 'https://github.com/fixture/app',
        pr,
        head: target.head,
        base: target.base,
        observedAt: new Date().toISOString(),
        complete: true,
        items:
          mode === 'feedback' || mode === 'unstable'
            ? [
                {
                  identity: mode === 'unstable' ? String(reads).padStart(64, '0') : 'c'.repeat(64),
                  origin: 'pr-comment',
                  revision: mode === 'unstable' ? 'b'.repeat(40) : target.head,
                  current: mode !== 'unstable',
                  adopted: false,
                  source: 'issue-comment',
                  revisionSource: 'current-head-snapshot',
                },
              ]
            : [],
        provenance: 'host-observed',
      }
      return { ...facts, evidence: ciFeedbackEvidence(facts) }
    }
  }
  const host = new Host(),
    adapter = new RunnerCiCorrectionAdmission(store, { identity: request.host, host }),
    record = () => {
      const value = store.stage(digest, stage.id)
      if (!value) throw new Error('Actual stage required')
      return value
    }
  return {
    store,
    request,
    context,
    host,
    adapter,
    record,
    abort,
    lease,
    digest,
    setMode: (value: string) => {
      mode = value
    },
    reads: () => reads,
  }
}

it('requires two complete stable original-head observations before builders without budget progress or replay', async () => {
  await fixture(async ({ store, request, context, host, adapter, record, lease, reads }) => {
    const before = findBudget(store.lifecycle.journal.get(request.run))
    expect(() => ciCorrectionAdmitted(store, request)).toThrow('ci-correction-admission-required')
    expect(adapter.configured(request, context.plan)).toBe(true)
    const observation = await adapter.execute(context)
    expect(observation).toMatchObject({
      status: 'passed',
      provenance: 'host-observed',
      invocationState: 'stopped',
    })
    expect(reads()).toBe(6)
    expect(host.writes).toEqual({ push: 0, create: 0, ready: 0 })
    store.append(lease, {
      action: 'observed',
      stage: observation.stage,
      invocation: observation.invocation,
      status: observation.status,
      evidence: observation.evidence,
      provenance: observation.provenance,
      reason: observation.reason,
    })
    expect(() => ciCorrectionAdmitted(store, request)).not.toThrow()
    const events = contractDigest(store.lifecycle.journal.events())
    expect(adapter.inspect(request, record())).toEqual(observation)
    expect(await adapter.execute(context)).toEqual(observation)
    expect(reads()).toBe(6)
    expect(contractDigest(store.lifecycle.journal.events())).toBe(events)
    expect(findBudget(store.lifecycle.journal.get(request.run))).toEqual(before)
    const path = store.files.path(
      `delivery/runner-ci-correction-admissions/${context.invocation}/result.json`,
    )
    expect(readFileSync(path, 'utf8')).not.toContain('Private host failure canary')
    const retained = readFileSync(path, 'utf8'),
      damaged = JSON.parse(retained)
    damaged.snapshots[0][0].feedback.base = 'foreign'
    damaged.snapshots[0][0].feedback.evidence = ciFeedbackEvidence(damaged.snapshots[0][0].feedback)
    writeFileSync(path, JSON.stringify(damaged))
    try {
      expect(adapter.inspect(request, record()).status).toBe('unknown')
      expect(() => ciCorrectionAdmitted(store, request)).toThrow()
    } finally {
      writeFileSync(path, retained)
    }
    renameSync(path, `${path}.fixture-backup`)
    try {
      expect(adapter.inspect(request, record()).status).toBe('unknown')
      expect(() => ciCorrectionAdmitted(store, request)).toThrow()
    } finally {
      renameSync(`${path}.fixture-backup`, path)
    }
  })
})
it.each(['head', 'base', 'draft', 'marker', 'feedback', 'denied', 'unstable'])(
  'refuses %s without writes or builder admission',
  async (mode) => {
    await fixture(async ({ store, request, context, host, adapter, record, setMode, reads }) => {
      setMode(mode)
      const observation = await adapter.execute(context)
      expect(observation.status).toBe('blocked')
      if (mode === 'unstable') {
        expect(reads()).toBe(9)
        const result = JSON.parse(
          readFileSync(
            store.files.path(
              `delivery/runner-ci-correction-admissions/${context.invocation}/result.json`,
            ),
            'utf8',
          ),
        )
        expect(result.reason).toBe('ci-admission-observation-changed')
        expect(result.snapshots).toHaveLength(3)
      }
      expect(adapter.inspect(request, record())).toEqual(observation)
      expect(() => ciCorrectionAdmitted(store, request)).toThrow()
      expect(host.writes).toEqual({ push: 0, create: 0, ready: 0 })
      expect(
        readFileSync(
          store.files.path(
            `delivery/runner-ci-correction-admissions/${context.invocation}/result.json`,
          ),
          'utf8',
        ),
      ).not.toContain('Private host failure canary')
    })
  },
)
it('cancels only its original live reader after revocation and rejects a borrowed tuple', async () => {
  await fixture(async ({ store, request, context, adapter, record, setMode, reads }) => {
    setMode('cancel')
    const running = adapter.execute(context),
      until = Date.now() + 3000
    while (reads() < 3 && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 5))
    expect(reads()).toBe(3)
    expect(() =>
      adapter.stop(
        request,
        { ...record(), invocation: 'f'.repeat(64) },
        new AbortController().signal,
      ),
    ).toThrow('ci-admission-original-cancellation-owner')
    store.lifecycle.authority.revoke({
      schema: 'wholeloop/delivery-revocation-request@1',
      grant: request.grant,
      operator: 'Fixture Operator',
      reason: 'Revoke execution without erasing original cancellation ownership.',
    })
    adapter.stop(request, record(), new AbortController().signal)
    expect((await running).status).toBe('unknown')
    expect(reads()).toBe(3)
  })
})

it.each([{ missingPush: true }, { topicPrefix: 'wl/new-only/' }])(
  'requires current original-topic publication scope before host reads: %j',
  async (options) => {
    await fixture(async ({ request, context, adapter, reads }) => {
      expect(adapter.configured(request, context.plan)).toBe(false)
      await expect(adapter.execute(context)).rejects.toThrow('ci-admission-stage-binding')
      expect(reads()).toBe(0)
    }, options)
  },
)
async function spendPush({
  store,
  request,
  context,
}: Pick<Awaited<ReturnType<typeof setup>>, 'store' | 'request' | 'context'>) {
  const original = ciCorrectionOrigin(store, context.plan)?.proof.target
  if (!original) throw new Error('Fixed original target required')
  const effects = new DeliveryEffects(store.files.root),
    prepared = effects.prepare(request.run, {
      key: 'fixture-later-allowance',
      operation: 'git.push',
      repository: original.repository,
      ref: original.branch,
      expectedHead: original.head,
      inputDigest: 'e'.repeat(64),
    })
  await effects.execute(request.run, prepared.intent.id, {
    eligible: () => ({ allowed: true, provenance: 'host-observed', evidence: 'f'.repeat(64) }),
    invoke: async () => undefined,
    observe: async (intent) => ({
      available: true,
      value: {
        binding: contractDigest(intent),
        status: 'applied',
        reason: 'observed',
        provenance: 'host-observed',
        invocationState: 'stopped',
        evidence: 'c'.repeat(64),
        resource: { ref: intent.ref, revision: original.head },
      },
    }),
  })
}
it('rechecks a later consumed push allowance before any live admission read', async () => {
  await fixture(async ({ store, request, context, adapter, reads }) => {
    await spendPush({ store, request, context })
    await expect(adapter.execute(context)).rejects.toThrow('ci-admission-push-budget')
    expect(reads()).toBe(0)
  })
})

it('keeps the exact closed admission inspectable after the eventual owned push consumes the final slot', async () => {
  await fixture(async ({ store, request, context, adapter, record, lease, reads }) => {
    const observation = await adapter.execute(context)
    expect(observation.status).toBe('passed')
    store.append(lease, {
      action: 'observed',
      stage: observation.stage,
      invocation: observation.invocation,
      status: observation.status,
      evidence: observation.evidence,
      provenance: observation.provenance,
      reason: observation.reason,
    })
    await spendPush({ store, request, context })
    const events = contractDigest(store.lifecycle.journal.events())
    expect(adapter.inspect(request, record())).toEqual(observation)
    expect(await adapter.execute(context)).toEqual(observation)
    expect(reads()).toBe(6)
    expect(contractDigest(store.lifecycle.journal.events())).toBe(events)
  })
})
