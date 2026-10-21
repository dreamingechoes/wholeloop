import { isObject, validate } from '../config/schema.js'
import { contractDigest } from '../contracts/compatibility.js'
import { measurementDigest } from '../launch/measurement.js'
import measurementSchema from '../launch/schemas/measurement-v1.json' with { type: 'json' }
import type { Metric } from '../spec/contract.js'
import { withDashboardHttp } from './dashboard-http.js'
import type { OperationCall, ProviderHost } from './operations.js'
import schema from './schemas/grafana-dashboard-bridge-v1.json' with { type: 'json' }

interface GrafanaBridge {
  schema: 'wholeloop/grafana-dashboard-bridge@1'
  provider: 'grafana'
  baseUrl: string
  tokenEnv: string
  namespace: string
  dashboardUid: string
  folderUid: string
  datasourceUid: string
  queryLanguage: 'promql'
  artifactDigest: string
}
const fail = (): never => {
  throw new Error('Invalid or unsupported metric-pinned Grafana creation; contents omitted')
}

export function grafanaBridgeConfig(value: unknown): GrafanaBridge {
  if (validate(value, schema).length) return fail()
  const config = value as GrafanaBridge
  let url: URL
  try {
    url = new URL(config.baseUrl)
  } catch {
    return fail()
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.href !== config.baseUrl ||
    !config.baseUrl.endsWith('/') ||
    config.baseUrl.length > 2048
  )
    return fail()
  return { ...config }
}

