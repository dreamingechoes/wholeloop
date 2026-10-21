import { isObject, validate } from '../config/schema.js'
import { contractDigest } from '../contracts/compatibility.js'
import { measurementDigest } from '../launch/measurement.js'
import { dashboardArtifact, dashboardBaseUrl } from './dashboard-artifact.js'
import { withDashboardHttp } from './dashboard-http.js'
import type { OperationCall, OperationResult, ProviderHost } from './operations.js'
import schema from './schemas/posthog-dashboard-bridge-v1.json' with { type: 'json' }

interface PostHogDashboardBridge {
  schema: 'wholeloop/posthog-dashboard-bridge@1'
  provider: 'posthog'
  baseUrl: string
  tokenEnv: string
  organization: string
  project: string
  queryLanguage: 'hogql'
  artifactDigest: string
}
const emptyOverrides = (value: unknown) =>
  value === null || (isObject(value) && Object.keys(value).length === 0)
const fail = (): never => {
  throw new Error('Invalid or unsupported metric-pinned PostHog creation; contents omitted')
}
export function postHogDashboardConfig(value: unknown): PostHogDashboardBridge {
  if (validate(value, schema).length) return fail()
  const config = value as PostHogDashboardBridge
  dashboardBaseUrl(config.baseUrl)
  return { ...config }
}

