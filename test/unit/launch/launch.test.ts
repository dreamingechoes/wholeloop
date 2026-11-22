import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { stringify } from 'yaml'
import { runLaunch } from '../../../harness/workflows/launch.js'
import { FlowEngine } from '../../../src/flow/engine.js'
import type { LaunchDraft } from '../../../src/launch/contracts.js'
import {
  type MeasurementPlan,
  scopeMeasurement,
  validateMeasurement,
} from '../../../src/launch/measurement.js'
import { dispatchLaunchArtifact, launchDeliveries } from '../../../src/launch/publish.js'
import { LaunchWorkflow } from '../../../src/launch/workflow.js'
import { loadProviders } from '../../../src/providers/load.js'
import { validateProvider } from '../../../src/providers/manifest.js'
import { rolloutHost } from '../../../src/providers/rollout.js'
import { clientProviderHost } from '../../../src/providers/transport.js'
import { SCOPE_SECTIONS } from '../../../src/scopes/contract.js'
import { parseSpec } from '../../../src/spec/contract.js'
import { StateStore } from '../../../src/state/store.js'
import { installSpecProvider } from '../../support/spec-providers.js'

const spec = readFileSync(new URL('../../fixtures/spec/spec.md', import.meta.url), 'utf8')
const measurement = (): MeasurementPlan => {
  const parsed = parseSpec(spec)
  return {
    schema: 'wholeloop/measurement-plan@1',
    impact: parsed.impact,
    metrics: parsed.metrics,
    rollout: parsed.rollout,
  }
}
async function fixture(
  run: (context: {
    dir: string
    root: string
    engine: FlowEngine
    workflow: LaunchWorkflow
  }) => void | Promise<void>,
) {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-launch-'))
  const root = join(dir, 'repo')
  mkdirSync(root)
  const engine = new FlowEngine(
    new StateStore(join(dir, 'state')),
    root,
    join(dir, 'user/config.yml'),
    join(dir, 'home'),
  )
  installSpecProvider(dirname(engine.userFile))
  try {
    await run({ dir, root, engine, workflow: new LaunchWorkflow(engine) })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
function begun(workflow: LaunchWorkflow) {
  const result = workflow.begin({
    input: 'Order search launch',
    owner: 'Alex',
    measurement: measurement(),
  })
  if (result.status !== 'planned') throw new Error('Expected launch plan')
  return result
}
function draft(digest: string): LaunchDraft {
  return {
    schema: 'wholeloop/launch-kit@1',
    sourceDigest: digest,
    rolloutPlan: 'Pilot first; expand after the recorded exit criteria and human review.',
    comms: [
      {
        key: 'pilot-note',
        audience: 'Internal reviewers',
        stage: 'pilot',
        body: 'Draft: try the order search and report ownership/filtering problems.',
      },
      {
        key: 'general-note',
        audience: 'Returning customers',
        stage: 'general',
        body: 'Draft: find a previous order by its number.',
      },
    ],
    dashboards: [
      { key: 'retrieval-chart', title: 'Order retrieval time', metric: 'retrieval-time' },
    ],
    enablement: {
      supportGuide: 'Check the account identity and retained search text.',
      onePager: 'Order search reduces repeated paging for returning customers.',
      runbook: 'Follow staged exit criteria; a person owns rollback and flag changes.',
    },
  }
}
function scoped(engine: FlowEngine) {
  const begun = engine.begin('write-spec', {
    input: 'Order search',
    owner: 'Alex',
    impact: 'Reduce retrieval time',
  })
  const initiative = begun.payload.subject?.id ?? ''
  const completed = engine.complete('write-spec', initiative, spec)
  engine.answer('decision.approve-spec', 'approved', {
    scope: 'run',
    subject: initiative,
    by: 'Alex',
  })
  engine.begin('cut-scopes', { subject: initiative })
  const plan = {
    schema: 'wholeloop/scope-plan@1',
    sourceSpec: completed.artifact,
    metricIds: ['retrieval-time'],
    scopes: [
      {
        key: 'main',
        title: 'Order search',
        goal: 'Retrieve a past order by number',
        metrics: ['retrieval-time'],
        stories: ['find-order'],
        delivery: { mode: 'feature', flag: 'orders_search_v1' },
        complexity: { level: 'simple', why: 'One endpoint and one input' },
      },
    ],
  }
  const content = `---\n${stringify(plan)}---\n${SCOPE_SECTIONS.map((name) => `## ${name}\n\nReview the exact source and delivery definition.\n`).join('\n')}`
  const scopes = engine.complete('cut-scopes', initiative, content)
  engine.answer('decision.approve-scopes', 'approved', {
    scope: 'run',
    subject: initiative,
    by: 'Alex',
  })
  return { initiative, subject: scopes.scopes?.[0]?.id ?? '', specRef: completed.artifact }
}
function provider(root: string, tool = 'create_draft') {
  const directory = join(root, '.wholeloop/providers/launch-fixture')
  mkdirSync(directory, { recursive: true })
  const value = {
    schema: 1,
    id: 'launch-fixture',
    name: 'Launch fixture',
    description: 'Synthetic safe draft/create host',
    capabilities: ['comms', 'dashboards'],
    access: { native: true },
    operations: { 'comms.draft': { tool }, 'dashboards.create': { tool: 'create_dashboard' } },
    degrade: { 'comms.draft': 'handoff-artifact', 'dashboards.create': 'handoff-artifact' },
  }
  writeFileSync(join(directory, 'provider.json'), JSON.stringify(value))
  writeFileSync(
    join(root, '.wholeloop/config.yml'),
    'version: 1\nproviders:\n  comms: launch-fixture\n  dashboards: launch-fixture\n',
  )
  return value
}

describe('pinned launch kits and local handoffs', () => {
  it('asks for missing launch facts and measurements without creating fake earlier steps', async () =>
    fixture(({ engine, workflow }) => {
      const result = workflow.begin({})
      expect(result.status).toBe('question')
      expect(result.questions.map((question) => question.id)).toEqual([
        'owner',
        'input',
        'measurement',
      ])
      expect(engine.store.events()).toEqual([])
    }))

  it('loads actual voice/templates and stores a complete kit with resolvable exact-metric dashboard links', async () =>
    fixture(async ({ root, engine, workflow }) => {
      mkdirSync(join(root, '.wholeloop'))
      writeFileSync(
        join(root, '.wholeloop/config.yml'),
        'version: 1\nslots:\n  comms.voice: voice.md\n  launch.templates: templates.md\n',
      )
      writeFileSync(
        join(root, 'voice.md'),
        'Write plainly; use the repository term returning customer.\n',
      )
      writeFileSync(
        join(root, 'templates.md'),
        'Use the agreed pilot and general stages; retain rollback ownership.\n',
      )
      const result = await runLaunch(
        workflow,
        { input: 'Order search launch', owner: 'Alex', measurement: measurement() },
        {
          stopped: () => false,
          draft: async (context) => {
            expect(context.guidance.find((item) => item.slot === 'comms.voice')?.content).toContain(
              'returning customer',
            )
            expect(
              context.guidance.find((item) => item.slot === 'launch.templates')?.content,
            ).toContain('rollback ownership')
            return draft(context.plan.source.digest)
          },
        },
      )
      if (!('publication' in result)) throw new Error('Expected launch completion')
      expect(result.publication).toHaveLength(7)
      expect(
        result.publication
          .filter((entry) => entry.operation === 'comms.draft')
          .every((entry) => entry.sent === false && entry.status === 'handoff'),
      ).toBe(true)
      const dashboard = result.publication.find((entry) => entry.operation === 'dashboards.create')
      if (!dashboard?.metricRef) throw new Error('Missing dashboard metric link')
      const descriptor = JSON.parse(engine.store.files.read(dashboard.path) ?? '{}')
      const [path, pointer] = dashboard.metricRef.split('#')
      const stored = JSON.parse(engine.store.files.read(path ?? '') ?? '{}')
      const index = Number(pointer?.split('/').at(-1))
      expect(stored.metrics[index]).toEqual(measurement().metrics[0])
      expect(descriptor.metric.source.query).toBe(stored.metrics[index].source.query)
      expect(descriptor.sourceDigest).toBe(workflow.context(result.subject).plan.source.digest)
      const before = engine.store.files.read(dashboard.path)
      engine.store.rebuild()
      expect(engine.store.files.read(dashboard.path)).toBe(before)
      expect(workflow.complete(result.subject, draft(descriptor.sourceDigest)).cached).toBe(true)
      expect(
        engine.store
          .events()
          .some((event) => event.type === 'step.completed' && event.data.step === 'write-spec'),
      ).toBe(false)
    }))

  it('rejects invented metrics, query overrides, missing stage drafts and fabricated receipts before completion', async () =>
    fixture(({ engine, workflow }) => {
      const start = begun(workflow)
      const good = draft(start.plan.source.digest)
      for (const invalid of [
        { ...good, sourceDigest: 'a'.repeat(64) },
        { ...good, dashboards: [{ key: 'invented', title: 'Invented', metric: 'invented' }] },
        { ...good, dashboards: [{ ...good.dashboards[0], query: 'invented query' }] },
        { ...good, comms: good.comms.slice(0, 1) },
      ])
        expect(() => workflow.complete(start.subject, invalid as LaunchDraft)).toThrow()
      expect(engine.store.events().filter((event) => event.type === 'launch.drafted')).toEqual([])
      expect(() =>
        engine.complete(
          'prepare-launch',
          start.subject,
          '# Fake\n\n## Measurement plan\nX\n## Rollout plan\nX\n## Comms drafts\nX\n## Dashboards\nX\n## Enablement\nX\n## Handoffs\nX\n',
        ),
      ).toThrow('validated pinned launch kit')
    }))

  it('keeps unknown baselines explicit and accepts a justified zero-metric exception without inventing charts', async () =>
    fixture(({ workflow }) => {
      const input = measurement()
      const metric = input.metrics[0]
      if (!metric) throw new Error('Missing metric')
      metric.baseline = { status: 'unknown', missing: 'Tracking is not deployed', who: 'Alex' }
      expect(() => validateMeasurement(input)).not.toThrow()
      expect(() =>
        validateMeasurement({
          ...input,
          metrics: [{ ...metric, baseline: { ...metric.baseline, value: 0 } }],
        }),
      ).toThrow('Unknown baseline')
      const exception: MeasurementPlan = {
        ...input,
        metrics: [],
        measurementException: {
          reason: 'Contractual release judged by acceptance tests',
          who: 'Alex',
        },
      }
      const start = workflow.begin({
        input: 'Contractual release',
        owner: 'Alex',
        measurement: exception,
      })
      if (start.status !== 'planned') throw new Error('Expected exception plan')
      expect(
        workflow
          .complete(start.subject, { ...draft(start.plan.source.digest), dashboards: [] })
          .publication.some((entry) => entry.operation === 'dashboards.create'),
      ).toBe(false)
    }))

  it('uses the scope-pinned spec revision instead of the latest spec and refuses invocation overrides', async () =>
    fixture(({ engine, workflow }) => {
      const scope = scoped(engine)
      const source = scopeMeasurement(engine.store.events(), scope.subject, 'Alex')
      expect(source?.ref).toBe(scope.specRef)
      engine.begin('write-spec', { subject: scope.initiative })
      engine.complete('write-spec', scope.initiative, spec.replace('value: 20', 'value: 99'))
      expect(
        scopeMeasurement(engine.store.events(), scope.subject, 'Alex')?.plan.metrics[0]?.target
          .value,
      ).toBe(20)
      const changed = measurement()
      const metric = changed.metrics[0]
      if (metric) metric.target.value = 99
      expect(() => workflow.begin({ subject: scope.subject, measurement: changed })).toThrow(
        'cannot override',
      )
    }))

  it('pins guidance across resumes and leaves stopped drafts unpublished', async () =>
    fixture(async ({ root, engine, workflow }) => {
      mkdirSync(join(root, '.wholeloop'))
      writeFileSync(
        join(root, '.wholeloop/config.yml'),
        'version: 1\nslots:\n  comms.voice: voice.md\n',
      )
      writeFileSync(join(root, 'voice.md'), 'Original voice\n')
      const start = begun(workflow)
      writeFileSync(join(root, 'voice.md'), 'Changed voice\n')
      expect(() => workflow.complete(start.subject, draft(start.plan.source.digest))).toThrow(
        'guidance changed',
      )
      const before = engine.store.events().length
      expect(
        await runLaunch(workflow, {}, { stopped: () => true, draft: async () => draft('unused') }),
      ).toMatchObject({ status: 'stopped' })
      expect(engine.store.events()).toHaveLength(before)
    }))
})

describe('explicit bounded launcher publication boundary', () => {
  it.each(['succeeded', 'uncertain'])(
    'retains once-only dispatch across an MCP %s outcome without another transport',
    async (outcome) =>
      fixture(async ({ root, engine, workflow }) => {
        mkdirSync(join(root, '.wholeloop'))
        writeFileSync(
          join(root, '.wholeloop/config.yml'),
          'version: 1\nproviders:\n  dashboards: posthog\n',
        )
        const selected = loadProviders({
          root,
          user: join(root, 'unused-user-providers'),
        }).providers.find((entry) => entry.manifest.id === 'posthog')
        if (!selected) throw new Error('Missing fixture provider')
        const start = begun(workflow)
        workflow.complete(start.subject, draft(start.plan.source.digest))
        let mcp = 0
        let native = 0
        const host = rolloutHost(
          engine.store.files,
          root,
          clientProviderHost(selected, {
            mcp: {
              inventory: {
                schema: 'wholeloop/client-mcp@1',
                server: 'posthog',
                tools: [{ name: 'fixture_create', inputSchema: { type: 'object' } }],
                bindings: { 'dashboards.create': 'fixture_create' },
              },
              invoke: async (call) => {
                mcp++
                expect(call.tool).toBe('fixture_create')
                expect(call.args.measurementEntry).toContain('/measurement.json#/metrics/0')
                expect(call.args.dashboard).toMatchObject({ metric: { id: 'retrieval-time' } })
                if (outcome === 'uncertain') throw new Error('Synthetic lost response')
                return { status: 'succeeded', ref: 'https://example.invalid/fixture-chart' }
              },
            },
            native: {
              invoke: async () => {
                native++
                throw new Error('Unexpected native invocation')
              },
            },
          }),
        )
        const dispatch = () =>
          dispatchLaunchArtifact(workflow, start.subject, 'dashboards/retrieval-chart', host)
        if (outcome === 'uncertain') {
          await expect(dispatch()).rejects.toThrow('retained intent')
          await expect(dispatch()).rejects.toThrow('ambiguous')
          expect(launchDeliveries(engine.store.events())[0]?.result).toBeUndefined()
          expect(engine.store.get(start.subject).links).not.toContain(
            'https://example.invalid/fixture-chart',
          )
        } else {
          expect(await dispatch()).toMatchObject({ cached: false, result: { status: 'succeeded' } })
          expect(await dispatch()).toMatchObject({ cached: true })
          expect(engine.store.get(start.subject).links).toContain(
            'https://example.invalid/fixture-chart',
          )
        }
        expect({ mcp, native }).toEqual({ mcp: 1, native: 0 })
      }),
  )

  it('dispatches only draft/create requests once and preserves exact dashboard provenance', async () =>
    fixture(async ({ root, engine, workflow }) => {
      provider(root)
      const start = begun(workflow)
      workflow.complete(start.subject, draft(start.plan.source.digest))
      const calls: string[] = []
      const host = {
        invoke: async (call: { operation: string; args: Record<string, unknown> }) => {
          calls.push(call.operation)
          if (call.operation === 'dashboards.create') {
            expect(call.args.measurementEntry).toContain('/measurement.json#/metrics/0')
            expect(call.args.dashboard).toMatchObject({
              metric: { id: 'retrieval-time', source: measurement().metrics[0]?.source },
            })
          }
          return {
            status: 'succeeded' as const,
            ref: `https://example.com/fixture/${calls.length}`,
            body: JSON.stringify({ draft: true, sent: false }),
          }
        },
      }
      expect(
        (await dispatchLaunchArtifact(workflow, start.subject, 'comms/pilot-note', host)).cached,
      ).toBe(false)
      expect(
        (await dispatchLaunchArtifact(workflow, start.subject, 'comms/pilot-note', host)).cached,
      ).toBe(true)
      await dispatchLaunchArtifact(workflow, start.subject, 'dashboards/retrieval-chart', host)
      expect(calls).toEqual(['comms.draft', 'dashboards.create'])
      expect(launchDeliveries(engine.store.events())).toHaveLength(2)
      expect(
        workflow.publication(start.subject).find((entry) => entry.key === 'comms/pilot-note')
          ?.status,
      ).toBe('succeeded')
      expect(engine.store.get(start.subject).links).toContain('https://example.com/fixture/1')
    }))

  it('retains ambiguous intents and rejects a result that does not establish an unsent draft', async () =>
    fixture(async ({ root, engine, workflow }) => {
      provider(root)
      const start = begun(workflow)
      workflow.complete(start.subject, draft(start.plan.source.digest))
      let calls = 0
      const host = {
        invoke: async () => {
          calls++
          return {
            status: 'succeeded' as const,
            ref: 'https://example.com/fixture',
            body: JSON.stringify({ draft: false, sent: true }),
          }
        },
      }
      await expect(
        dispatchLaunchArtifact(workflow, start.subject, 'comms/pilot-note', host),
      ).rejects.toThrow('unsent draft')
      await expect(
        dispatchLaunchArtifact(workflow, start.subject, 'comms/pilot-note', host),
      ).rejects.toThrow('ambiguous')
      expect(calls).toBe(1)
      expect(launchDeliveries(engine.store.events())[0]?.result).toBeUndefined()
    }))

  it.each(['send_message', 'chat.postMessage', 'mail.messages.send'])(
    'rejects an obvious sending tool mapping %s before execution',
    async (tool) =>
      fixture(({ root }) => {
        expect(() => validateProvider(provider(root, tool))).toThrow('draft-only')
      }),
  )

  it('executes compiled begin/complete/report without any sending interface', async () =>
    fixture(({ root, dir }) => {
      const env = {
        ...process.env,
        HOME: join(dir, 'home'),
        XDG_STATE_HOME: join(dir, 'cli-state'),
        XDG_CONFIG_HOME: join(dir, 'cli-config'),
      }
      const call = (...args: string[]) => {
        const result = spawnSync(process.execPath, [resolve('dist/wl.mjs'), ...args, '--json'], {
          cwd: root,
          env,
          encoding: 'utf8',
        })
        if (result.status !== 0) throw new Error(result.stdout + result.stderr)
        return JSON.parse(result.stdout)
      }
      const measurementFile = join(dir, 'measurement.json')
      writeFileSync(measurementFile, JSON.stringify(measurement()))
      const start = call(
        'launch',
        'begin',
        'Order search launch',
        '--owner',
        'Alex',
        '--measurement',
        measurementFile,
      )
      const draftFile = join(dir, 'draft.json')
      writeFileSync(draftFile, JSON.stringify(draft(start.plan.source.digest)))
      expect(
        call('launch', 'complete', '--for', start.subject, '--file', draftFile).publication,
      ).toHaveLength(7)
      expect(call('launch', 'complete', '--for', start.subject, '--file', draftFile).cached).toBe(
        true,
      )
      expect(
        call('launch', 'report', '--for', start.subject).publication.every(
          (entry: { sent: boolean }) => entry.sent === false,
        ),
      ).toBe(true)
      expect(call('launch', 'schema').draft.$id).toBe('wholeloop/launch-kit@1')
    }))
})

describe('launch dispatch plans through client MCP or the local handoff', () => {
  it('names the exact MCP call or the pending handoff and changes no state', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wholeloop-dispatch-cli-'))
    try {
      const root = join(dir, 'repo')
      mkdirSync(join(root, '.wholeloop'), { recursive: true })
      writeFileSync(
        join(root, '.wholeloop/config.yml'),
        'version: 1\nproviders:\n  dashboards: posthog\n',
      )
      const env = {
        ...process.env,
        XDG_STATE_HOME: join(dir, 'state-home'),
        XDG_CONFIG_HOME: join(dir, 'config-home'),
      }
      const engine = new FlowEngine(
        new StateStore(join(env.XDG_STATE_HOME, 'wholeloop')),
        root,
        join(env.XDG_CONFIG_HOME, 'wholeloop/config.yml'),
        join(dir, 'home'),
      )
      const workflow = new LaunchWorkflow(engine)
      const start = begun(workflow)
      workflow.complete(start.subject, draft(start.plan.source.digest))
      const inventory = join(dir, 'mcp.json')
      writeFileSync(
        inventory,
        JSON.stringify({
          schema: 'wholeloop/client-mcp@1',
          server: 'posthog',
          tools: [{ name: 'fixture_create', inputSchema: { type: 'object' } }],
          bindings: { 'dashboards.create': 'fixture_create' },
        }),
      )
      const cli = (...args: string[]) =>
        spawnSync(
          process.execPath,
          [resolve('dist/wl.mjs'), 'launch', 'dispatch', '--for', start.subject, ...args],
          { cwd: root, encoding: 'utf8', env },
        )
      const events = engine.store.events().length
      const mcp = cli('--key', 'dashboards/retrieval-chart', '--mcp', inventory, '--json')
      expect(mcp.status, mcp.stderr).toBe(0)
      const planned = JSON.parse(mcp.stdout)
      expect(planned).toMatchObject({
        schema: 'wholeloop/dashboard-dispatch@2',
        provider: 'posthog',
        status: 'planned',
        transport: 'mcp',
        server: 'posthog',
        tool: 'fixture_create',
        effects: 'not-performed',
        authentication: 'client-owned-unverified',
      })
      expect(planned.args.measurementEntry).toContain('/measurement.json#/metrics/0')
      expect(planned.args.dashboard).toMatchObject({ metric: { id: 'retrieval-time' } })
      const local = cli('--key', 'dashboards/retrieval-chart', '--json')
      expect(local.status, local.stderr).toBe(0)
      const handoff = JSON.parse(local.stdout)
      expect(handoff).toMatchObject({
        status: 'handoff',
        transport: 'native',
        tool: 'wholeloop.dashboard.handoff',
        effects: 'not-performed',
      })
      expect(handoff.args).toBeUndefined()
      expect(typeof handoff.handoff).toBe('string')
      for (const retired of [['--bridge', inventory], ['--live']])
        expect(cli('--key', 'dashboards/retrieval-chart', ...retired).status).toBe(4)
      expect(cli('--key', 'comms/pilot-note', '--json').status).toBe(4)
      expect(engine.store.events()).toHaveLength(events)
      expect(launchDeliveries(engine.store.events())).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
