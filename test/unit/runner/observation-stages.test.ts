import { describe, expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { readSourceFile } from '../../../src/delivery/input.js'
import { DeliveryPlanning } from '../../../src/delivery/planning-store.js'
import { ObservationSchedule } from '../../../src/learning/scheduler.js'
import { DeliveryRunner } from '../../../src/runner/engine.js'
import { RunnerNativeScope } from '../../../src/runner/native-scope.js'
import { runnerRoute } from '../../../src/runner/route.js'
import type { RunnerStore } from '../../../src/runner/store.js'
import { runnerObservationFixture as setup, TICK } from '../../support/runner-observation.js'

const json = (store: RunnerStore, path: string) =>
  JSON.parse(readSourceFile(store.files.root, path, 8 * 1024 * 1024))
function stored(store: RunnerStore, digest: string) {
  const observation = store.stage(digest, 'observation'),
    handoff = store.stage(digest, 'handoff')
  if (!observation) throw new Error('Observation stage required')
  const base = `delivery/runner-observations/${observation.invocation}`
  return {
    reads: json(store, `${base}/reads.json`),
    synthesis: json(store, `${base}/synthesis.json`),
    recommendation: handoff
      ? json(
          store,
          json(store, `delivery/runner-observation-handoffs/${handoff.invocation}/binding.json`)
            .recommendation.ref,
        )
      : undefined,
    calls: new RunnerNativeScope(store.files, observation.invocation).inspect(),
  }
}
const states = (store: RunnerStore, run: string) =>
  store.lifecycle.journal
    .events()
    .filter((event) => event.run === run)
    .flatMap((event) => ('to' in event ? [event.to] : []))

describe('learning observation host (P6-30, ADR-0201)', () => {
  it('reads through the client MCP connection, settles once and records an effect-free recommendation', async () => {
    await setup(async ({ store, digest, dispatcher, calls, key, request, plan, subject }) => {
      const receipt = await new DeliveryRunner(store).run(digest, dispatcher)
      expect(receipt).toMatchObject({ state: 'completed', outcome: 'learning-recorded' })
      expect(receipt.stages.map((stage) => [stage.id, stage.status])).toEqual([
        ['plan', 'passed'],
        ['observation', 'passed'],
        ['handoff', 'passed'],
      ])
      expect(states(store, request.run)).not.toContain('waiting-input')
      // One read per planned datapoint, each through the client's MCP tool; no write.
      expect(calls.map((call) => [call.operation, call.tool])).toEqual(
        expect.arrayContaining([
          ['source.product-analytics.query', 'aggregate'],
          ['source.feedback.query', 'feedback'],
        ]),
      )
      expect(calls).toHaveLength(2)
      const result = stored(store, digest)
      expect(result.reads.calls.map((call: { transport: string }) => call.transport)).toEqual([
        'mcp',
        'mcp',
      ])
      expect(result.synthesis.outcome).toBe('observed')
      // The judge and its challenger ran as owned native processes.
      expect(result.calls).toHaveLength(2)
      expect(new ObservationSchedule(store.files).settlement(key)).toMatchObject({
        outcome: 'observed',
        unknown: [],
        effects: 'not-performed',
        by: { run: request.run },
      })
      expect(result.recommendation).toMatchObject({
        schema: 'wholeloop/learning-recommendation@1',
        subject,
        actor: 'machine',
        outcome: 'keep',
        measured: 'complete',
        counterarguments: ['A single checkpoint cannot separate the change from seasonality.'],
        effects: {
          flags: 'not-changed',
          deploy: 'not-performed',
          messages: 'not-sent',
          code: 'not-removed',
          work: 'not-closed',
        },
      })
      expect(result.recommendation.proposal).toBeUndefined()
      expect(store.lifecycle.authority.inspect(request.grant).grant.effects).toEqual([
        'source.read',
        'report.write',
      ])
      // Inspection rebuilds the same evidence without reading any source again.
      const record = store.stage(digest, 'observation')
      if (!record) throw new Error('Observation stage required')
      expect(
        (await dispatcher.inspect(request, record, new AbortController().signal)).evidence,
      ).toBe(record.evidence)
      expect(calls).toHaveLength(2)
      // A settled observation can never become another run.
      const again = structuredClone(plan)
      again.run = 'delivery-fedcba9876543210'
      expect(() => new DeliveryPlanning(store.files.root).preparePlan(again)).toThrow(
        'unscheduled-observation',
      )
    })
  })
  it('keeps a reading the client cannot serve unknown and completes with unknowns only when allowed', async () => {
    await setup(
      async ({ store, digest, dispatcher, calls, key }) => {
        const receipt = await new DeliveryRunner(store).run(digest, dispatcher)
        expect(receipt).toMatchObject({ state: 'completed', outcome: 'completed-with-unknowns' })
        // No MCP tool for feedback: nothing is invoked and no HTTP path is tried.
        expect(calls.map((call) => call.operation)).toEqual(['source.product-analytics.query'])
        const result = stored(store, digest)
        expect(result.reads.qualitative).toEqual([
          expect.objectContaining({ id: 'feedback', status: 'unknown' }),
        ])
        expect(new ObservationSchedule(store.files).settlement(key)).toMatchObject({
          outcome: 'completed-with-unknowns',
          unknown: ['feedback'],
        })
        expect(result.recommendation.measured).toBe('partial')
        expect(
          result.recommendation.uncertainties.some((text: string) => text.startsWith('feedback:')),
        ).toBe(true)
      },
      { tools: ['aggregate'], uncertainty: 'complete-with-unknowns' },
    )
  })
  it.each([
    ['an unserved tool', { tools: ['aggregate'] }],
    ['a read outside the grant', { operations: ['source.product-analytics.query'] }],
  ])('ends blocked without a decision for %s under a blocking contract', async (_name, extra) => {
    await setup(
      async ({ store, digest, dispatcher, calls, key, request }) => {
        const receipt = await new DeliveryRunner(store).run(digest, dispatcher)
        expect(receipt).toMatchObject({ state: 'blocked' })
        expect(states(store, request.run)).not.toContain('waiting-input')
        expect(calls.map((call) => call.operation)).toEqual(['source.product-analytics.query'])
        const result = stored(store, digest)
        expect(result.synthesis).toMatchObject({ outcome: 'blocked', artifact: null })
        expect(result.calls).toEqual([])
        expect(new ObservationSchedule(store.files).settlement(key)?.outcome).toBe('blocked')
        expect(store.stage(digest, 'handoff')).toBeUndefined()
      },
      { ...extra, uncertainty: 'blocked' },
    )
  })
  it('turns a kill recommendation into a proposal that needs its own authorized run', async () => {
    await setup(
      async ({ store, digest, dispatcher, calls }) => {
        const receipt = await new DeliveryRunner(store).run(digest, dispatcher)
        expect(receipt).toMatchObject({ state: 'completed', outcome: 'learning-recorded' })
        expect(stored(store, digest).recommendation).toMatchObject({
          outcome: 'kill',
          proposal: { kind: 'implementation', authority: 'separate-run-required' },
          effects: { flags: 'not-changed', code: 'not-removed' },
        })
        expect(calls.every((call) => call.operation.startsWith('source.'))).toBe(true)
      },
      { outcome: 'kill' },
    )
  })
  it('stops an interrupted read without settling, so the observation stays open', async () => {
    await setup(
      async ({ store, digest, dispatcher, key }) => {
        const abort = new AbortController(),
          running = new DeliveryRunner(store).run(digest, dispatcher, { signal: abort.signal })
        for (let i = 0; i < 200 && !store.stage(digest, 'observation')?.runtime; i++)
          await new Promise((resolve) => setTimeout(resolve, 10))
        abort.abort()
        const receipt = await running
        expect(['blocked', 'stopped']).toContain(receipt.state)
        expect(new ObservationSchedule(store.files).settlement(key)).toBeUndefined()
        expect(store.stage(digest, 'handoff')).toBeUndefined()
      },
      {
        invoke: (_call, signal) =>
          new Promise((_, reject) =>
            signal.addEventListener('abort', () => reject(new Error('cancelled'))),
          ),
      },
    )
  })
  it('replays a local scheduler through the built CLI: two firings, one observation run (EVAL-12)', async () => {
    await setup(
      async ({ store, digest, dispatcher, key, ticks, calls }) => {
        // The first firing schedules d7; the second finds the same identity.
        expect(ticks.map((tick) => [tick.scheduled, tick.deduped, tick.reads])).toEqual([
          [[key], [], 'not-performed'],
          [[], [key], 'not-performed'],
        ])
        const receipt = await new DeliveryRunner(store).run(digest, dispatcher)
        expect(receipt).toMatchObject({ state: 'completed', outcome: 'learning-recorded' })
        expect(calls).toHaveLength(2)
        expect(stored(store, digest).recommendation.effects.flags).toBe('not-changed')
      },
      { ticks: [TICK, new Date(Date.parse(TICK) + 3600000).toISOString()] },
    )
  })
  it('refuses a supervised observation before dispatch', async () => {
    await setup(
      async ({ store, request, plan, dispatcher }) => {
        const preflight = await dispatcher.preflight(
          request,
          plan,
          runnerRoute(plan),
          new AbortController().signal,
        )
        expect(preflight).toMatchObject({
          available: false,
          reason: 'dispatcher-supervised-observation-unavailable',
        })
        expect(contractDigest(store.basis(request).plan)).toBe(contractDigest(plan))
      },
      { intervention: 'supervised' },
    )
  })
})
