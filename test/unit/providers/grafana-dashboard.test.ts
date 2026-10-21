import { spawnSync } from 'node:child_process'
import { getEventListeners } from 'node:events'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { FlowEngine } from '../../../src/flow/engine.js'
import type { LaunchDraft } from '../../../src/launch/contracts.js'
import { type MeasurementPlan, measurementDigest } from '../../../src/launch/measurement.js'
import { dispatchLaunchArtifact, launchDeliveries } from '../../../src/launch/publish.js'
import { LaunchWorkflow } from '../../../src/launch/workflow.js'
import {
  grafanaBridgeConfig,
  grafanaDashboardHost,
  grafanaDashboardPlan,
} from '../../../src/providers/grafana-dashboard.js'
import type { OperationCall } from '../../../src/providers/operations.js'
import { parseSpec } from '../../../src/spec/contract.js'
import { StateStore } from '../../../src/state/store.js'

const measurement = (): MeasurementPlan => {
  const source = parseSpec(
    readFileSync(new URL('../../fixtures/spec/spec.md', import.meta.url), 'utf8'),
  )
  for (const metric of source.metrics)
    metric.source = {
      provider: 'grafana',
      operation: 'source.observability.query',
      query: 'sum(rate(order_errors_total[5m]))',
    }
  return {
    schema: 'wholeloop/measurement-plan@1',
    impact: source.impact,
    metrics: source.metrics,
    rollout: source.rollout,
  }
}
const descriptor = () => ({
  schema: 'wholeloop/launch-dashboard@1',
  title: 'Order errors',
  metricRef: 'items/scope-fixture/launches/run-fixture/measurement.json#/metrics/0',
  sourceRevision: 'agreed-revision',
  sourceDigest: 'a'.repeat(64),
  metric: measurement().metrics[0],
})
function setup() {
  const spec = descriptor(),
    body = JSON.stringify(spec)
  const config = {
    schema: 'wholeloop/grafana-dashboard-bridge@1',
    provider: 'grafana',
    baseUrl: 'https://grafana.example/prefix/',
    tokenEnv: 'WL_FIXTURE_GRAFANA_KEY',
    namespace: 'default',
    dashboardUid: 'wl-orders',
    folderUid: 'launches',
    datasourceUid: 'prometheus-main',
    queryLanguage: 'promql',
    artifactDigest: measurementDigest(body),
  }
  const call: OperationCall = {
    provider: 'grafana',
    operation: 'dashboards.create',
    tool: 'wholeloop.dashboard.handoff',
    args: { title: spec.title, body, measurementEntry: spec.metricRef, dashboard: spec },
    guidance: '',
  }
  return { spec, config, call }
}
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
function transport(config = setup().config, call = setup().call) {
  const plan = grafanaDashboardPlan(config, call),
    requests: { url: string; method: string; body: unknown }[] = []
  const resource = {
    kind: 'Dashboard',
    apiVersion: 'dashboard.grafana.app/v1',
    metadata: { ...plan.request.body.metadata, namespace: config.namespace, resourceVersion: '1' },
    spec: plan.request.body.spec,
  }
  const fetch: typeof globalThis.fetch = async (url, init) => {
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer fixture-only-noncredential',
      Accept: 'application/json',
    })
    expect(init).toMatchObject({ redirect: 'error', credentials: 'omit' })
    requests.push({
      url: String(url),
      method: init?.method ?? '',
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    })
    return response(resource, init?.method === 'POST' ? 201 : 200)
  }
  return { plan, resource, requests, fetch }
}

