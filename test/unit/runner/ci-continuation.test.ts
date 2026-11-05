import { existsSync, renameSync } from 'node:fs'
import { expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { findBudget } from '../../../src/delivery/budget-events.js'
import { DeliveryEffects } from '../../../src/delivery/effects.js'
import { continueCiDelivery } from '../../../src/runner/ci-continuation.js'
import { originalCiFailure } from '../../../src/runner/ci-failure.js'
import { continueDelivery } from '../../../src/runner/continuation.js'
import { deliveryReport } from '../../../src/runner/operator-report.js'
import { runnerRoute } from '../../../src/runner/route.js'
import type { RunnerRequest, RunnerStore } from '../../../src/runner/store.js'
import { authorization } from '../../support/delivery.js'
import { runnerCiFailureFixture } from '../../support/runner-ci.js'

function failed(store: RunnerStore, request: Readonly<RunnerRequest>, release = true) {
  const owner = store.record(contractDigest(request))
  if (release) {
    if (!owner.controller) throw new Error('Original fixture controller required')
    store.release(
      { request: owner.request, controller: owner.controller, generation: owner.generation },
      'Release original CI fixture before recording a correction proposal.',
    )
  }
  store.lifecycle.transition(request.run, {
    to: 'failed',
    outcome: 'failed',
    reason: 'Retain the fixed CI fixture failure without native or hosted acceptance.',
  })
}
const accept = {
  operator: 'Fixture Operator',
  reason: 'Record only a bounded CI correction proposal.',
}

it('previews and records one exact version-two CI correction without authority or execution', async () => {
  await runnerCiFailureFixture(({ store, request, input }) => {
    failed(store, request)
    const before = contractDigest(store.lifecycle.journal.events()),
      original = store.stage(input.request, 'ci'),
      selected = { request: input.request, unit: 'search' },
      preview = continueCiDelivery(store.lifecycle, request.run, selected)
    expect(preview).toMatchObject({
      accepted: false,
      admission: {
        status: 'admissible',
        reasons: [],
        authority: 'new-exact-plan-grant-required',
        execution: 'fresh-feedback-and-remote-head-preflight-required',
        pushes: { pushes: 1, limit: 2, allowed: true },
      },
    })
    expect(existsSync(store.files.path(`delivery/plans/${request.run}/2.json`))).toBe(false)
    expect(deliveryReport(store.files.root, request.run).next).toContain(
      `wl delivery continue-ci --run ${request.run} --request ${input.request} --unit <work-id>`,
    )
    expect(JSON.stringify(preview)).not.toContain('https://github.com')
    expect(
      continueDelivery(store.lifecycle, request.run, { ...selected, stage: 'ci' }).admission
        .reasons,
    ).toContain('unsupported-failure-origin')
    const result = continueCiDelivery(store.lifecycle, request.run, selected, accept)
    if (!result.accepted) throw new Error('Accepted fixture proposal required')
    const next = store.planning.getPlan(request.run, 2)
    expect(next.plan).toMatchObject({
      schema: 'wholeloop/delivery-plan@2',
      previous: request.plan,
      corrections: [
        {
          unit: 'search',
          origin: 'ci',
          revision: 2,
          request: input.request,
          stage: 'ci',
          failure: input.failure,
        },
      ],
    })
    expect(result.record).toMatchObject({
      schema: 'wholeloop/delivery-ci-continuation@1',
      digest: next.digest,
    })
    expect(store.lifecycle.journal.get(request.run)).toMatchObject({
      state: 'failed',
      basis: { digest: request.plan },
    })
    expect(store.stage(input.request, 'ci')).toEqual(original)
    expect(contractDigest(store.lifecycle.journal.events())).toBe(before)
    const ids = runnerRoute(next.plan).map((stage) => stage.id)
    expect(ids.indexOf('correction-1:search')).toBeLessThan(ids.indexOf('verification:search'))
    expect(() => continueCiDelivery(store.lifecycle, request.run, selected, accept)).toThrow(
      'continuation-already-recorded',
    )
    expect(contractDigest(store.lifecycle.journal.events())).toBe(before)
  })
})
it('refuses an active predecessor without recording the correction', async () => {
  await runnerCiFailureFixture(({ store, request, input }) => {
    failed(store, request, false)
    const selected = { request: input.request, unit: 'search' },
      before = contractDigest(store.lifecycle.journal.events())
    expect(continueCiDelivery(store.lifecycle, request.run, selected).admission.reasons).toContain(
      'predecessor-controller-not-released',
    )
    expect(() => continueCiDelivery(store.lifecycle, request.run, selected, accept)).toThrow(
      'continuation-not-admissible',
    )
    expect(contractDigest(store.lifecycle.journal.events())).toBe(before)
  })
})
it('requires the exact original typed repair request and selected repository unit', async () => {
  await runnerCiFailureFixture(({ store, request, input, paths }) => {
    failed(store, request)
    const path = store.files.path(paths.at(-1) ?? ''),
      backup = `${path}.fixture-backup`,
      selected = { request: input.request, unit: 'search' }
    renameSync(path, backup)
    try {
      expect(
        continueCiDelivery(store.lifecycle, request.run, selected).admission.reasons,
      ).toContain('original-ci-failure-unavailable')
      expect(() => continueCiDelivery(store.lifecycle, request.run, selected, accept)).toThrow(
        'continuation-not-admissible',
      )
    } finally {
      renameSync(backup, path)
    }
    expect(
      continueCiDelivery(store.lifecycle, request.run, { ...selected, unit: 'foreign' }).admission
        .status,
    ).toBe('refused')
    expect(existsSync(store.files.path(`delivery/plans/${request.run}/2.json`))).toBe(false)
  })
})
it('counts a later issued push instead of trusting the original request allowance', async () => {
  await runnerCiFailureFixture(async ({ store, request, input }) => {
    const proof = originalCiFailure(store, input),
      effects = new DeliveryEffects(store.files.root),
      effect = effects.prepare(request.run, {
        key: 'fixture-extra-push',
        operation: 'git.push',
        repository: 'app',
        ref: proof.target.branch,
        expectedHead: proof.target.head,
        inputDigest: 'e'.repeat(64),
      })
    await effects.execute(request.run, effect.intent.id, {
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
          resource: { ref: intent.ref, revision: proof.target.head },
        },
      }),
    })
    failed(store, request)
    expect(
      continueCiDelivery(store.lifecycle, request.run, { request: input.request, unit: 'search' })
        .admission,
    ).toMatchObject({
      status: 'refused',
      reasons: ['ci-push-budget-exhausted'],
      pushes: { pushes: 2, limit: 2, allowed: false },
    })
  })
})

