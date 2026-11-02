import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ImpactObservation } from '../../../src/impact/contracts.js'
import {
  dueObservations,
  learningRecommendation,
  ObservationSchedule,
  observationOutcome,
} from '../../../src/learning/scheduler.js'
import type { StateEvent } from '../../../src/state/events.js'
import { StoreFiles } from '../../../src/state/files.js'

const launch = '2026-10-01T00:00:00.000Z'
function events(launchedAt = launch, source = 'measurement-1'): StateEvent[] {
  return [
    {
      type: 'step.started',
      subject: 'search',
      ts: launchedAt,
      data: { step: 'measure-impact', run: 'run-1', input: '' },
    },
    {
      type: 'impact.planned',
      subject: 'search',
      ts: launchedAt,
      data: {
        run: 'run-1',
        source: { revision: 1, digest: source, plan: { metrics: [] } },
        checkpoint: 'launch',
        launchedAt,
        afterDays: 0,
        at: launchedAt,
        qualitative: [],
        guidance: { ref: 'harness', origin: 'harness', digest: 'a'.repeat(64) },
      },
    },
  ] as unknown as StateEvent[]
}
const metric = (id: string, status: 'observed' | 'unknown'): ImpactObservation => ({
  id,
  status,
  window: { start: launch, end: launch, timezone: 'UTC' },
  ...(status === 'observed' ? { value: 0 } : { missing: 'No provider access.' }),
})
const created: string[] = []
const files = () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-learning-')))
  created.push(dir)
  return new StoreFiles(dir)
}
afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('scheduled impact observations (LEARN-01)', () => {
  it('schedules one observation for two due ticks and a new one for a changed launch', () => {
    const schedule = new ObservationSchedule(files()),
      at = '2026-10-09T00:00:00.000Z',
      due = dueObservations(events(), ['search'], ['launch', 'd7', 'd30'], at, { metrics: 'v1' })
    expect(due.map((entry) => entry.checkpoint)).toEqual(['launch', 'd7'])
    expect(schedule.tick(due).scheduled).toHaveLength(2)
    expect(
      schedule.tick(
        dueObservations(events(), ['search'], ['launch', 'd7', 'd30'], at, { metrics: 'v1' }),
      ),
    ).toEqual({
      scheduled: [],
      deduped: due.map((entry) => entry.key),
    })
    const relaunched = dueObservations(events('2026-10-02T00:00:00.000Z'), ['search'], ['d7'], at, {
        metrics: 'v1',
      }),
      changedSource = dueObservations(events(launch, 'measurement-2'), ['search'], ['d7'], at, {
        metrics: 'v1',
      }),
      changedPolicy = dueObservations(events(), ['search'], ['d7'], at, { metrics: 'v2' })
    for (const changed of [relaunched, changedSource, changedPolicy])
      expect(schedule.tick(changed).scheduled).toHaveLength(1)
  })
  it('schedules nothing before a checkpoint is due', () => {
    expect(dueObservations(events(), ['search'], ['d30'], '2026-10-09T00:00:00.000Z', {})).toEqual(
      [],
    )
  })
})

describe('observation outcomes (LEARN-02, LEARN-03)', () => {
  it.each([
    [[metric('m', 'observed')], 'none', 'blocked', 'observed'],
    [
      [metric('m', 'observed'), metric('n', 'unknown')],
      'none',
      'complete-with-unknowns',
      'completed-with-unknowns',
    ],
    [[metric('m', 'observed'), metric('n', 'unknown')], 'none', 'blocked', 'blocked'],
    [[metric('m', 'unknown')], 'none', 'complete-with-unknowns', 'blocked'],
    [[metric('m', 'unknown')], 'supervised', 'blocked', 'needs-access'],
    [[], 'none', 'complete-with-unknowns', 'blocked'],
  ] as const)('settles %j under %s/%s as %s', (metrics, intervention, contract, outcome) => {
    expect(observationOutcome(metrics, intervention, contract)).toBe(outcome)
  })
  it('settles once, keeps unknowns and performs no effect', () => {
    const schedule = new ObservationSchedule(files()),
      [due] = dueObservations(events(), ['search'], ['launch'], launch, {})
    if (!due) throw new Error('Due observation required')
    expect(() => schedule.settle(due.key, [], 'none', 'blocked')).toThrow('not scheduled')
    schedule.tick([due])
    expect(
      schedule.settle(
        due.key,
        [metric('m', 'observed'), metric('n', 'unknown')],
        'none',
        'complete-with-unknowns',
      ),
    ).toMatchObject({
      outcome: 'completed-with-unknowns',
      unknown: ['n'],
      effects: 'not-performed',
    })
    expect(() => schedule.settle(due.key, [metric('m', 'observed')], 'none', 'blocked')).toThrow(
      'already settled',
    )
  })
})

describe('delegated learning recommendations (LEARN-04)', () => {
  const base = {
    subject: 'search',
    policy: 'b'.repeat(64),
    metrics: [metric('adoption', 'observed'), metric('retention', 'unknown')],
    rationale: 'Adoption rose after launch.',
    counterarguments: ['A seasonal spike could explain the rise.'],
    uncertainties: ['retention is unknown without provider access'],
  }
  it.each(['keep', 'iterate', 'kill', 'unflag'] as const)(
    'records %s with no production effect',
    (outcome) => {
      const recommendation = learningRecommendation({ ...base, outcome })
      expect(recommendation).toMatchObject({
        actor: 'machine',
        measured: 'partial',
        effects: {
          flags: 'not-changed',
          deploy: 'not-performed',
          messages: 'not-sent',
          code: 'not-removed',
          work: 'not-closed',
        },
      })
      expect('proposal' in recommendation).toBe(outcome !== 'keep')
    },
  )
  it('refuses a recommendation that hides an unknown or omits counterarguments', () => {
    expect(() => learningRecommendation({ ...base, outcome: 'keep', uncertainties: [] })).toThrow(
      'unknown metric',
    )
    expect(() =>
      learningRecommendation({ ...base, outcome: 'keep', counterarguments: [] }),
    ).toThrow('counterarguments')
  })
})