describe('create-only metric-pinned Grafana bridge', () => {
  it('keeps exact pinned PromQL, scope, datasource, window and provenance without I/O', () => {
    const { config, call, spec } = setup(),
      plan = grafanaDashboardPlan(config, call)
    expect(grafanaBridgeConfig(config)).toEqual(config)
    expect(plan.request.url).toBe(
      'https://grafana.example/prefix/apis/dashboard.grafana.app/v1/namespaces/default/dashboards',
    )
    expect(plan.request.body.metadata).toEqual({
      name: 'wl-orders',
      annotations: { 'grafana.app/folder': 'launches' },
    })
    expect(plan.request.body.spec.panels[0]?.targets[0]?.expr).toBe(spec.metric?.source.query)
    expect(plan.request.body.spec).toMatchObject({
      timezone: 'UTC',
      time: { from: 'now-30d', to: 'now' },
      templating: { list: [] },
    })
    expect(JSON.stringify(plan)).not.toMatch(/Authorization|fixture-only-noncredential|overwrite/)
    expect(plan.effects).toBe('not-performed')
  })
  it.each([
    'secret-field',
    'http',
    'auth-url',
    'query-url',
    'noncanonical-url',
    'project-escape',
    'uid-escape',
    'token-name',
    'language',
    'digest',
  ])('rejects %s configuration before credentials', async (kind) => {
    const { config, call } = setup(),
      input: Record<string, unknown> = { ...config }
    if (kind === 'secret-field') input.token = 'fixture-only-noncredential'
    if (kind === 'http') input.baseUrl = 'http://grafana.example/'
    if (kind === 'auth-url') input.baseUrl = 'https://private@grafana.example/'
    if (kind === 'query-url') input.baseUrl = 'https://grafana.example/?token=private'
    if (kind === 'noncanonical-url') input.baseUrl = 'https://grafana.example'
    if (kind === 'project-escape') input.namespace = '../default'
    if (kind === 'uid-escape') input.dashboardUid = '../other'
    if (kind === 'token-name') input.tokenEnv = 'not a reference'
    if (kind === 'language') input.queryLanguage = 'sql'
    if (kind === 'digest') input.artifactDigest = 'not-a-digest'
    const secret = vi.fn(),
      fetch = vi.fn()
    await expect(async () =>
      grafanaDashboardHost(input, { secret, fetch }).invoke(call),
    ).rejects.toThrow()
    expect(secret).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each([
    'provider',
    'operation',
    'tool',
    'extra-argument',
    'changed-body',
    'wrong-title',
    'wrong-pointer',
    'wrong-dashboard',
    'source-provider',
    'source-operation',
    'template',
    'window',
    'timezone',
    'extra-spec',
  ])('rejects %s artifact or call before credentials', async (kind) => {
    const { config, call, spec } = setup()
    if (kind === 'provider') call.provider = 'other'
    if (kind === 'operation') call.operation = 'flags.propose-change'
    if (kind === 'tool') call.tool = 'update_dashboard'
    if (kind === 'extra-argument') call.args.overwrite = true
    if (kind === 'wrong-title') call.args.title = 'different'
    if (kind === 'wrong-pointer') call.args.measurementEntry = 'elsewhere'
    if (kind === 'wrong-dashboard') call.args.dashboard = { ...spec, title: 'different' }
    if (spec.metric) {
      if (kind === 'source-provider') spec.metric.source.provider = 'posthog'
      if (kind === 'source-operation') spec.metric.source.operation = 'source.errors.query'
      if (kind === 'template') spec.metric.source.query = 'rate(order_errors_total[$__interval])'
      if (kind === 'window') spec.metric.window.days = 0.5
      if (kind === 'timezone') spec.metric.window.timezone = 'Invalid/Nowhere'
    }
    if (kind === 'extra-spec') Object.assign(spec, { query: 'override' })
    if (
      [
        'changed-body',
        'source-provider',
        'source-operation',
        'template',
        'window',
        'timezone',
        'extra-spec',
      ].includes(kind)
    ) {
      call.args.body = JSON.stringify({
        ...spec,
        ...(kind === 'changed-body' ? { title: 'different' } : {}),
      })
      if (kind !== 'changed-body') config.artifactDigest = measurementDigest(call.args.body)
    }
    const secret = vi.fn(),
      fetch = vi.fn()
    await expect(grafanaDashboardHost(config, { secret, fetch }).invoke(call)).rejects.toThrow(
      /diagnostics omitted/,
    )
    expect(secret).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('POSTs creation then verifies the exact resource without trusting returned links or leaking raw fields', async () => {
    const { config, call } = setup(),
      t = transport(config, call)
    Object.assign(t.resource, {
      url: 'https://foreign.example/private',
      createdBy: { email: 'private@example.com' },
    })
    const result = await grafanaDashboardHost(config, {
      secret: () => 'fixture-only-noncredential',
      fetch: t.fetch,
    }).invoke(call)
    expect(t.requests.map((r) => r.method)).toEqual(['POST', 'GET'])
    expect(t.requests[1]?.url).toBe(t.plan.verification.url)
    expect(t.requests[0]?.body).toEqual(t.plan.request.body)
    expect(result).toMatchObject({
      status: 'succeeded',
      complete: true,
      ref: 'https://grafana.example/prefix/d/wl-orders',
    })
    expect(JSON.parse(result.body ?? '')).toMatchObject({
      createdRemotely: true,
      artifactDigest: config.artifactDigest,
      trafficObserved: false,
      queryVerified: false,
    })
    expect(result.revision).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(result)).not.toMatch(/private|Authorization|order_errors/)
  })
  it.each([
    'post-conflict',
    'read-failure',
    'identity',
    'namespace',
    'folder',
    'panels',
    'time',
    'timezone',
    'templating',
    'content-type',
    'oversize',
    'abort-between',
  ])('refuses %s without retry, overwrite or delete', async (kind) => {
    const { config, call } = setup(),
      t = transport(config, call),
      controller = new AbortController()
    const methods: string[] = []
    const fetch: typeof globalThis.fetch = async (_url, init) => {
      methods.push(init?.method ?? '')
      if (methods.length === 1) {
        if (kind === 'post-conflict') return response({ private: 'not printed' }, 409)
        if (kind === 'abort-between') controller.abort()
        return response(t.resource, 201)
      }
      const raw = structuredClone(t.resource)
      if (kind === 'read-failure') throw new Error('private credential or response')
      if (kind === 'identity') raw.metadata.name = 'other'
      if (kind === 'namespace') raw.metadata.namespace = 'other'
      if (kind === 'folder') raw.metadata.annotations['grafana.app/folder'] = 'other'
      if (kind === 'panels') raw.spec.panels = []
      if (kind === 'time') raw.spec.time.from = 'now-1d'
      if (kind === 'timezone') raw.spec.timezone = 'Europe/Madrid'
      if (kind === 'templating')
        Object.assign(raw.spec.templating, { list: [{ name: 'override' }] })
      if (kind === 'content-type')
        return new Response('<html>private</html>', { headers: { 'Content-Type': 'text/html' } })
      if (kind === 'oversize') return response({ padding: 'x'.repeat(1024 * 1024) })
      return response(raw)
    }
    await expect(
      grafanaDashboardHost(config, {
        signal: controller.signal,
        secret: () => 'fixture-only-noncredential',
        fetch,
      }).invoke(call),
    ).rejects.toThrow(
      'Grafana creation or verification failed; inspect the retained launch intent and remote state; diagnostics omitted',
    )
    expect(methods).toEqual(
      ['post-conflict', 'abort-between'].includes(kind) ? ['POST'] : ['POST', 'GET'],
    )
    expect(getEventListeners(controller.signal, 'abort')).toEqual([])
  })
})

async function fixture(
  action: (context: {
    dir: string
    root: string
    engine: FlowEngine
    workflow: LaunchWorkflow
    subject: string
    key: string
    config: ReturnType<typeof setup>['config']
  }) => Promise<void>,
) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-grafana-'))),
    root = join(dir, 'repo')
  mkdirSync(join(root, '.wholeloop'), { recursive: true })
  writeFileSync(
    join(root, '.wholeloop/config.yml'),
    'version: 1\nproviders:\n  dashboards: grafana\n',
  )
  const engine = new FlowEngine(
      new StateStore(join(dir, 'state')),
      root,
      join(dir, 'user/config.yml'),
      join(dir, 'home'),
    ),
    workflow = new LaunchWorkflow(engine)
  try {
    const start = workflow.begin({
      input: 'Order launch',
      owner: 'Alex',
      measurement: measurement(),
    })
    if (start.status !== 'planned') throw new Error('Missing synthetic plan')
    const kit: LaunchDraft = {
      schema: 'wholeloop/launch-kit@1',
      sourceDigest: start.plan.source.digest,
      rolloutPlan: 'Pilot then general after human review.',
      comms: [
        { key: 'pilot', audience: 'Reviewers', stage: 'pilot', body: 'Draft only.' },
        { key: 'general', audience: 'Customers', stage: 'general', body: 'Draft only.' },
      ],
      dashboards: [{ key: 'orders', title: 'Order errors', metric: 'retrieval-time' }],
      enablement: {
        supportGuide: 'Check errors.',
        onePager: 'Order launch.',
        runbook: 'Person owns rollback.',
      },
    }
    workflow.complete(start.subject, kit)
    const target = workflow.publication(start.subject).find((t) => t.key === 'dashboards/orders')
    if (!target) throw new Error('Missing synthetic dashboard')
    const config = { ...setup().config, artifactDigest: measurementDigest(target.body) }
    await action({ dir, root, engine, workflow, subject: start.subject, key: target.key, config })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('Grafana launch journal and compiled CLI boundary', () => {
  it('uses the actual built-in manifest once and caches completed publication', async () =>
    fixture(async ({ workflow, subject, key, config, engine }) => {
      const target = workflow.publication(subject).find((t) => t.key === key)
      if (!target) throw new Error('Missing target')
      const call: OperationCall = {
        provider: 'grafana',
        operation: 'dashboards.create',
        tool: 'wholeloop.dashboard.handoff',
        args: { title: target.title, body: target.body, measurementEntry: target.metricRef },
        guidance: '',
      }
      const t = transport(config, call),
        host = grafanaDashboardHost(config, {
          secret: () => 'fixture-only-noncredential',
          fetch: t.fetch,
        })
      expect(await dispatchLaunchArtifact(workflow, subject, key, host)).toMatchObject({
        cached: false,
        result: { status: 'succeeded' },
      })
      expect(await dispatchLaunchArtifact(workflow, subject, key, host)).toMatchObject({
        cached: true,
        result: { status: 'succeeded' },
      })
      expect(t.requests).toHaveLength(2)
      expect(launchDeliveries(engine.store.events())).toHaveLength(1)
    }))
  it('retains ambiguous intent after a possible remote create and refuses another write', async () =>
    fixture(async ({ workflow, subject, key, config, engine }) => {
      const fetch = vi.fn(async () => {
        throw new Error('lost response after possible create')
      })
      const host = grafanaDashboardHost(config, {
        secret: () => 'fixture-only-noncredential',
        fetch,
      })
      await expect(dispatchLaunchArtifact(workflow, subject, key, host)).rejects.toThrow(
        /retained intent/,
      )
      await expect(dispatchLaunchArtifact(workflow, subject, key, host)).rejects.toThrow(
        /ambiguous/,
      )
      expect(fetch).toHaveBeenCalledTimes(1)
      expect(launchDeliveries(engine.store.events())[0]?.result).toBeUndefined()
    }))
  it('compiled preview preserves journal and repository, resolves no credential, and rejects live without a key', async () =>
    fixture(async ({ dir, root, engine, subject, key, config }) => {
      const file = join(dir, 'bridge.json')
      writeFileSync(file, JSON.stringify(config))
      // Point the child at this fixture store; the ordinary default remains external.
      const env = {
        ...process.env,
        HOME: join(dir, 'home'),
        XDG_STATE_HOME: dir,
        XDG_CONFIG_HOME: join(dir, 'user'),
        WL_WORKSPACE: '',
        [config.tokenEnv]: '',
      }
      // The fixture store above is named state; use a symlink-free independent copied journal.
      const before = engine.store.events()
      const childStore = new StateStore(join(dir, 'wholeloop'))
      // Preserve event IDs because pinned source links refer to those exact IDs.
      const { cpSync } = await import('node:fs')
      cpSync(join(dir, 'state'), join(dir, 'wholeloop'), { recursive: true, force: true })
      const args = [
        resolve('dist/wl.mjs'),
        'launch',
        'dispatch',
        '--for',
        subject,
        '--key',
        key,
        '--bridge',
        file,
        '--json',
      ]
      const preview = spawnSync(process.execPath, args, { cwd: root, env, encoding: 'utf8' })
      expect(preview.status, preview.stderr || preview.stdout).toBe(0)
      expect(JSON.parse(preview.stdout)).toMatchObject({
        schema: 'wholeloop/dashboard-dispatch@1',
        status: 'planned',
        effects: 'not-performed',
      })
      expect(childStore.events()).toEqual(before)
      const live = spawnSync(process.execPath, [...args, '--live'], {
        cwd: root,
        env,
        encoding: 'utf8',
      })
      expect(live.status).toBe(3)
      expect(JSON.parse(live.stdout).message).toMatch(/retained intent/)
      expect(engine.store.events()).toEqual(before)
    }))
})