it('reopens only with a fresh exact-plan grant without resetting the original ledger', async () => {
  await runnerCiFailureFixture(({ store, request, input }) => {
    failed(store, request)
    continueCiDelivery(
      store.lifecycle,
      request.run,
      { request: input.request, unit: 'search' },
      accept,
    )
    const next = store.planning.getPlan(request.run, 2),
      originalBudget = findBudget(store.lifecycle.journal.get(request.run)),
      before = contractDigest(store.lifecycle.journal.events())
    expect(() =>
      store.lifecycle.track({ run: request.run, revision: 2, grant: request.grant }),
    ).toThrow()
    expect(contractDigest(store.lifecycle.journal.events())).toBe(before)
    const grant = store.lifecycle.authority.authorize({
      ...authorization(next.plan, next.digest),
      id: 'authorization-fedcba9876543210',
      effects: store.lifecycle.authority.inspect(request.grant).grant.effects,
    })
    const tracked = store.lifecycle.track({ run: request.run, revision: 2, grant: grant.grant.id })
    expect(tracked).toMatchObject({
      state: 'planned',
      basis: { digest: next.digest },
      grant: { id: grant.grant.id },
    })
    expect(findBudget(tracked)).toEqual(originalBudget)
    expect(store.stage(input.request, 'ci')?.evidence).toBe(input.failure)
  })
})

it('refuses requirement or budget drift even under a new exact-plan grant', async () => {
  await runnerCiFailureFixture(({ store, request, input }) => {
    failed(store, request)
    const prior = store.planning.getPlan(request.run, 1).plan,
      next = store.planning.preparePlan({
        ...prior,
        schema: 'wholeloop/delivery-plan@2',
        revision: 2,
        previous: request.plan,
        budgets: { ...prior.budgets, ciPushes: 9 },
        corrections: [
          {
            unit: 'search',
            origin: 'ci',
            revision: 2,
            request: input.request,
            stage: 'ci',
            failure: input.failure,
          },
        ],
      }),
      grant = store.lifecycle.authority.authorize({
        ...authorization(next.plan, next.digest),
        id: 'authorization-fedcba9876543210',
        effects: store.lifecycle.authority.inspect(request.grant).grant.effects,
      }),
      before = contractDigest(store.lifecycle.journal.events())
    expect(() =>
      store.lifecycle.track({ run: request.run, revision: 2, grant: grant.grant.id }),
    ).toThrow('ci-correction-exact-predecessor')
    expect(contractDigest(store.lifecycle.journal.events())).toBe(before)
  })
})
