import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { FlowEngine } from '../../../src/flow/engine.js'
import { impactRuns, metricVerdict } from '../../../src/impact/contracts.js'
import { impactDigest } from '../../../src/impact/digest.js'
import { dispatchImpactDigest } from '../../../src/impact/publish.js'
import { runImpact } from '../../../src/impact/run.js'
import { impactReadRequests, impactResponseHost } from '../../../src/impact/transcript.js'
import { ImpactWorkflow } from '../../../src/impact/workflow.js'
import type { MeasurementPlan } from '../../../src/launch/measurement.js'
import type { OperationCall, ProviderHost } from '../../../src/providers/operations.js'
import { parseSpec } from '../../../src/spec/contract.js'
import { projections } from '../../../src/state/projections.js'
import { contextPack } from '../../../src/state/resume.js'
import { StateStore } from '../../../src/state/store.js'
import { next } from '../../../src/utilities/next.js'

function measurement(): MeasurementPlan {
  const spec = parseSpec(
    readFileSync(new URL('../../fixtures/spec/spec.md', import.meta.url), 'utf8'),
  )
  return {
    schema: 'wholeloop/measurement-plan@1',
    impact: spec.impact,
    metrics: spec.metrics,
    rollout: spec.rollout,
  }
}
const qualitative = [
  {
    id: 'feedback',
    provider: 'analytics',
    operation: 'source.feedback.query',
    query: 'sanitized order search feedback',
    days: 7,
    timezone: 'UTC',
  },
]
async function fixture(
  run: (context: {
    dir: string
    root: string
    engine: FlowEngine
    workflow: ImpactWorkflow
    host: ProviderHost
    calls: OperationCall[]
    response: { value: number; unit: string; unavailable: boolean }
  }) => void | Promise<void>,
) {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-impact-'))
  const root = join(dir, 'repo')
  mkdirSync(join(root, '.wholeloop/providers/analytics'), { recursive: true })
  writeFileSync(
    join(root, '.wholeloop/providers/analytics/provider.json'),
    JSON.stringify({
      schema: 1,
      id: 'analytics',
      name: 'Analytics fixture',
      description: 'Synthetic normalized reads and explicit drafts/comments',
      capabilities: ['source.product-analytics', 'source.feedback', 'comms', 'docs'],
      access: { native: true },
      operations: {
        'source.product-analytics.query': { tool: 'aggregate' },
        'source.feedback.query': { tool: 'feedback' },
        'comms.draft': { tool: 'create_draft' },
        'docs.read': { tool: 'read_doc' },
        'docs.update': { tool: 'update_doc' },
      },
      degrade: {
        'source.product-analytics.query': 'open-question',
        'source.feedback.query': 'open-question',
        'comms.draft': 'handoff-artifact',
        'docs.read': 'open-question',
        'docs.update': 'handoff-artifact',
      },
    }),
  )
  const engine = new FlowEngine(
    new StateStore(join(dir, 'state')),
    root,
    join(dir, 'user/config.yml'),
    join(dir, 'home'),
  )
  const response = { value: 29, unit: 'seconds', unavailable: false }
  const calls: OperationCall[] = []
  const host: ProviderHost = {
    invoke: async (call) => {
      calls.push(call)
      if (!call.operation.startsWith('source.')) throw new Error('Unexpected write in read fixture')
      if (response.unavailable) throw new Error('private fixture diagnostic')
      return {
        status: 'succeeded',
        complete: true,
        ref: 'https://example.com/observation',
        body: JSON.stringify(
          call.operation === 'source.feedback.query'
            ? { text: 'Customers request date presets.' }
            : { value: response.value, unit: response.unit },
        ),
      }
    },
  }
  try {
    await run({ dir, root, engine, workflow: new ImpactWorkflow(engine), host, calls, response })
  } finally {
    vi.useRealTimers()
    rmSync(dir, { recursive: true, force: true })
  }
}
function started(
  workflow: ImpactWorkflow,
  extra: Partial<Parameters<ImpactWorkflow['begin']>[0]> = {},
) {
  const begun = workflow.begin({
    input: 'Order search impact',
    owner: 'Alex',
    measurement: measurement(),
    launchedAt: '2026-08-01T00:00:00Z',
    checkpoint: 'd7',
    at: '2026-08-08T00:00:00Z',
    qualitative,
    ...extra,
  })
  if (begun.status !== 'planned') throw new Error('Expected impact plan')
  return begun
}

