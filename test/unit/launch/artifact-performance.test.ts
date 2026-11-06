import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { renderLaunchArtifacts } from '../../../src/launch/artifacts.js'
import {
  type LaunchDraft,
  type LaunchPlan,
  validateLaunchDraft,
  validLaunchData,
} from '../../../src/launch/contracts.js'
import {
  type MeasurementPlan,
  measurementDigest,
  validateMeasurement,
} from '../../../src/launch/measurement.js'
import { parseSpec } from '../../../src/spec/contract.js'

const spec = parseSpec(
  readFileSync(new URL('../../fixtures/spec/spec.md', import.meta.url), 'utf8'),
)
function fixture(size: number) {
  const template = spec.metrics[0]
  if (!template) throw new Error('Fixture metric missing')
  let reads = 0
  const metrics = Array.from(
      { length: size },
      (_, index) =>
        new Proxy(
          { ...template, id: `metric-${index}` },
          {
            get(target, key, receiver) {
              if (key === 'id') reads++
              return Reflect.get(target, key, receiver)
            },
          },
        ),
    ),
    measurement: MeasurementPlan = {
      schema: 'wholeloop/measurement-plan@1',
      impact: spec.impact,
      metrics,
      rollout: spec.rollout,
      ...(size === 0
        ? {
            measurementException: {
              reason: 'Explicit empty fixture measurement.',
              who: 'Fixture Owner',
            },
          }
        : {}),
    },
    revision = 'fixture-r1',
    digest = measurementDigest({ revision, plan: measurement }),
    plan: LaunchPlan = {
      run: `run-${'a'.repeat(16)}`,
      source: { ref: 'fixture:measurement', revision, digest, plan: measurement },
      guidance: ['comms.voice', 'launch.templates'].map((slot) => ({
        slot,
        ref: `fixture:${slot}`,
        origin: 'fixture',
        digest: 'b'.repeat(64),
      })),
    },
    draft: LaunchDraft = {
      schema: 'wholeloop/launch-kit@1',
      sourceDigest: digest,
      rolloutPlan: 'Original staged rollout.',
      comms: spec.rollout.stages.map((stage, index) => ({
        key: `stage-${index}`,
        audience: stage.audience,
        stage: stage.name,
        body: 'Original unsent draft.',
      })),
      dashboards: metrics.map((metric, index) => ({
        key: `dashboard-${index}`,
        title: `Metric ${index}`,
        metric: metric.id,
      })),
      enablement: {
        supportGuide: 'Original support guide.',
        onePager: 'Original one pager.',
        runbook: 'Original runbook.',
      },
    },
    record = {
      subject: 'scope-00000000',
      event: 'ev-00000000-0000-4000-8000-000000000000',
      plan,
      draft,
    }
  expect(validLaunchData('launch.planned', { ...plan })).toBe(true)
  reads = 0
  return { record, reads: () => reads }
}

