import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { FlowEngine } from '../../../src/flow/engine.js'
import type { LaunchDraft } from '../../../src/launch/contracts.js'
import { type MeasurementPlan, measurementDigest } from '../../../src/launch/measurement.js'
import { dispatchLaunchArtifact } from '../../../src/launch/publish.js'
import { LaunchWorkflow } from '../../../src/launch/workflow.js'
import { dashboardBridge } from '../../../src/providers/dashboard-bridge.js'
import { withDashboardHttp } from '../../../src/providers/dashboard-http.js'
import {
  mixpanelDashboardConfig,
  mixpanelDashboardHost,
  mixpanelDashboardPlan,
} from '../../../src/providers/mixpanel-dashboard.js'
import type { OperationCall } from '../../../src/providers/operations.js'
import { StateStore } from '../../../src/state/store.js'

function fixture(bodyOverride?: string) {
  const spec = {
    schema: 'wholeloop/launch-dashboard@1',
    title: 'Order errors',
    metricRef: 'items/scope-fixture/launches/run-fixture/measurement.json#/metrics/0',
    sourceRevision: 'fixture-revision',
    sourceDigest: 'a'.repeat(64),
    metric: {
      id: 'errors',
      name: 'Errors',
      unit: 'count',
      source: {
        provider: 'mixpanel',
        operation: 'source.product-analytics.query',
        query: JSON.stringify({ type: 'insights', params: { event: ['order_error'] } }),
      },
      baseline: { status: 'unknown', missing: 'Fixture only', who: 'Alex' },
      target: { operator: 'lte', value: 1 },
      window: { days: 30, timezone: 'UTC' },
    },
  }
  if (bodyOverride) Object.assign(spec, JSON.parse(bodyOverride))
  const body = bodyOverride ?? JSON.stringify(spec)
  const config = {
    schema: 'wholeloop/mixpanel-dashboard-bridge@1',
    provider: 'mixpanel',
    baseUrl: 'https://eu.mixpanel.com/',
    tokenEnv: 'WL_FIXTURE_MP_KEY',
    project: 42,
    workspace: 7,
    queryLanguage: 'native-report-json',
    windowBinding: 'reviewed-in-native-params',
    artifactDigest: measurementDigest(body),
  }
  const call: OperationCall = {
    provider: 'mixpanel',
    operation: 'dashboards.create',
    tool: 'wholeloop.dashboard.handoff',
    args: { title: spec.title, body, measurementEntry: spec.metricRef, dashboard: spec },
    guidance: '',
  }
  const plan = mixpanelDashboardPlan(config, call)
  const workspace = { id: 7, project_id: 42, is_visible: true }
  const created = { id: 17, title: spec.title }
  const report = {
    id: 18,
    ...plan.report.body,
    project_id: 42,
    dashboard_id: 17,
    include_in_dashboard: true,
  }
  const dashboard = {
    ...plan.dashboard.body,
    id: 17,
    is_shared_with_project: false,
    num_active_public_links: 0,
    creator_email: 'private@example.com',
  }
  const values: unknown[] = [[workspace], created, report, report, [17], dashboard],
    requests: {
      url: string
      method: string
      body: unknown
      signal: AbortSignal | null | undefined
    }[] = []
  const fetch: typeof globalThis.fetch = async (url, init) => {
    expect(init).toMatchObject({
      redirect: 'error',
      credentials: 'omit',
      headers: { Authorization: 'Bearer fixture-only-noncredential', Accept: 'application/json' },
    })
    expect(init?.headers).not.toHaveProperty('X-API-Key')
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
  return {
    spec,
    config,
    call,
    plan,
    workspace,
    created,
    report,
    dashboard,
    values,
    requests,
    fetch,
  }
}

describe('Mixpanel explicit workspace and owned native report', () => {
  it('previews exact native params and unverified owner-reviewed window for each official region', () => {
    const t = fixture()
    expect(mixpanelDashboardConfig(t.config)).toEqual(t.config)
    expect(dashboardBridge(t.config).plan(t.call)).toEqual(t.plan)
    for (const baseUrl of [
      'https://mixpanel.com/',
      'https://eu.mixpanel.com/',
      'https://in.mixpanel.com/',
    ]) {
      const plan = mixpanelDashboardPlan({ ...t.config, baseUrl }, t.call)
      expect(plan.workspaceCheck.url).toBe(`${baseUrl}api/app/projects/42/workspaces/public`)
      expect(plan.dashboard.url).toBe(`${baseUrl}api/app/workspaces/7/dashboards`)
      expect(plan.report.body.params).toEqual(JSON.parse(t.spec.metric.source.query).params)
      expect(plan.window).toMatchObject({
        days: 30,
        timezone: 'UTC',
        verified: false,
        basis: 'reviewed-in-native-params',
      })
      expect(plan.effects).toBe('not-performed')
    }
  })
  it.each([
    'secret',
    'foreign-origin',
    'project',
    'workspace',
    'language',
    'window-binding',
    'digest',
    'provider',
    'operation',
    'invalid-json',
    'report-type',
    'empty-params',
    'extra-payload',
    'timezone',
    'extra-argument',
  ])('rejects %s before credentials or HTTP', async (kind) => {
    const t = fixture(),
      config: Record<string, unknown> = { ...t.config }
    if (kind === 'secret') config.token = 'fixture-only-noncredential'
    if (kind === 'foreign-origin') config.baseUrl = 'https://other.example/'
    if (kind === 'project') config.project = 0
    if (kind === 'workspace') config.workspace = 1.5
    if (kind === 'language') config.queryLanguage = 'sql'
    if (kind === 'window-binding') delete config.windowBinding
    if (kind === 'digest') config.artifactDigest = 'b'.repeat(64)
    if (kind === 'provider') t.spec.metric.source.provider = 'other'
    if (kind === 'operation') t.spec.metric.source.operation = 'source.bi.query'
    if (kind === 'invalid-json') t.spec.metric.source.query = 'not a native report'
    if (kind === 'report-type')
      t.spec.metric.source.query = JSON.stringify({
        type: 'funnels',
        params: { event: ['order_error'] },
      })
    if (kind === 'empty-params')
      t.spec.metric.source.query = JSON.stringify({ type: 'insights', params: {} })
    if (kind === 'extra-payload')
      t.spec.metric.source.query = JSON.stringify({
        type: 'insights',
        params: { event: ['order_error'] },
        overwrite: true,
      })
    if (kind === 'timezone') t.spec.metric.window.timezone = 'Invalid/Nowhere'
    if (kind === 'extra-argument') t.call.args.overwrite = true
    if (
      [
        'provider',
        'operation',
        'invalid-json',
        'report-type',
        'empty-params',
        'extra-payload',
        'timezone',
      ].includes(kind)
    ) {
      t.call.args.body = JSON.stringify(t.spec)
      config.artifactDigest = measurementDigest(t.call.args.body)
    }
    const secret = vi.fn(),
      fetch = vi.fn()
    await expect(async () =>
      mixpanelDashboardHost(config, { secret, fetch }).invoke(t.call),
    ).rejects.toThrow()
    expect(secret).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('creates private dashboard and owned report, then verifies exact params and dedicated attachment', async () => {
    const t = fixture()
    const result = await mixpanelDashboardHost(t.config, {
      authentication: 'api-key',
      secret: () => 'fixture-only-noncredential',
      fetch: t.fetch,
    }).invoke(t.call)
    expect(result).toMatchObject({
      status: 'succeeded',
      complete: true,
      ref: `${t.config.baseUrl}api/app/workspaces/7/dashboards/17`,
    })
    expect(JSON.parse(result.body ?? '')).toMatchObject({
      createdRemotely: true,
      reportId: 18,
      windowVerified: false,
      queryVerified: false,
      trafficObserved: false,
    })
    expect(t.requests.map((r) => r.method)).toEqual(['GET', 'POST', 'POST', 'GET', 'GET', 'GET'])
    expect(t.requests[2]?.body).toEqual({ ...t.plan.report.body, dashboard_id: 17 })
    expect(t.requests[3]?.url).toBe(`${t.config.baseUrl}api/app/workspaces/7/bookmarks/18?v=2`)
    expect(t.requests[4]?.url).toBe(
      `${t.config.baseUrl}api/app/workspaces/7/dashboards/bookmarks/18/dashboard-ids`,
    )
    expect(new Set(t.requests.map((r) => r.signal)).size).toBe(1)
    expect(JSON.stringify(result)).not.toMatch(
      /private@example|creator|fixture-only-noncredential|order_error/,
    )
  })
  it('unwraps only the documented direct/nested results envelopes', async () => {
    const t = fixture()
    t.values = t.values.map((value) => ({ results: { results: value } }))
    let index = 0
    const result = await mixpanelDashboardHost(t.config, {
      secret: () => 'fixture-only-noncredential',
      fetch: async () =>
        new Response(JSON.stringify(t.values[index++]), {
          headers: { 'Content-Type': 'application/json' },
        }),
    }).invoke(t.call)
    expect(result.status).toBe('succeeded')
    expect(index).toBe(6)
  })
  it.each([
    'missing-workspace',
    'wrong-project',
    'duplicate-workspace',
    'hidden-workspace',
    'pagination',
    'mixed-envelope',
    'create-unknown',
  ])('refuses %s without inventing a dashboard observation', async (kind) => {
    const t = fixture()
    if (kind === 'missing-workspace') t.values[0] = []
    if (kind === 'wrong-project') t.workspace.project_id = 43
    if (kind === 'duplicate-workspace') t.values[0] = [t.workspace, t.workspace]
    if (kind === 'hidden-workspace') t.workspace.is_visible = false
    if (kind === 'pagination')
      t.values[0] = { results: [t.workspace], next: 'https://foreign.example/private' }
    if (kind === 'mixed-envelope') t.values[0] = { id: 1, results: [t.workspace] }
    if (kind === 'create-unknown') t.values[1] = { id: null }
    await expect(
      mixpanelDashboardHost(t.config, {
        secret: () => 'fixture-only-noncredential',
        fetch: t.fetch,
      }).invoke(t.call),
    ).rejects.toThrow(/diagnostics omitted/)
    expect(t.requests).toHaveLength(kind === 'create-unknown' ? 2 : 1)
  })
  it.each([
    'dashboard-title',
    'report-create',
    'report-id',
    'report-project',
    'report-owner',
    'report-visibility',
    'report-title',
    'report-type',
    'report-description',
    'report-params',
    'missing-link',
    'duplicate-link',
    'wrong-link',
    'dashboard-description',
    'dashboard-private',
    'dashboard-restricted',
    'dashboard-shared',
    'public-link',
    'filters',
    'breakdowns',
    'time-filter',
  ])('retains a pending inspection reference after %s with no retry', async (kind) => {
    const t = fixture()
    if (kind === 'dashboard-title') t.created.title = 'other'
    if (kind === 'report-create') t.values[2] = null
    if (kind === 'report-id') t.values[3] = { ...t.report, id: 20 }
    if (kind === 'report-project') t.report.project_id = 43
    if (kind === 'report-owner') t.report.dashboard_id = 43
    if (kind === 'report-visibility') t.report.include_in_dashboard = false
    if (kind === 'report-title') t.report.name = 'other'
    if (kind === 'report-type') t.report.type = 'funnels'
    if (kind === 'report-description') t.report.description = 'other'
    if (kind === 'report-params') t.report.params = { event: ['different'] }
    if (kind === 'missing-link') t.values[4] = []
    if (kind === 'duplicate-link') t.values[4] = [17, 17]
    if (kind === 'wrong-link') t.values[4] = [43]
    if (kind === 'dashboard-description') t.dashboard.description = 'other'
    if (kind === 'dashboard-private') t.dashboard.is_private = false
    if (kind === 'dashboard-restricted') t.dashboard.is_restricted = false
    if (kind === 'dashboard-shared') t.dashboard.is_shared_with_project = true
    if (kind === 'public-link') t.dashboard.num_active_public_links = 1
    if (kind === 'filters') Object.assign(t.dashboard, { filters: [{}] })
    if (kind === 'breakdowns') Object.assign(t.dashboard, { breakdowns: [{}] })
    if (kind === 'time-filter') Object.assign(t.dashboard, { time_filter: { days: 7 } })
    const result = await mixpanelDashboardHost(t.config, {
      secret: () => 'fixture-only-noncredential',
      fetch: t.fetch,
    }).invoke(t.call)
    expect(result).toMatchObject({
      status: 'pending',
      complete: false,
      ref: `${t.config.baseUrl}api/app/workspaces/7/dashboards/17`,
    })
    expect(JSON.parse(result.body ?? '')).toMatchObject({
      dashboardId: 17,
      manualInspectionRequired: true,
      automaticRetry: false,
    })
    expect(t.requests.length).toBeLessThanOrEqual(6)
    expect(t.requests.filter((r) => r.method === 'POST').length).toBeLessThanOrEqual(2)
  })
  it.each([false, true])(
    'restricts v2 reads and preserves cancellation identity; known=%s',
    async (known) => {
      const t = fixture(),
        fetch = vi.fn()
      await expect(
        withDashboardHttp(
          t.config,
          { readQuery: 'mixpanel-v2', secret: () => 'fixture-only-noncredential', fetch },
          (request) => request('api/app/workspaces/7/bookmarks/18?v=2', { overwrite: true }),
        ),
      ).rejects.toThrow()
      expect(fetch).not.toHaveBeenCalled()
      const controller = new AbortController()
      const pending = mixpanelDashboardHost(t.config, {
        signal: controller.signal,
        secret: () => 'fixture-only-noncredential',
        fetch: async (url, init) => {
          if (known && t.requests.length === 2) {
            controller.abort()
            throw new Error('Synthetic cancellation after known dashboard')
          }
          const response = await t.fetch(url, init)
          if (!known && t.requests.length === 2) controller.abort()
          return response
        },
      }).invoke(t.call)
      // Cancellation before the completed POST body can be consumed leaves unknown creation intent.
      if (known) expect(await pending).toMatchObject({ status: 'pending', complete: false })
      else await expect(pending).rejects.toThrow(/retained launch intent/)
    },
  )
})

it.each([false, true])(
  'compiled Mixpanel preview preserves state and complete/partial=%s caches delivery',
  async (partial) => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-mixpanel-dispatch-'))),
      root = join(dir, 'repo')
    mkdirSync(join(root, '.wholeloop'), { recursive: true })
    writeFileSync(
      join(root, '.wholeloop/config.yml'),
      'version: 1\nproviders:\n  dashboards: mixpanel\n',
    )
    const engine = new FlowEngine(
        new StateStore(join(dir, 'state/wholeloop')),
        root,
        join(dir, 'config/config.yml'),
        join(dir, 'home'),
      ),
      workflow = new LaunchWorkflow(engine)
    try {
      const metric = fixture().spec.metric
      const measurement: MeasurementPlan = {
        schema: 'wholeloop/measurement-plan@1',
        impact: 'Observe errors',
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
      if (begun.status !== 'planned') throw new Error('Missing synthetic plan')
      const kit: LaunchDraft = {
        schema: 'wholeloop/launch-kit@1',
        sourceDigest: begun.plan.source.digest,
        rolloutPlan: 'Pilot then general.',
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
      if (!target) throw new Error('Missing artifact')
      const t = fixture(target.body),
        file = join(dir, 'bridge.json')
      writeFileSync(file, JSON.stringify(t.config))
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
          file,
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
        plan: { provider: 'mixpanel', workspaceCheck: { workspace: 7 } },
      })
      expect(engine.store.events()).toEqual(before)
      if (partial) t.values[2] = null
      const host = mixpanelDashboardHost(t.config, {
        secret: () => 'fixture-only-noncredential',
        fetch: t.fetch,
      })
      expect(await dispatchLaunchArtifact(workflow, begun.subject, target.key, host)).toMatchObject(
        { cached: false, result: { status: partial ? 'pending' : 'succeeded' } },
      )
      const count = t.requests.length
      expect(await dispatchLaunchArtifact(workflow, begun.subject, target.key, host)).toMatchObject(
        { cached: true },
      )
      expect(t.requests).toHaveLength(count)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  },
)
