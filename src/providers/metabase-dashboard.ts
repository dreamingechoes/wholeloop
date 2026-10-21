import { isObject, validate } from '../config/schema.js'
import { measurementDigest } from '../launch/measurement.js'
import { dashboardArtifact, dashboardBaseUrl } from './dashboard-artifact.js'
import { withDashboardHttp } from './dashboard-http.js'
import type { OperationCall, ProviderHost } from './operations.js'
import schema from './schemas/metabase-dashboard-bridge-v1.json' with { type: 'json' }

interface MetabaseDashboardBridge {
  schema: 'wholeloop/metabase-dashboard-bridge@1'
  provider: 'metabase'
  baseUrl: string
  tokenEnv: string
  database: number
  collection: number
  queryLanguage: 'native-sql'
  windowBinding: 'reviewed-in-native-sql'
  artifactDigest: string
}
const fail = (): never => {
  throw new Error('Invalid or unsupported metric-pinned Metabase creation; contents omitted')
}
const emptyObject = (value: unknown) => isObject(value) && Object.keys(value).length === 0
const emptyList = (value: unknown) => Array.isArray(value) && value.length === 0
export function metabaseDashboardConfig(value: unknown): MetabaseDashboardBridge {
  if (validate(value, schema).length) return fail()
  const config = value as MetabaseDashboardBridge
  if (!Number.isSafeInteger(config.database) || !Number.isSafeInteger(config.collection))
    return fail()
  dashboardBaseUrl(config.baseUrl)
  return { ...config }
}