describe('pinned launch metric selection', () => {
  it('validates each exact timezone once per independent measurement validation', () => {
    const measured = [100, 400].map((size) => {
      const input = fixture(size),
        formatterCalls = vi.spyOn(Intl, 'DateTimeFormat')
      try {
        validateMeasurement(input.record.plan.source.plan)
        validateMeasurement(input.record.plan.source.plan)
        return { size, constructors: formatterCalls.mock.calls.length }
      } finally {
        formatterCalls.mockRestore()
      }
    })
    console.info('Timezone constructors for two fresh validations:', JSON.stringify(measured))
    for (const row of measured) expect(row.constructors).toBe(2)
  })
  it('still checks distinct and invalid timezones, and constructs none for an explicit empty measurement', () => {
    const input = fixture(3),
      empty = fixture(0),
      second = input.record.plan.source.plan.metrics[1]
    if (!second) throw new Error('Second fixture metric missing')
    second.window = { ...second.window, timezone: 'Europe/Madrid' }
    const formatterCalls = vi.spyOn(Intl, 'DateTimeFormat')
    try {
      validateMeasurement(input.record.plan.source.plan)
      expect(formatterCalls).toHaveBeenCalledTimes(2)
      formatterCalls.mockClear()
      second.window = { ...second.window, timezone: 'Invalid/Fixture' }
      expect(() => validateMeasurement(input.record.plan.source.plan)).toThrow(
        'Measurement window needs a valid timezone',
      )
      expect(formatterCalls).toHaveBeenCalledTimes(2)
      formatterCalls.mockClear()
      validateMeasurement(empty.record.plan.source.plan)
      expect(formatterCalls).not.toHaveBeenCalled()
    } finally {
      formatterCalls.mockRestore()
    }
  })
  it('validates and renders complete dashboard coverage without repeated metric searches', () => {
    const measured = [100, 400].map((size) => {
      const input = fixture(size)
      validateLaunchDraft(input.record.draft, input.record.plan)
      const artifacts = renderLaunchArtifacts(input.record),
        reads = input.reads(),
        digest = createHash('sha256').update(JSON.stringify(artifacts)).digest('hex')
      expect(artifacts).toHaveLength(size + spec.rollout.stages.length + 4)
      return { size, reads, digest }
    })
    console.info('Launch validation/render metric reads:', JSON.stringify(measured))
    expect(measured.map((row) => row.digest)).toEqual([
      'b3c83802fab38ae4abd547135bce06b9b1a390a66f553d63e75061a15371f6d4',
      'd86983f20cc065661dbe0a4e1d0877a88f9e272dc0f13fed87aad3247ccff9fd',
    ])
    for (const row of measured) expect(row.reads).toBeLessThanOrEqual(row.size * 4)
  })
  it('keeps exact coverage errors and original duplicate metric first selection', () => {
    const { record } = fixture(1),
      metric = record.plan.source.plan.metrics[0]
    if (!metric) throw new Error('Fixture metric missing')
    expect(() => validateLaunchDraft({ ...record.draft, dashboards: [] }, record.plan)).toThrow(
      'Every dashboard must implement',
    )
    expect(() =>
      validateLaunchDraft(
        {
          ...record.draft,
          dashboards: [{ key: 'foreign', title: 'Foreign metric', metric: 'unknown' }],
        },
        record.plan,
      ),
    ).toThrow('Every dashboard must implement')
    expect(() => validateLaunchDraft({ ...record.draft, comms: [] }, record.plan)).toThrow(
      'Invalid wholeloop/launch-kit@1 draft',
    )
    const comm = record.draft.comms[0]
    if (!comm) throw new Error('Fixture stage missing')
    expect(() =>
      validateLaunchDraft({ ...record.draft, comms: [{ ...comm, stage: 'unknown' }] }, record.plan),
    ).toThrow('Comms drafts must reference and cover')
    expect(() =>
      renderLaunchArtifacts({
        ...record,
        draft: {
          ...record.draft,
          dashboards: [{ key: 'foreign', title: 'Foreign metric', metric: 'unknown' }],
        },
      }),
    ).toThrow('Dashboard lost its pinned measurement entry')
    const duplicate = { ...metric, name: 'Later duplicate' },
      firstDashboard = record.draft.dashboards[0]
    if (!firstDashboard) throw new Error('Fixture dashboard missing')
    const repeatedDraft = {
      ...record.draft,
      dashboards: [firstDashboard, { ...firstDashboard, key: 'second-dashboard' }],
    }
    expect(() => validateLaunchDraft(repeatedDraft, record.plan)).not.toThrow()
    const selected = renderLaunchArtifacts({
      ...record,
      draft: repeatedDraft,
      plan: {
        ...record.plan,
        source: {
          ...record.plan.source,
          plan: { ...record.plan.source.plan, metrics: [metric, duplicate] },
        },
      },
    }).filter((artifact) => artifact.operation === 'dashboards.create')
    expect(selected).toHaveLength(2)
    for (const artifact of selected)
      expect(JSON.parse(artifact.body)).toMatchObject({
        metric: { name: metric.name },
        metricRef: expect.stringContaining('/metrics/0'),
      })
  })
  it('keeps an explicit empty measurement and single-dashboard selection valid', () => {
    const empty = fixture(0),
      single = fixture(1)
    expect(() => validateLaunchDraft(empty.record.draft, empty.record.plan)).not.toThrow()
    expect(
      renderLaunchArtifacts(empty.record).filter(
        (artifact) => artifact.operation === 'dashboards.create',
      ),
    ).toEqual([])
    expect(() => validateLaunchDraft(single.record.draft, single.record.plan)).not.toThrow()
    expect(
      renderLaunchArtifacts(single.record).filter(
        (artifact) => artifact.operation === 'dashboards.create',
      ),
    ).toHaveLength(1)
  })
})