export function postHogDashboardPlan(configuration: unknown, call: OperationCall) {
  const config = postHogDashboardConfig(configuration),
    spec = dashboardArtifact(call, config.provider, config.artifactDigest),
    metric = spec.metric
  if (
    metric.source.provider !== 'posthog' ||
    metric.source.operation !== 'source.product-analytics.query' ||
    !metric.source.query.includes('{filters}') ||
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
  const description = `Measurement: ${spec.metricRef}; source revision: ${spec.sourceRevision}; source digest: ${spec.sourceDigest}; artifact digest: ${config.artifactDigest}; unit ${metric.unit}; target ${metric.target.operator} ${metric.target.value}. Configured query; traffic and target attainment are unverified.`
  const query = {
    kind: 'DataVisualizationNode',
    display: 'ActionsTable',
    source: {
      kind: 'HogQLQuery',
      query: metric.source.query,
      filters: {
        dateRange: { date_from: `-${metric.window.days}d`, date_to: null, explicitDate: true },
      },
    },
  }
  const base = `api/projects/${config.project}/`
  return {
    provider: config.provider,
    artifactDigest: config.artifactDigest,
    credentialEnv: config.tokenEnv,
    projectCheck: {
      method: 'GET',
      url: new URL(
        `api/organizations/${config.organization}/projects/${config.project}/`,
        config.baseUrl,
      ).href,
      timezone: metric.window.timezone,
    },
    dashboard: {
      method: 'POST',
      url: new URL(`${base}dashboards/`, config.baseUrl).href,
      body: { name: spec.title, description, pinned: false, deleted: false },
    },
    insight: {
      method: 'POST',
      url: new URL(`${base}insights/`, config.baseUrl).href,
      body: { name: metric.name, description, query, deleted: false },
      dashboardBinding: 'newly-created-dashboard-id',
    },
    verification: [
      'read-exact-insight-and-active-tile',
      'read-exact-dashboard-with-one-matching-insight',
    ],
    effects: 'not-performed',
  }
}

/** No automatic recovery: preserve a known dashboard reference when a later phase is ambiguous. */
export function postHogDashboardHost(
  configuration: unknown,
  options: Parameters<typeof withDashboardHttp>[1],
): ProviderHost {
  const config = postHogDashboardConfig(configuration)
  return {
    invoke: async (call) => {
      let dashboardId: number | undefined,
        phase = 'project-read'
      const reference = () =>
        new URL(`project/${config.project}/dashboard/${dashboardId}`, config.baseUrl).href
      try {
        const plan = postHogDashboardPlan(config, call)
        return await withDashboardHttp(config, options, async (request) => {
          const project = await request(
            `api/organizations/${config.organization}/projects/${config.project}/`,
          )
          if (
            !isObject(project) ||
            project.id !== Number(config.project) ||
            project.organization !== config.organization ||
            project.timezone !== plan.projectCheck.timezone
          )
            return fail()
          const base = `api/projects/${config.project}/`
          phase = 'dashboard-create'
          const created = await request(`${base}dashboards/`, plan.dashboard.body)
          if (!isObject(created) || !Number.isSafeInteger(created.id) || Number(created.id) < 1)
            return fail()
          dashboardId = Number(created.id)
          if (
            created.team_id !== Number(config.project) ||
            created.deleted !== false ||
            created.name !== plan.dashboard.body.name ||
            created.description !== plan.dashboard.body.description
          )
            return fail()
          phase = 'insight-create'
          // The documented write field remains supported; verification uses non-deprecated dashboard_tiles.
          const insight = await request(`${base}insights/`, {
            ...plan.insight.body,
            dashboards: [dashboardId],
          })
          if (!isObject(insight) || !Number.isSafeInteger(insight.id) || Number(insight.id) < 1)
            return fail()
          phase = 'insight-read'
          const observed = await request(`${base}insights/${insight.id}/`)
          if (
            !isObject(observed) ||
            observed.id !== insight.id ||
            observed.deleted !== false ||
            observed.name !== plan.insight.body.name ||
            observed.description !== plan.insight.body.description ||
            contractDigest(observed.query) !== contractDigest(plan.insight.body.query) ||
            !Array.isArray(observed.dashboard_tiles) ||
            observed.dashboard_tiles.length !== 1
          )
            return fail()
          const tile = observed.dashboard_tiles[0]
          if (
            !isObject(tile) ||
            !Number.isSafeInteger(tile.id) ||
            Number(tile.id) < 1 ||
            tile.dashboard_id !== dashboardId ||
            tile.deleted !== false
          )
            return fail()
          phase = 'dashboard-read'
          const dashboard = await request(`${base}dashboards/${dashboardId}/`)
          if (
            !isObject(dashboard) ||
            dashboard.id !== dashboardId ||
            dashboard.team_id !== Number(config.project) ||
            dashboard.deleted !== false ||
            dashboard.is_shared !== false ||
            dashboard.name !== plan.dashboard.body.name ||
            dashboard.description !== plan.dashboard.body.description ||
            !emptyOverrides(dashboard.filters) ||
            !emptyOverrides(dashboard.variables) ||
            (dashboard.persisted_filters !== undefined &&
              !emptyOverrides(dashboard.persisted_filters)) ||
            (dashboard.persisted_variables !== undefined &&
              !emptyOverrides(dashboard.persisted_variables)) ||
            !Array.isArray(dashboard.tiles) ||
            dashboard.tiles.length !== 1
          )
            return fail()
          const attached = dashboard.tiles[0]
          if (
            !isObject(attached) ||
            attached.id !== tile.id ||
            (attached.deleted !== undefined && attached.deleted !== false) ||
            !isObject(attached.insight) ||
            attached.insight.id !== insight.id ||
            contractDigest(attached.insight.query) !== contractDigest(plan.insight.body.query)
          )
            return fail()
          return {
            status: 'succeeded' as const,
            ref: reference(),
            complete: true,
            revision: measurementDigest({
              artifact: config.artifactDigest,
              dashboard: dashboardId,
              insight: insight.id,
              tile: tile.id,
              query: plan.insight.body.query,
            }),
            body: JSON.stringify({
              createdRemotely: true,
              dashboardId,
              insightId: insight.id,
              artifactDigest: config.artifactDigest,
              queryVerified: false,
              trafficObserved: false,
            }),
          }
        })
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
          } satisfies OperationResult
        throw new Error(
          'PostHog creation or verification failed; inspect the retained launch intent and remote state; diagnostics omitted',
        )
      }
    },
  }
}