describe('pinned impact checkpoints', () => {
  it('stops before reads and carries an explicit no-measurement exception without invented metrics', async () =>
    fixture(async ({ workflow, engine, host }) => {
      const none = measurement()
      none.metrics = []
      none.measurementException = {
        reason: 'No numerical outcome applies to this policy correction',
        who: 'Alex',
      }
      const stopped = await runImpact(
        workflow,
        {},
        { source: async () => host, layout: async () => [], stopped: () => true },
      )
      expect(stopped.status).toBe('stopped')
      expect(engine.store.events()).toEqual([])
      const { subject } = started(workflow, { measurement: none, qualitative: [] })
      expect((await workflow.observe(subject, host)).metrics).toEqual([])
      expect(workflow.report(subject).measurementException?.who).toBe('Alex')
      expect(() => workflow.complete(subject)).not.toThrow()
    }))

  it('honors configured checkpoints and routes due measurement work without starting it implicitly', async () =>
    fixture(async ({ workflow, host, root, engine }) => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-08-08T00:00:00Z'))
      writeFileSync(
        join(root, '.wholeloop/config.yml'),
        'version: 1\nlearn:\n  checkpoints: [launch, d7, pilot-exit]\n',
      )
      const { subject } = started(workflow, { checkpoint: 'launch' })
      await workflow.observe(subject, host)
      workflow.complete(subject)
      const count = engine.store.events().length
      expect(next(engine, subject).payload.action).toEqual({
        step: 'measure-impact',
        command: `wl measure begin --for ${subject} --checkpoint d7`,
      })
      expect(engine.store.events()).toHaveLength(count)
      expect(workflow.schedule(subject).checkpoints.map((row) => row.status)).toEqual([
        'measured',
        'due',
        'needs-offset',
      ])
      expect(workflow.begin({ subject, checkpoint: 'pilot-exit', afterDays: 3 }).status).toBe(
        'planned',
      )
    }))

  it('keeps arithmetic overflow unknown even when both observed inputs are finite', async () =>
    fixture(async ({ workflow, host, response }) => {
      const input = measurement()
      const metric = input.metrics[0]
      if (!metric) throw new Error('Missing fixture metric')
      metric.baseline = {
        status: 'known',
        value: -Number.MAX_VALUE,
        evidence: 'https://example.com/baseline',
      }
      metric.target = { operator: 'gte', value: Number.MAX_VALUE }
      response.value = Number.MAX_VALUE
      const { subject } = started(workflow, { measurement: input })
      const report = await workflow.observe(subject, host)
      expect(report.metrics[0]?.observation?.value).toBe(Number.MAX_VALUE)
      expect(report.metrics[0]?.delta).toBeNull()
      expect(report.metrics[0]?.verdict).toBe('met')
    }))

  it('batches missing standalone facts and leaves no fabricated history', async () =>
    fixture(({ workflow, engine }) => {
      expect(workflow.begin({}).questions.map((question) => question.id)).toEqual([
        'owner',
        'input',
        'measurement',
        'launchedAt',
      ])
      expect(engine.store.events()).toEqual([])
      expect(() => started(workflow, { checkpoint: '../escape', afterDays: 0 })).toThrow(
        'impact plan',
      )
      expect(engine.store.events()).toEqual([])
    }))

  it('refuses a checkpoint before it is due without creating state', async () =>
    fixture(({ workflow, engine }) => {
      expect(() => started(workflow, { at: '2026-08-02T00:00:00Z' })).toThrow('not due')
      expect(engine.store.events()).toEqual([])
      expect(
        workflow.begin({
          input: 'Custom outcome',
          owner: 'Alex',
          measurement: measurement(),
          launchedAt: '2026-08-01T00:00:00Z',
          checkpoint: 'pilot-exit',
        }).questions[0]?.id,
      ).toBe('checkpoint')
    }))

  it('executes exact queries/windows, computes partial progress and keeps qualitative quotes separate', async () =>
    fixture(async ({ workflow, host, calls, engine }) => {
      const { subject } = started(workflow)
      const report = await workflow.observe(subject, host)
      expect(calls).toHaveLength(2)
      expect(calls[0]?.args).toMatchObject({
        query: measurement().metrics[0]?.source.query,
        window: {
          start: '2026-07-09T00:00:00.000Z',
          end: '2026-08-08T00:00:00.000Z',
          timezone: 'UTC',
        },
      })
      expect(report.metrics[0]).toMatchObject({
        verdict: 'partly',
        delta: -19,
        observation: { value: 29, unit: 'seconds', ref: 'https://example.com/observation' },
      })
      expect(report.qualitative[0]?.observation?.text).toBe('Customers request date presets.')
      expect(report.metrics[0]?.metricRef).toContain('#/plan/source/plan/metrics/0')
      const receipt = workflow.complete(subject)
      const content = engine.store.files.read(receipt.artifact)
      expect(content).toContain('Qualitative statements are source quotes')
      expect(content).toContain(measurement().metrics[0]?.source.query)
      expect(content).toContain('https://example.com/observation')
      expect(workflow.complete(subject)).toMatchObject({ cached: true })
    }))

  it('preserves missing sources as unknown and never invents a zero', async () =>
    fixture(async ({ workflow, host, response, engine }) => {
      const { subject } = started(workflow)
      response.unavailable = true
      const report = await workflow.observe(subject, host)
      expect(report.metrics[0]).toMatchObject({
        verdict: 'unknown',
        delta: null,
        observation: { status: 'unknown' },
      })
      expect(report.metrics[0]?.observation?.value).toBeUndefined()
      expect(report.qualitative[0]?.observation?.status).toBe('unknown')
      expect(JSON.stringify(engine.store.events())).not.toContain('private fixture diagnostic')
      expect(() => workflow.complete(subject)).not.toThrow()
    }))

  it('distinguishes real zero, incompatible units and an unsupported provider operation', async () =>
    fixture(async ({ workflow, host, response }) => {
      const { subject } = started(workflow)
      response.value = 0
      expect((await workflow.observe(subject, host)).metrics[0]).toMatchObject({
        verdict: 'met',
        observation: { value: 0 },
      })
      response.unit = 'milliseconds'
      expect((await workflow.observe(subject, host)).metrics[0]?.verdict).toBe('unknown')
      const input = measurement()
      const metric = input.metrics[0]
      if (!metric) throw new Error('Missing fixture metric')
      metric.source.operation = 'source.errors.query'
      const next = started(workflow, { measurement: input })
      expect((await workflow.observe(next.subject, host)).metrics[0]?.verdict).toBe('unknown')
    }))

  it('derives every comparison and does not call regression partial success', () => {
    const metric = measurement().metrics[0]
    if (!metric) throw new Error('Missing fixture metric')
    for (const [value, verdict] of [
      [undefined, 'unknown'],
      [0, 'met'],
      [20, 'met'],
      [29, 'partly'],
      [48, 'missed'],
      [60, 'missed'],
    ] as const)
      expect(metricVerdict(value, metric)).toBe(verdict)
    expect(
      metricVerdict(21, {
        ...metric,
        baseline: { status: 'known', value: 0, evidence: 'fixture' },
      }),
    ).toBe('missed')
    expect(
      metricVerdict(29, {
        ...metric,
        baseline: { status: 'unknown', missing: 'No baseline', who: 'Alex' },
      }),
    ).toBe('missed')
  })

  it('pins resume inputs and rejects source overrides or invented report receipts', async () =>
    fixture(async ({ workflow, host, engine }) => {
      const { subject, plan } = started(workflow)
      expect(workflow.begin({ subject }).status).toBe('planned')
      expect(workflow.context(subject).record.plan).toEqual(plan)
      expect(() => workflow.begin({ subject, launchedAt: '2026-08-02T00:00:00Z' })).toThrow(
        'already pinned',
      )
      const changed = measurement()
      const metric = changed.metrics[0]
      if (!metric) throw new Error('Missing fixture metric')
      metric.target.value = 100
      expect(() => workflow.begin({ subject, measurement: changed })).toThrow('override')
      expect(() => engine.complete('measure-impact', subject, '# fake receipt')).toThrow()
      await workflow.observe(subject, host)
      workflow.format(subject, [
        { title: 'Evidence', metrics: ['retrieval-time'], qualitative: ['feedback'] },
      ])
      expect(() =>
        engine.complete(
          'measure-impact',
          subject,
          '# Fake\n\n## Checkpoint\n\nFake.\n\n## Measurements\n\nFake.\n\n## Unknowns\n\nFake.\n\n## Handoff\n\nFake.',
        ),
      ).toThrow('canonical')
    }))

  it('validates coverage and window/value identity during journal replay', async () =>
    fixture(async ({ workflow, host, engine }) => {
      const { subject, plan } = started(workflow)
      await workflow.observe(subject, host)
      const record = impactRuns(engine.store.events()).at(-1)
      const observation = record?.observation
      if (!observation) throw new Error('Missing fixture observation')
      const before = engine.store.events().length
      for (const data of [
        { run: plan.run, metrics: [], qualitative: observation.qualitative },
        {
          run: plan.run,
          metrics: observation.metrics.map((row) => ({ ...row, unit: 'other' })),
          qualitative: observation.qualitative,
        },
        {
          run: plan.run,
          metrics: observation.metrics.map((row) => ({
            ...row,
            window: { ...row.window, start: row.window.end },
          })),
          qualitative: observation.qualitative,
        },
        {
          run: plan.run,
          metrics: observation.metrics.map((row) => ({
            ...row,
            status: 'unknown' as const,
            missing: 'Unavailable',
          })),
          qualitative: observation.qualitative,
        },
      ])
        expect(() =>
          engine.store.transaction((_events, append) =>
            append(subject, { type: 'impact.observed', data }),
          ),
        ).toThrow()
      expect(engine.store.events()).toHaveLength(before)
    }))

  it('loads report guidance, permits layout only and invalidates a stale layout', async () =>
    fixture(async ({ workflow, engine, root, host }) => {
      mkdirSync(join(root, '.wholeloop'), { recursive: true })
      writeFileSync(
        join(root, 'impact-review.md'),
        'Lead with customer feedback, then the quantitative promise.',
      )
      writeFileSync(
        join(root, '.wholeloop/config.yml'),
        'version: 1\nslots:\n  learn.report: impact-review.md\n',
      )
      const { subject, guidance } = started(workflow)
      expect(guidance.content).toContain('Lead with customer feedback')
      await workflow.observe(subject, host)
      expect(() => workflow.complete(subject)).toThrow('layout')
      expect(() =>
        workflow.format(subject, [{ title: 'Metrics', metrics: [], qualitative: [] }]),
      ).toThrow('exactly once')
      expect(() =>
        workflow.format(subject, [
          { title: 'Invented 99 percent', metrics: ['retrieval-time'], qualitative: ['feedback'] },
        ]),
      ).toThrow('plain headings')
      workflow.format(subject, [
        { title: 'Customer feedback', metrics: [], qualitative: ['feedback'] },
        { title: 'Promise', metrics: ['retrieval-time'], qualitative: [] },
      ])
      await workflow.observe(subject, host)
      expect(workflow.report(subject).sections).toBeNull()
      workflow.format(subject, [
        { title: 'Evidence', metrics: ['retrieval-time'], qualitative: ['feedback'] },
      ])
      expect(() => workflow.complete(subject)).not.toThrow()
      writeFileSync(join(root, 'impact-review.md'), 'Changed guidance')
      expect(() => workflow.context(subject)).toThrow('guidance changed')
      expect(
        engine.store.events().filter((event) => event.type === 'impact.formatted'),
      ).toHaveLength(2)
    }))

  it('rebuilds byte-identical projections and lists due configured checkpoints', async () =>
    fixture(async ({ workflow, host, engine }) => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-08-08T00:00:00Z'))
      const { subject } = started(workflow)
      await workflow.observe(subject, host)
      workflow.complete(subject)
      const before = [
        ...projections(
          new Map(engine.store.list().map((item) => [item.id, item])),
          engine.store.events(),
        ),
      ]
      engine.store.rebuild()
      for (const [path, content] of before) expect(engine.store.files.read(path)).toBe(content)
      expect(workflow.schedule(subject).checkpoints.map((row) => row.status)).toEqual([
        'due',
        'measured',
        'scheduled',
      ])
      expect(contextPack(engine.store.events(), subject).subject).toHaveProperty('impact')
      const next = workflow.begin({ subject, checkpoint: 'launch' })
      expect(next.status).toBe('planned')
    }))

  it('groups read-only analysts by source and keeps report layout separate from values', async () =>
    fixture(async ({ workflow, host }) => {
      const sources: string[] = []
      const result = await runImpact(
        workflow,
        {
          input: 'Outcome',
          owner: 'Alex',
          measurement: measurement(),
          launchedAt: '2026-08-01T00:00:00Z',
          checkpoint: 'launch',
          qualitative,
        },
        {
          source: async (provider) => {
            sources.push(provider)
            return host
          },
          stopped: () => false,
          layout: async (context, report) => {
            expect(context.guidance.content).toContain('exact query/source/window')
            expect(report.metrics[0]?.observation?.value).toBe(29)
            return [{ title: 'Evidence', metrics: ['retrieval-time'], qualitative: ['feedback'] }]
          },
        },
      )
      expect(result.status).toBe('completed')
      expect(sources).toEqual(['analytics'])
    }))

  it('exports exact read requests without a remote call and imports explicit unavailable results', async () =>
    fixture(async ({ workflow, calls }) => {
      const { subject } = started(workflow)
      const requests = await impactReadRequests(workflow, subject)
      expect(calls).toEqual([])
      expect(requests.requests).toHaveLength(2)
      expect(() =>
        impactResponseHost(
          {
            schema: 'wholeloop/impact-read-responses@1',
            run: requests.run,
            at: requests.at,
            results: [],
          },
          requests,
        ),
      ).toThrow('every request')
      const host = impactResponseHost(
        {
          schema: 'wholeloop/impact-read-responses@1',
          run: requests.run,
          at: requests.at,
          results: requests.requests.map(({ fingerprint }) => ({
            fingerprint,
            unavailable: 'Explicit unavailable fixture read',
          })),
        },
        requests,
      )
      expect((await workflow.observe(subject, host)).metrics[0]?.verdict).toBe('unknown')
    }))

  it('prepares stable multi-scope digests and only explicitly publishes unsent drafts or same-read document comments', async () =>
    fixture(async ({ workflow, host, engine }) => {
      const one = started(workflow)
      await workflow.observe(one.subject, host)
      workflow.complete(one.subject)
      const two = started(workflow, { input: 'Another scope' })
      await workflow.observe(two.subject, host)
      workflow.complete(two.subject)
      const subjects = [one.subject, two.subject]
      const digest = impactDigest(engine.store.events(), subjects)
      expect(impactDigest(engine.store.events(), [...subjects].reverse()).id).toBe(digest.id)
      expect(digest.draft).toMatchObject({ draft: true, send: false })
      expect(digest.comments).toHaveLength(2)
      const calls: OperationCall[] = []
      const publisher: ProviderHost = {
        invoke: async (call) => {
          calls.push(call)
          if (call.operation === 'comms.draft') {
            expect(call.args).toMatchObject({ draft: true, send: false })
            return {
              status: 'succeeded',
              ref: 'https://example.com/draft',
              body: JSON.stringify({ draft: true, sent: false }),
            }
          }
          if (call.operation === 'docs.read')
            return {
              status: 'succeeded',
              ref: String(call.args.ref),
              complete: true,
              revision: 'fresh-revision',
              body: 'Keep original unrelated content',
            }
          expect(call.operation).toBe('docs.update')
          expect(call.args.body).toContain('Keep original unrelated content')
          expect(call.args.body).toContain('wholeloop-impact:')
          expect(call.args.revision).toBe('fresh-revision')
          return { status: 'succeeded', ref: String(call.args.ref) }
        },
      }
      const target = { kind: 'draft' as const, provider: 'analytics' }
      await dispatchImpactDigest(engine, subjects, target, publisher)
      expect((await dispatchImpactDigest(engine, subjects, target, publisher)).cached).toBe(true)
      await dispatchImpactDigest(
        engine,
        subjects,
        {
          kind: 'doc-comment',
          provider: 'analytics',
          subject: one.subject,
          ref: 'https://example.com/impact-doc',
        },
        publisher,
      )
      expect(calls.map((call) => call.operation)).toEqual([
        'comms.draft',
        'docs.read',
        'docs.update',
      ])
    }))

  it('retains ambiguous draft intent and refuses automatic retries', async () =>
    fixture(async ({ workflow, host, engine }) => {
      const { subject } = started(workflow)
      await workflow.observe(subject, host)
      workflow.complete(subject)
      const target = { kind: 'draft' as const, provider: 'analytics' }
      const bad: ProviderHost = {
        invoke: async () => {
          throw new Error('private provider detail')
        },
      }
      await expect(dispatchImpactDigest(engine, [subject], target, bad)).rejects.toThrow(
        'ambiguous',
      )
      await expect(dispatchImpactDigest(engine, [subject], target, host)).rejects.toThrow(
        'ambiguous',
      )
      expect(JSON.stringify(engine.store.events())).not.toContain('private provider detail')
    }))

  it('runs the compiled CLI from planning through explicit observations and completion', async () =>
    fixture(({ dir, root }) => {
      const env = {
        ...process.env,
        XDG_STATE_HOME: join(dir, 'cli-state'),
        XDG_CONFIG_HOME: join(dir, 'cli-config'),
        HOME: join(dir, 'home'),
      }
      const cli = (...args: string[]) => {
        const result = spawnSync(process.execPath, [resolve('dist/wl.mjs'), ...args, '--json'], {
          cwd: root,
          env,
          encoding: 'utf8',
        })
        expect(result.status, result.stderr || result.stdout).toBe(0)
        return JSON.parse(result.stdout)
      }
      const input = join(dir, 'measurement.json')
      writeFileSync(input, JSON.stringify(measurement()))
      const begun = cli(
        'measure',
        'begin',
        'Order search impact',
        '--owner',
        'Alex',
        '--measurement',
        input,
        '--launched-at',
        '2026-08-01T00:00:00Z',
      )
      const requests = cli('measure', 'requests', '--for', begun.subject)
      const responses = join(dir, 'responses.json')
      writeFileSync(
        responses,
        JSON.stringify({
          schema: 'wholeloop/impact-read-responses@1',
          run: requests.run,
          at: requests.at,
          results: requests.requests.map((request: { fingerprint: string }) => ({
            fingerprint: request.fingerprint,
            result: {
              status: 'succeeded',
              complete: true,
              ref: 'https://example.com/actual',
              body: JSON.stringify({ value: 18, unit: 'seconds' }),
            },
          })),
        }),
      )
      expect(
        cli('measure', 'observe', '--for', begun.subject, '--file', responses).metrics[0].verdict,
      ).toBe('met')
      expect(cli('measure', 'complete', '--for', begun.subject).artifact).toContain(
        'measure-impact',
      )
      expect(cli('measure', 'digest', '--for', begun.subject).reports).toHaveLength(1)
      expect(cli('measure', 'schedule', '--for', begun.subject).checkpoints[0].status).toBe(
        'measured',
      )
    }))
})
