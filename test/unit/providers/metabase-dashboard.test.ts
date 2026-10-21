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
  metabaseDashboardConfig,
  metabaseDashboardHost,
  metabaseDashboardPlan,
} from '../../../src/providers/metabase-dashboard.js'
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
        provider: 'metabase',
        operation: 'source.bi.query',
        query:
          "select count(*) from order_errors where occurred_at >= (current_timestamp at time zone 'UTC') - interval '30 days'",
      },
      baseline: { status: 'unknown', missing: 'Fixture only', who: 'Alex' },
      target: { operator: 'lte', value: 1 },
      window: { days: 30, timezone: 'UTC' },
    },
  }
  if (bodyOverride) Object.assign(spec, JSON.parse(bodyOverride))
  const body = bodyOverride ?? JSON.stringify(spec)
  const config = {
    schema: 'wholeloop/metabase-dashboard-bridge@1',
    provider: 'metabase',
    baseUrl: 'https://metabase.example/prefix/',
    tokenEnv: 'WL_FIXTURE_MB_KEY',
    database: 2,
    collection: 3,
    queryLanguage: 'native-sql',
    windowBinding: 'reviewed-in-native-sql',
    artifactDigest: measurementDigest(body),
  }
  const call: OperationCall = {
    provider: 'metabase',
    operation: 'dashboards.create',
    tool: 'wholeloop.dashboard.handoff',
    args: { title: spec.title, body, measurementEntry: spec.metricRef, dashboard: spec },
    guidance: '',
  }
  const plan = metabaseDashboardPlan(config, call)
  const created = { id: 17, name: spec.title, collection_id: 3, archived: false }
  const card = { id: 18, ...plan.card.body, dashboard_id: 17, archived: false }
  const attached = {
    id: 19,
    dashboard_id: 17,
    card_id: 18,
    parameter_mappings: [],
    series: [],
    visualization_settings: {},
  }
  const dashboard = {
    ...created,
    description: plan.dashboard.body.description,
    public_uuid: null,
    enable_embedding: false,
    parameters: [],
    dashcards: [attached],
  }
  const requests: { url: string; method: string; body: unknown }[] = [],
    values: unknown[] = [created, card, card, dashboard]
  const fetch: typeof globalThis.fetch = async (url, init) => {
    expect(init?.headers).toMatchObject({
      'X-API-Key': 'fixture-only-noncredential',
      Accept: 'application/json',
    })
    expect(init?.headers).not.toHaveProperty('Authorization')
    expect(init).toMatchObject({ redirect: 'error', credentials: 'omit' })
    requests.push({
      url: String(url),
      method: init?.method ?? '',
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    })
    return new Response(JSON.stringify(values[requests.length - 1]), {
      status: init?.method === 'POST' ? 201 : 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return { spec, config, call, plan, created, card, attached, dashboard, requests, values, fetch }
}

describe('Metabase metric-pinned dashboard-owned questions', () => {
  it('previews original SQL, database, collection and explicit unverified window semantics', () => {
    const t = fixture()
    expect(metabaseDashboardConfig(t.config)).toEqual(t.config)
    expect(dashboardBridge(t.config).plan(t.call)).toEqual(t.plan)
    expect(t.plan.card.body.dataset_query.native.query).toBe(t.spec.metric.source.query)
    expect(t.plan.dashboard.body.collection_id).toBe(3)
    expect(t.plan.window).toEqual({
      days: 30,
      timezone: 'UTC',
      basis: 'reviewed-in-native-sql',
      verified: false,
    })
    expect(t.plan.effects).toBe('not-performed')
    expect(JSON.stringify(t.plan)).not.toMatch(/fixture-only-noncredential|Authorization|X-API-Key/)
  })
  it.each([
    'secret',
    'http',
    'database',
    'collection',
    'language',
    'window-binding',
    'digest',
    'provider',
    'operation',
    'query',
    'multiple-statements',
    'comments',
    'templates',
    'timezone',
    'extra-argument',
  ])('refuses %s before credentials and transport', async (kind) => {
    const t = fixture(),
      config: Record<string, unknown> = { ...t.config }
    if (kind === 'secret') config.token = 'fixture-only-noncredential'
    if (kind === 'http') config.baseUrl = 'http://metabase.example/'
    if (kind === 'database') config.database = 1.5
    if (kind === 'collection') config.collection = 0
    if (kind === 'language') config.queryLanguage = 'hogql'
    if (kind === 'window-binding') delete config.windowBinding
    if (kind === 'digest') config.artifactDigest = 'b'.repeat(64)
    if (kind === 'provider') t.spec.metric.source.provider = 'other'
    if (kind === 'operation') t.spec.metric.source.operation = 'source.product-analytics.query'
    if (kind === 'query') t.spec.metric.source.query = 'delete from orders'
    if (kind === 'multiple-statements') t.spec.metric.source.query = 'select 1; delete from orders'
    if (kind === 'comments') t.spec.metric.source.query = 'select 1 /* unreviewed */'
    if (kind === 'templates') t.spec.metric.source.query = 'select {{override}}'
    if (kind === 'timezone') t.spec.metric.window.timezone = 'Invalid/Nowhere'
    if (kind === 'extra-argument') t.call.args.overwrite = true
    if (
      [
        'provider',
        'operation',
        'query',
        'multiple-statements',
        'comments',
        'templates',
        'timezone',
      ].includes(kind)
    ) {
      t.call.args.body = JSON.stringify(t.spec)
      config.artifactDigest = measurementDigest(t.call.args.body)
    }
    const secret = vi.fn(),
      fetch = vi.fn()
    await expect(async () =>
      metabaseDashboardHost(config, { secret, fetch }).invoke(t.call),
    ).rejects.toThrow()
    expect(secret).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('creates a new dashboard-owned card without PUT and reads the documented classic query shape', async () => {
    const t = fixture(),
      result = await metabaseDashboardHost(t.config, {
        secret: () => 'fixture-only-noncredential',
        fetch: t.fetch,
      }).invoke(t.call)
    expect(result).toMatchObject({
      status: 'succeeded',
      complete: true,
      ref: `${t.config.baseUrl}dashboard/17`,
    })
    expect(JSON.parse(result.body ?? '')).toMatchObject({
      createdRemotely: true,
      cardId: 18,
      windowVerified: false,
      queryVerified: false,
      trafficObserved: false,
    })
    expect(t.requests.map((r) => r.method)).toEqual(['POST', 'POST', 'GET', 'GET'])
    expect(t.requests[1]?.body).toEqual({ ...t.plan.card.body, dashboard_id: 17 })
    expect(t.requests[2]?.url).toBe(`${t.config.baseUrl}api/card/18?legacy-mbql=true`)
    expect(JSON.stringify(result)).not.toMatch(
      /fixture-only-noncredential|select count|native|description/,
    )
  })
  it.each(['create-id', 'create-failure'])(
    'retains ambiguous intent for %s without inventing a remote reference',
    async (kind) => {
      const t = fixture()
      t.values[0] = kind === 'create-id' ? { id: null } : null
      await expect(
        metabaseDashboardHost(t.config, {
          secret: () => 'fixture-only-noncredential',
          fetch: t.fetch,
        }).invoke(t.call),
      ).rejects.toThrow(/retained launch intent/)
      expect(t.requests).toHaveLength(1)
    },
  )
  it.each([
    'collection',
    'card-create',
    'card-id',
    'card-query',
    'card-database',
    'card-dashboard',
    'card-archived',
    'card-display',
    'card-type',
    'card-title',
    'card-description',
    'card-parameters',
    'template-tags',
    'opaque-v5',
    'dashboard-collection',
    'dashboard-public',
    'dashboard-embedding',
    'dashboard-description',
    'dashboard-parameters',
    'duplicate',
    'attachment-id',
    'attachment-dashboard',
    'attachment-card',
    'attachment-mapping',
    'attachment-series',
    'attachment-settings',
  ])('returns an inspectable pending reference after %s', async (kind) => {
    const t = fixture()
    if (kind === 'collection') t.created.collection_id = 4
    if (kind === 'card-create') t.values[1] = null
    if (kind === 'card-id') t.values[2] = { ...t.card, id: 20 }
    if (kind === 'card-query') t.card.dataset_query.native.query = 'select 0'
    if (kind === 'card-database') t.card.dataset_query.database = 4
    if (kind === 'card-dashboard') t.card.dashboard_id = 43
    if (kind === 'card-archived') t.card.archived = true
    if (kind === 'card-display') t.card.display = 'line'
    if (kind === 'card-type') t.card.type = 'model'
    if (kind === 'card-title') t.card.name = 'other'
    if (kind === 'card-description') t.card.description = 'other'
    if (kind === 'card-parameters') Object.assign(t.card, { parameters: [{}] })
    if (kind === 'template-tags') t.card.dataset_query.native['template-tags'] = { override: {} }
    if (kind === 'opaque-v5')
      Object.assign(t.card, {
        dataset_query: { 'lib/type': 'mbql/query', database: 2, stages: [] },
      })
    if (kind === 'dashboard-collection') t.dashboard.collection_id = 4
    if (kind === 'dashboard-public') Object.assign(t.dashboard, { public_uuid: 'public' })
    if (kind === 'dashboard-embedding') t.dashboard.enable_embedding = true
    if (kind === 'dashboard-description') t.dashboard.description = 'other'
    if (kind === 'dashboard-parameters') Object.assign(t.dashboard, { parameters: [{}] })
    if (kind === 'duplicate') t.dashboard.dashcards.push({ ...t.attached })
    if (kind === 'attachment-id') t.attached.id = 0
    if (kind === 'attachment-dashboard') t.attached.dashboard_id = 43
    if (kind === 'attachment-card') t.attached.card_id = 20
    if (kind === 'attachment-mapping') Object.assign(t.attached, { parameter_mappings: [{}] })
    if (kind === 'attachment-series') Object.assign(t.attached, { series: [{}] })
    if (kind === 'attachment-settings') t.attached.visualization_settings = { override: true }
    const result = await metabaseDashboardHost(t.config, {
      secret: () => 'fixture-only-noncredential',
      fetch: t.fetch,
    }).invoke(t.call)
    expect(result).toMatchObject({
      status: 'pending',
      complete: false,
      ref: `${t.config.baseUrl}dashboard/17`,
    })
    expect(JSON.parse(result.body ?? '')).toMatchObject({
      dashboardId: 17,
      manualInspectionRequired: true,
      automaticRetry: false,
    })
    expect(t.requests.length).toBeLessThanOrEqual(4)
  })
  it('allows only the explicit legacy query option on the API-key transport', async () => {
    const t = fixture(),
      fetch = vi.fn()
    await expect(
      withDashboardHttp(
        t.config,
        { secret: () => 'fixture-only-noncredential', authentication: 'api-key', fetch },
        (request) => request('api/card/18?private=secret'),
      ),
    ).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
    await expect(
      withDashboardHttp(
        t.config,
        { secret: () => 'fixture-only-noncredential', fetch },
        (request) => request('api/card/18?legacy-mbql=true'),
      ),
    ).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })
})

it.each([false, true])(
  'binds compiled preview and actual once-intent Metabase delivery; partial=%s',
  async (partial) => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-metabase-dispatch-'))),
      root = join(dir, 'repo')
    mkdirSync(join(root, '.wholeloop'), { recursive: true })
    writeFileSync(
      join(root, '.wholeloop/config.yml'),
      'version: 1\nproviders:\n  dashboards: metabase\n',
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
      if (!target) throw new Error('Missing dashboard artifact')
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
        plan: { provider: 'metabase', window: { verified: false } },
      })
      expect(engine.store.events()).toEqual(before)
      if (partial) t.values[1] = null
      const host = metabaseDashboardHost(t.config, {
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