/** Native SQL remains byte-for-byte pinned. Window semantics are explicitly owner-reviewed. */
export function metabaseDashboardPlan(configuration: unknown, call: OperationCall) {
  const config = metabaseDashboardConfig(configuration),
    spec = dashboardArtifact(call, config.provider, config.artifactDigest),
    metric = spec.metric
  if (
    metric.source.provider !== 'metabase' ||
    metric.source.operation !== 'source.bi.query' ||
    !/^\s*select\b/i.test(metric.source.query) ||
    /;|--|\/\*|\{\{|\[\[/.test(metric.source.query) ||
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
  const description = `Measurement: ${spec.metricRef}; source revision: ${spec.sourceRevision}; source digest: ${spec.sourceDigest}; artifact digest: ${config.artifactDigest}; unit ${metric.unit}; target ${metric.target.operator} ${metric.target.value}; expected window ${metric.window.days} days/${metric.window.timezone}. Native SQL window is owner-reviewed; query, rendering and traffic are unverified.`
  return {
    provider: config.provider,
    artifactDigest: config.artifactDigest,
    credentialEnv: config.tokenEnv,
    dashboard: {
      method: 'POST',
      url: new URL('api/dashboard', config.baseUrl).href,
      body: { name: spec.title, description, collection_id: config.collection, parameters: [] },
    },
    card: {
      method: 'POST',
      url: new URL('api/card', config.baseUrl).href,
      body: {
        name: metric.name,
        description,
        type: 'question',
        display: 'table',
        visualization_settings: {},
        parameters: [],
        parameter_mappings: [],
        dataset_query: {
          database: config.database,
          type: 'native',
          native: { query: metric.source.query, 'template-tags': {} },
        },
        size: { size_x: 12, size_y: 8 },
      },
      dashboardBinding: 'newly-created-dashboard-id',
    },
    verification: [
      'read-exact-card-with-legacy-mbql=true',
      'read-exact-dashboard-with-one-matching-card',
    ],
    window: { ...metric.window, basis: config.windowBinding, verified: false },
    effects: 'not-performed',
  }
}

/** Create a dashboard-owned question so attaching it needs no update of existing resources. */
export function metabaseDashboardHost(
  configuration: unknown,
  options: Parameters<typeof withDashboardHttp>[1],
): ProviderHost {
  const config = metabaseDashboardConfig(configuration)
  return {
    invoke: async (call) => {
      let dashboardId: number | undefined,
        phase = 'dashboard-create'
      const reference = () => new URL(`dashboard/${dashboardId}`, config.baseUrl).href
      try {
        const plan = metabaseDashboardPlan(config, call)
        return await withDashboardHttp(
          config,
          { ...options, authentication: 'api-key' },
          async (request) => {
            const created = await request('api/dashboard', plan.dashboard.body)
            if (!isObject(created) || !Number.isSafeInteger(created.id) || Number(created.id) < 1)
              return fail()
            dashboardId = Number(created.id)
            if (
              created.name !== plan.dashboard.body.name ||
              created.collection_id !== config.collection ||
              created.archived !== false
            )
              return fail()
            phase = 'card-create'
            const card = await request('api/card', { ...plan.card.body, dashboard_id: dashboardId })
            if (!isObject(card) || !Number.isSafeInteger(card.id) || Number(card.id) < 1)
              return fail()
            phase = 'card-read'
            // Metabase converts native queries to opaque MBQL 5; this explicit endpoint option
            // supplies the documented classic representation needed for exact SQL comparison.
            const observed = await request(`api/card/${card.id}?legacy-mbql=true`)
            if (
              !isObject(observed) ||
              observed.id !== card.id ||
              observed.dashboard_id !== dashboardId ||
              observed.archived !== false ||
              observed.type !== 'question' ||
              observed.display !== 'table' ||
              observed.name !== plan.card.body.name ||
              observed.description !== plan.card.body.description ||
              !emptyList(observed.parameters) ||
              !emptyObject(observed.visualization_settings) ||
              !isObject(observed.dataset_query)
            )
              return fail()
            const query = observed.dataset_query
            if (
              query.database !== config.database ||
              query.type !== 'native' ||
              !isObject(query.native) ||
              query.native.query !== plan.card.body.dataset_query.native.query ||
              !emptyObject(query.native['template-tags']) ||
              Object.keys(query).some((key) => !['database', 'type', 'native'].includes(key)) ||
              Object.keys(query.native).some((key) => !['query', 'template-tags'].includes(key))
            )
              return fail()
            phase = 'dashboard-read'
            const dashboard = await request(`api/dashboard/${dashboardId}`)
            if (
              !isObject(dashboard) ||
              dashboard.id !== dashboardId ||
              dashboard.name !== plan.dashboard.body.name ||
              dashboard.description !== plan.dashboard.body.description ||
              dashboard.collection_id !== config.collection ||
              dashboard.archived !== false ||
              dashboard.public_uuid !== null ||
              dashboard.enable_embedding !== false ||
              !emptyList(dashboard.parameters) ||
              !Array.isArray(dashboard.dashcards) ||
              dashboard.dashcards.length !== 1
            )
              return fail()
            const attached = dashboard.dashcards[0]
            if (
              !isObject(attached) ||
              !Number.isSafeInteger(attached.id) ||
              Number(attached.id) < 1 ||
              attached.dashboard_id !== dashboardId ||
              attached.card_id !== card.id ||
              !emptyList(attached.parameter_mappings) ||
              !emptyList(attached.series) ||
              !emptyObject(attached.visualization_settings)
            )
              return fail()
            return {
              status: 'succeeded' as const,
              ref: reference(),
              complete: true,
              revision: measurementDigest({
                artifact: config.artifactDigest,
                dashboard: dashboardId,
                card: card.id,
                dashcard: attached.id,
                query,
              }),
              body: JSON.stringify({
                createdRemotely: true,
                dashboardId,
                cardId: card.id,
                artifactDigest: config.artifactDigest,
                windowVerified: false,
                queryVerified: false,
                trafficObserved: false,
              }),
            }
          },
        )
      } catch {
        if (dashboardId !== undefined)
          return {
            status: 'pending',
            ref: reference(),
            complete: false,
            body: JSON.stringify({
              createdRemotely: 'partially-observed',
              dashboardId,
              phase,
              manualInspectionRequired: true,
              automaticRetry: false,
            }),
          }
        throw new Error(
          'Metabase creation or verification failed; inspect the retained launch intent and remote state; diagnostics omitted',
        )
      }
    },
  }
}