/** Build a create-only v1 request from the exact journal artifact; no query translation. */
export function grafanaDashboardPlan(configuration: unknown, call: OperationCall) {
  const config = grafanaBridgeConfig(configuration)
  if (
    call.provider !== config.provider ||
    call.operation !== 'dashboards.create' ||
    call.tool !== 'wholeloop.dashboard.handoff' ||
    Object.keys(call.args).some(
      (key) => !['title', 'body', 'artifact', 'measurementEntry', 'dashboard'].includes(key),
    ) ||
    typeof call.args.body !== 'string' ||
    measurementDigest(call.args.body) !== config.artifactDigest ||
    Buffer.byteLength(call.args.body) > 1024 * 1024
  )
    return fail()
  let spec: unknown
  try {
    spec = JSON.parse(call.args.body)
  } catch {
    return fail()
  }
  if (
    !isObject(spec) ||
    spec.schema !== 'wholeloop/launch-dashboard@1' ||
    Object.keys(spec).some(
      (key) =>
        !['schema', 'title', 'metricRef', 'sourceRevision', 'sourceDigest', 'metric'].includes(key),
    ) ||
    typeof spec.title !== 'string' ||
    !spec.title.trim() ||
    spec.title !== call.args.title ||
    typeof spec.metricRef !== 'string' ||
    spec.metricRef !== call.args.measurementEntry ||
    !/^items\/[A-Za-z0-9_-]+\/launches\/[A-Za-z0-9_-]+\/measurement\.json#\/metrics\/(0|[1-9][0-9]*)$/.test(
      spec.metricRef,
    ) ||
    typeof spec.sourceDigest !== 'string' ||
    !/^[a-f0-9]{64}$/.test(spec.sourceDigest) ||
    typeof spec.sourceRevision !== 'string' ||
    !spec.sourceRevision.trim() ||
    validate(spec.metric, measurementSchema.properties.metrics.items).length ||
    (call.args.dashboard !== undefined &&
      contractDigest(call.args.dashboard) !== contractDigest(spec))
  )
    return fail()
  const metric = spec.metric as Metric
  if (
    metric.source.provider !== 'grafana' ||
    metric.source.operation !== 'source.observability.query' ||
    !metric.source.query.trim() ||
    /\$|\[\[/.test(metric.source.query) ||
    !Number.isSafeInteger(metric.window.days) ||
    metric.window.days < 1 ||
    metric.window.days > 3660
  )
    return fail()
  try {
    new Intl.DateTimeFormat('en', { timeZone: metric.window.timezone })
  } catch {
    return fail()
  }
  const datasource = { type: 'prometheus', uid: config.datasourceUid }
  const body = {
    metadata: {
      name: config.dashboardUid,
      annotations: { 'grafana.app/folder': config.folderUid },
    },
    spec: {
      title: spec.title,
      schemaVersion: 41,
      version: 0,
      editable: true,
      description: `Measurement: ${spec.metricRef}; source revision: ${spec.sourceRevision}; source digest: ${spec.sourceDigest}; artifact digest: ${config.artifactDigest}. Configured query; traffic and target attainment are unverified.`,
      timezone: metric.window.timezone,
      time: { from: `now-${metric.window.days}d`, to: 'now' },
      templating: { list: [] },
      annotations: { list: [] },
      panels: [
        {
          id: 1,
          title: metric.name,
          type: 'timeseries',
          datasource,
          gridPos: { x: 0, y: 0, w: 24, h: 8 },
          description: `Metric ${metric.id}; unit ${metric.unit}; target ${metric.target.operator} ${metric.target.value}.`,
          targets: [
            { refId: 'A', datasource, expr: metric.source.query, range: true, instant: false },
          ],
        },
      ],
    },
  }
  const path = `apis/dashboard.grafana.app/v1/namespaces/${config.namespace}/dashboards`
  return {
    provider: config.provider,
    artifactDigest: config.artifactDigest,
    request: { method: 'POST', url: new URL(path, config.baseUrl).href, body },
    verification: {
      method: 'GET',
      url: new URL(`${path}/${config.dashboardUid}`, config.baseUrl).href,
    },
    resource: new URL(`d/${config.dashboardUid}`, config.baseUrl).href,
    credentialEnv: config.tokenEnv,
    effects: 'not-performed',
  }
}

/** Invoke only through the once-intent launch dispatcher; ambiguous writes are never retried. */
export function grafanaDashboardHost(
  configuration: unknown,
  options: Parameters<typeof withDashboardHttp>[1],
): ProviderHost {
  const config = grafanaBridgeConfig(configuration)
  return {
    invoke: async (call) => {
      try {
        const plan = grafanaDashboardPlan(config, call)
        return await withDashboardHttp(config, options, async (request) => {
          const path = `apis/dashboard.grafana.app/v1/namespaces/${config.namespace}/dashboards`
          const created = await request(path, plan.request.body)
          const identity = (raw: unknown) => {
            if (
              !isObject(raw) ||
              raw.kind !== 'Dashboard' ||
              raw.apiVersion !== 'dashboard.grafana.app/v1' ||
              !isObject(raw.metadata) ||
              raw.metadata.name !== config.dashboardUid ||
              raw.metadata.namespace !== config.namespace ||
              typeof raw.metadata.resourceVersion !== 'string' ||
              !raw.metadata.resourceVersion.trim()
            )
              return fail()
            return raw
          }
          identity(created)
          const observed = identity(await request(`${path}/${config.dashboardUid}`))
          if (
            !isObject(observed.spec) ||
            !isObject(observed.metadata) ||
            !isObject(observed.metadata.annotations) ||
            observed.metadata.annotations['grafana.app/folder'] !== config.folderUid ||
            observed.spec.title !== plan.request.body.spec.title ||
            observed.spec.description !== plan.request.body.spec.description ||
            contractDigest(observed.spec.panels) !==
              contractDigest(plan.request.body.spec.panels) ||
            contractDigest(observed.spec.time) !== contractDigest(plan.request.body.spec.time) ||
            observed.spec.timezone !== plan.request.body.spec.timezone ||
            contractDigest(observed.spec.templating) !== contractDigest({ list: [] })
          )
            return fail()
          return {
            status: 'succeeded' as const,
            ref: plan.resource,
            complete: true,
            revision: measurementDigest({
              artifact: config.artifactDigest,
              version: observed.metadata.resourceVersion,
            }),
            body: JSON.stringify({
              createdRemotely: true,
              artifactDigest: config.artifactDigest,
              dashboardUid: config.dashboardUid,
              queryVerified: false,
              trafficObserved: false,
            }),
          }
        })
      } catch {
        throw new Error(
          'Grafana creation or verification failed; inspect the retained launch intent and remote state; diagnostics omitted',
        )
      }
    },
  }
}
