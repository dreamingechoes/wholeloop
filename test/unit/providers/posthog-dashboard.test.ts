import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { FlowEngine } from '../../../src/flow/engine.js'
import type { LaunchDraft } from '../../../src/launch/contracts.js'
import type { MeasurementPlan } from '../../../src/launch/measurement.js'
import { measurementDigest } from '../../../src/launch/measurement.js'
import { dispatchLaunchArtifact, launchDeliveries } from '../../../src/launch/publish.js'
import { LaunchWorkflow } from '../../../src/launch/workflow.js'
import { dashboardBridge } from '../../../src/providers/dashboard-bridge.js'
import type { OperationCall } from '../../../src/providers/operations.js'
import {
  postHogDashboardConfig,
  postHogDashboardHost,
  postHogDashboardPlan,
} from '../../../src/providers/posthog-dashboard.js'
import { StateStore } from '../../../src/state/store.js'

function fixture(bodyOverride?: string) {
  const spec = {
    schema: 'wholeloop/launch-dashboard@1',
    title: 'Order errors',
    metricRef: 'items/scope-fixture/launches/run-fixture/measurement.json#/metrics/0',
    sourceRevision: 'agreed-revision',
    sourceDigest: 'a'.repeat(64),
    metric: {
      id: 'errors',
      name: 'Errors',
      unit: 'count',
      source: {
        provider: 'posthog',
        operation: 'source.product-analytics.query',
        query: 'select count() from events where {filters}',
      },
      baseline: { status: 'unknown', missing: 'Fixture only', who: 'Alex' },
      target: { operator: 'lte', value: 1 },
      window: { days: 30, timezone: 'UTC' },
    },
  }
  if (bodyOverride) Object.assign(spec, JSON.parse(bodyOverride))
  const body = bodyOverride ?? JSON.stringify(spec)
  const config = {
    schema: 'wholeloop/posthog-dashboard-bridge@1',
    provider: 'posthog',
    baseUrl: 'https://posthog.example/prefix/',
    tokenEnv: 'WL_FIXTURE_PH_KEY',
    organization: '11111111-2222-3333-4444-555555555555',
    project: '42',
    queryLanguage: 'hogql',
    artifactDigest: measurementDigest(body),
  }
  const call: OperationCall = {
    provider: 'posthog',
    operation: 'dashboards.create',
    tool: 'wholeloop.dashboard.handoff',
    args: { title: spec.title, body, measurementEntry: spec.metricRef, dashboard: spec },
    guidance: '',
  }
  const plan = postHogDashboardPlan(config, call)
  const project = {
    id: 42,
    organization: config.organization,
    timezone: 'UTC',
    api_token: 'fixture-only-noncredential',
  }
  const created = {
    id: 17,
    team_id: 42,
    deleted: false,
    name: spec.title,
    description: plan.dashboard.body.description,
  }
  const insight = {
    id: 18,
    deleted: false,
    name: 'Errors',
    description: plan.insight.body.description,
    query: structuredClone(plan.insight.body.query),
    dashboard_tiles: [{ id: 19, dashboard_id: 17, deleted: false }],
  }
  const dashboard = {
    ...created,
    is_shared: false,
    filters: {},
    variables: {},
    tiles: [{ id: 19, insight: structuredClone(insight) }],
  }
  const requests: {
    url: string
    method: string
    body: unknown
    signal: AbortSignal | null | undefined
  }[] = []
  const values: unknown[] = [project, created, insight, insight, dashboard]
  const fetch: typeof globalThis.fetch = async (url, init) => {
    expect(init).toMatchObject({
      redirect: 'error',
      credentials: 'omit',
      headers: { Authorization: 'Bearer fixture-only-noncredential', Accept: 'application/json' },
    })
    requests.push({
      url: String(url),
      method: init?.method ?? '',
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      signal: init?.signal,
    })
    return new Response(JSON.stringify(values[requests.length - 1]), {
      status: init?.method === 'POST' ? 201 : 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return { spec, config, call, plan, project, created, insight, dashboard, requests, values, fetch }
}

describe('PostHog explicit dashboard and insight bridge', () => {
  it('previews project timezone check and exact source/window without resolving credentials', () => {
    const { config, call, plan, spec } = fixture()
    expect(postHogDashboardConfig(config)).toEqual(config)
    expect(dashboardBridge(config).plan(call)).toEqual(plan)
    expect(plan.projectCheck).toMatchObject({
      method: 'GET',
      timezone: 'UTC',
      url: `${config.baseUrl}api/organizations/${config.organization}/projects/42/`,
    })
    expect(plan.insight.body.query.source.query).toBe(spec.metric.source.query)
    expect(plan.insight.body.query.source.filters.dateRange).toEqual({
      date_from: '-30d',
      date_to: null,
      explicitDate: true,
    })
    expect(plan.insight.body.query.display).toBe('ActionsTable')
    expect(plan.effects).toBe('not-performed')
    expect(JSON.stringify(plan)).not.toMatch(/api_token|fixture-only-noncredential|dashboards":\[/)
  })
  it.each([
    'secret',
    'organization',
    'project',
    'language',
    'digest',
    'http',
    'source',
    'operation',
    'placeholder',
    'timezone',
    'extra-argument',
    'artifact',
  ])('rejects %s before any secret or request', async (kind) => {
    const { config, call, spec } = fixture(),
      input: Record<string, unknown> = { ...config }
    if (kind === 'secret') input.token = 'fixture-only-noncredential'
    if (kind === 'organization') input.organization = '../other'
    if (kind === 'project') input.project = 'store'
    if (kind === 'language') input.queryLanguage = 'sql'
    if (kind === 'digest') input.artifactDigest = 'b'.repeat(64)
    if (kind === 'http') input.baseUrl = 'http://posthog.example/'
    if (kind === 'source') spec.metric.source.provider = 'grafana'
    if (kind === 'operation') spec.metric.source.operation = 'source.observability.query'
    if (kind === 'placeholder') spec.metric.source.query = 'select count() from events'
    if (kind === 'timezone') spec.metric.window.timezone = 'Invalid/Nowhere'
    if (kind === 'extra-argument') call.args.send = true
    if (kind === 'artifact') call.args.body = '{}'
    if (['source', 'operation', 'placeholder', 'timezone'].includes(kind)) {
      call.args.body = JSON.stringify(spec)
      input.artifactDigest = measurementDigest(call.args.body)
    }
    const secret = vi.fn(),
      fetch = vi.fn()
    await expect(async () =>
      postHogDashboardHost(input, { secret, fetch }).invoke(call),
    ).rejects.toThrow()
    expect(secret).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('creates only new resources and verifies exact query, project, active attachment and dashboard', async () => {
    const t = fixture(),
      result = await postHogDashboardHost(t.config, {
        secret: () => 'fixture-only-noncredential',
        fetch: t.fetch,
      }).invoke(t.call)
    expect(result).toMatchObject({
      status: 'succeeded',
      complete: true,
      ref: 'https://posthog.example/prefix/project/42/dashboard/17',
    })
    expect(JSON.parse(result.body ?? '')).toMatchObject({
      createdRemotely: true,
      dashboardId: 17,
      insightId: 18,
      trafficObserved: false,
      queryVerified: false,
    })
    expect(t.requests.map((r) => r.method)).toEqual(['GET', 'POST', 'POST', 'GET', 'GET'])
    expect(t.requests[2]?.body).toEqual({ ...t.plan.insight.body, dashboards: [17] })
    expect(t.requests[3]?.url).toBe(`${t.config.baseUrl}api/projects/42/insights/18/`)
    expect(t.requests[4]?.url).toBe(`${t.config.baseUrl}api/projects/42/dashboards/17/`)
    expect(new Set(t.requests.map((r) => r.signal)).size).toBe(1)
    expect(JSON.stringify(result)).not.toMatch(
      /fixture-only-noncredential|api_token|select count|description/,
    )
  })
  it('accepts explicit absent override values without weakening persisted-filter checks', async () => {
    const t = fixture()
    Object.assign(t.dashboard, {
      variables: null,
      persisted_filters: null,
      persisted_variables: null,
    })
    expect(
      await postHogDashboardHost(t.config, {
        secret: () => 'fixture-only-noncredential',
        fetch: t.fetch,
      }).invoke(t.call),
    ).toMatchObject({ status: 'succeeded' })
    Object.assign(t.dashboard, { persisted_filters: { date_from: '-1d' } })
    t.requests.length = 0
    expect(
      await postHogDashboardHost(t.config, {
        secret: () => 'fixture-only-noncredential',
        fetch: t.fetch,
      }).invoke(t.call),
    ).toMatchObject({ status: 'pending' })
  })
  it.each([
    'project-id',
    'project-organization',
    'project-timezone',
    'project-failure',
    'create-unknown-id',
  ])('refuses %s with no invented remote receipt', async (kind) => {
    const t = fixture()
    if (kind === 'project-id') t.project.id = 43
    if (kind === 'project-organization') t.project.organization = 'other'
    if (kind === 'project-timezone') t.project.timezone = 'Europe/Madrid'
    if (kind === 'project-failure') t.values[0] = null
    if (kind === 'create-unknown-id') t.values[1] = { id: null }
    await expect(
      postHogDashboardHost(t.config, {
        secret: () => 'fixture-only-noncredential',
        fetch: t.fetch,
      }).invoke(t.call),
    ).rejects.toThrow(/diagnostics omitted/)
    expect(t.requests).toHaveLength(kind === 'create-unknown-id' ? 2 : 1)
  })
  it.each([
    'create-project',
    'insight-create',
    'insight-query',
    'insight-id',
    'insight-deleted',
    'insight-name',
    'tile-deleted',
    'tile-dashboard',
    'tile-duplicate',
    'dashboard-shared',
    'dashboard-project',
    'dashboard-name',
    'dashboard-description',
    'dashboard-filters',
    'dashboard-variables',
    'dashboard-tiles',
    'dashboard-tile-id',
    'dashboard-tile-query',
  ])('retains a safe pending dashboard reference after %s without retry', async (kind) => {
    const t = fixture()
    if (kind === 'create-project') t.created.team_id = 43
    if (kind === 'insight-create') t.values[2] = null
    if (kind === 'insight-query') t.insight.query.source.query = 'select 0'
    if (kind === 'insight-id') t.values[3] = { ...t.insight, id: 20 }
    if (kind === 'insight-deleted') t.insight.deleted = true
    if (kind === 'insight-name') t.insight.name = 'other'
    const tile = t.insight.dashboard_tiles[0],
      attached = t.dashboard.tiles[0]
    if (!tile || !attached) throw new Error('Missing synthetic attachment')
    if (kind === 'tile-deleted') tile.deleted = true
    if (kind === 'tile-dashboard') tile.dashboard_id = 43
    if (kind === 'tile-duplicate') t.insight.dashboard_tiles.push({ ...tile })
    if (kind === 'dashboard-shared') t.dashboard.is_shared = true
    if (kind === 'dashboard-project') t.dashboard.team_id = 43
    if (kind === 'dashboard-name') t.dashboard.name = 'other'
    if (kind === 'dashboard-description') t.dashboard.description = 'other'
    if (kind === 'dashboard-filters') t.dashboard.filters = { date_from: '-1d' }
    if (kind === 'dashboard-variables') t.dashboard.variables = { override: true }
    if (kind === 'dashboard-tiles') t.dashboard.tiles = []
    if (kind === 'dashboard-tile-id') attached.id = 20
    if (kind === 'dashboard-tile-query') attached.insight.query.source.query = 'select 0'
    const result = await postHogDashboardHost(t.config, {
      secret: () => 'fixture-only-noncredential',
      fetch: t.fetch,
    }).invoke(t.call)
    expect(result).toMatchObject({
      status: 'pending',
      complete: false,
      ref: 'https://posthog.example/prefix/project/42/dashboard/17',
    })
    expect(JSON.parse(result.body ?? '')).toMatchObject({
      manualInspectionRequired: true,
      automaticRetry: false,
      dashboardId: 17,
    })
    expect(t.requests.length).toBeLessThanOrEqual(5)
    expect(t.requests.filter((r) => r.method === 'POST').length).toBeLessThanOrEqual(2)
  })
  it('preserves a known dashboard after a lost insight response without exposing the error', async () => {
    const t = fixture()
    const result = await postHogDashboardHost(t.config, {
      secret: () => 'fixture-only-noncredential',
      fetch: async (url, init) => {
        if (t.requests.length === 2)
          throw new Error('private raw failure fixture-only-noncredential')
        return t.fetch(url, init)
      },
    }).invoke(t.call)
    expect(result.status).toBe('pending')
    expect(JSON.stringify(result)).not.toMatch(/private|fixture-only-noncredential/)
    expect(JSON.parse(result.body ?? '').phase).toBe('insight-create')
  })
})

it.each([false, true])(
  'binds actual launch dispatch and compiled preview; partial=%s stays cached',
  async (partial) => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-posthog-dispatch-'))),
      root = join(dir, 'repo')
    mkdirSync(join(root, '.wholeloop'), { recursive: true })
    writeFileSync(
      join(root, '.wholeloop/config.yml'),
      'version: 1\nproviders:\n  dashboards: posthog\n',
    )
    const engine = new FlowEngine(
      new StateStore(join(dir, 'state', 'wholeloop')),
      root,
      join(dir, 'config/config.yml'),
      join(dir, 'home'),
    )
    const workflow = new LaunchWorkflow(engine)
    try {
      const metric = fixture().spec.metric
      const measurement: MeasurementPlan = {
        schema: 'wholeloop/measurement-plan@1',
        impact: 'Observe order errors',
        metrics: [metric as MeasurementPlan['metrics'][number]],
        rollout: {
          strategy: 'flagged',
          flag: 'orders',
          rollback: 'Person owns rollback.',
          stages: [
            { name: 'pilot', audience: 'reviewers', exposure: 10, exit: 'Review errors' },
            { name: 'general', audience: 'customers', exposure: 100, exit: 'Review errors' },
          ],
        },
      }
      const begun = workflow.begin({ input: 'Order release', owner: 'Alex', measurement })
      if (begun.status !== 'planned') throw new Error('Missing synthetic launch plan')
      const kit: LaunchDraft = {
        schema: 'wholeloop/launch-kit@1',
        sourceDigest: begun.plan.source.digest,
        rolloutPlan: 'Review pilot then general.',
        comms: [
          { key: 'pilot', audience: 'Reviewers', stage: 'pilot', body: 'Draft only.' },
          { key: 'general', audience: 'Customers', stage: 'general', body: 'Draft only.' },
        ],
        dashboards: [{ key: 'orders', metric: 'errors', title: 'Order errors' }],
        enablement: {
          supportGuide: 'Check errors.',
          onePager: 'Order release.',
          runbook: 'Person owns rollback.',
        },
      }
      workflow.complete(begun.subject, kit)
      const target = workflow.publication(begun.subject).find((t) => t.key === 'dashboards/orders')
      if (!target) throw new Error('Missing synthetic dashboard artifact')
      const t = fixture(target.body),
        bridge = join(dir, 'bridge.json')
      writeFileSync(bridge, JSON.stringify(t.config))
      const before = engine.store.events()
      const preview = spawnSync(
        process.execPath,
        [
          resolve('dist/wl.mjs'),
          'launch',
          'dispatch',
          '--for',
          begun.subject,
          '--key',
          target.key,
          '--bridge',
          bridge,
          '--json',
        ],
        {
          cwd: root,
          encoding: 'utf8',
          env: {
            ...process.env,
            HOME: join(dir, 'home'),
            XDG_STATE_HOME: join(dir, 'state'),
            XDG_CONFIG_HOME: join(dir, 'config'),
            WL_WORKSPACE: '',
            [t.config.tokenEnv]: '',
          },
        },
      )
      expect(preview.status, preview.stderr || preview.stdout).toBe(0)
      expect(JSON.parse(preview.stdout)).toMatchObject({
        status: 'planned',
        effects: 'not-performed',
        plan: { provider: 'posthog' },
      })
      expect(engine.store.events()).toEqual(before)
      if (partial) t.values[2] = null
      const host = postHogDashboardHost(t.config, {
        secret: () => 'fixture-only-noncredential',
        fetch: t.fetch,
      })
      expect(await dispatchLaunchArtifact(workflow, begun.subject, target.key, host)).toMatchObject(
        { cached: false, result: { status: partial ? 'pending' : 'succeeded' } },
      )
      const calls = t.requests.length
      expect(await dispatchLaunchArtifact(workflow, begun.subject, target.key, host)).toMatchObject(
        { cached: true, result: { status: partial ? 'pending' : 'succeeded' } },
      )
      expect(t.requests).toHaveLength(calls)
      expect(launchDeliveries(engine.store.events())[0]?.result?.ref).toBe(
        `${t.config.baseUrl}project/42/dashboard/17`,
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  },
)
