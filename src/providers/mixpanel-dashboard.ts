import { isObject, validate } from '../config/schema.js'
import { contractDigest } from '../contracts/compatibility.js'
import { measurementDigest } from '../launch/measurement.js'
import { dashboardArtifact } from './dashboard-artifact.js'
import { withDashboardHttp } from './dashboard-http.js'
import type { OperationCall, ProviderHost } from './operations.js'
import schema from './schemas/mixpanel-dashboard-bridge-v1.json' with { type: 'json' }

interface MixpanelDashboardBridge {
  schema: 'wholeloop/mixpanel-dashboard-bridge@1'
  provider: 'mixpanel'
  baseUrl: string
  tokenEnv: string
  project: number
  workspace: number
  queryLanguage: 'native-report-json'
  windowBinding: 'reviewed-in-native-params'
  artifactDigest: string
}
const fail = (): never => {
  throw new Error('Invalid or unsupported metric-pinned Mixpanel creation; contents omitted')
}
const empty = (value: unknown) => value === null || (Array.isArray(value) && value.length === 0)
/** The App API has explicit results envelopes; never flatten arbitrary nested service objects. */
function appResult(value: unknown): unknown {
  for (let depth = 0; depth < 2 && isObject(value) && Object.hasOwn(value, 'results'); depth++) {
    const envelope = value
    if (
      Object.hasOwn(envelope, 'id') ||
      ['next', 'next_cursor', 'cursor'].some(
        (key) => envelope[key] !== undefined && envelope[key] !== null,
      )
    )
      return fail()
    value = envelope.results
  }
  return value
}
export function mixpanelDashboardConfig(value: unknown): MixpanelDashboardBridge {
  if (validate(value, schema).length) return fail()
  const config = value as MixpanelDashboardBridge
  if (
    !Number.isSafeInteger(config.project) ||
    !Number.isSafeInteger(config.workspace) ||
    !['https://mixpanel.com/', 'https://eu.mixpanel.com/', 'https://in.mixpanel.com/'].includes(
      config.baseUrl,
    )
  )
    return fail()
  return { ...config }
}

export function mixpanelDashboardPlan(configuration: unknown, call: OperationCall) {
  const config = mixpanelDashboardConfig(configuration),
    spec = dashboardArtifact(call, config.provider, config.artifactDigest),
    metric = spec.metric
  let report: unknown
  try {
    report = JSON.parse(metric.source.query)
  } catch {
    return fail()
  }
  if (
    metric.source.provider !== 'mixpanel' ||
    metric.source.operation !== 'source.product-analytics.query' ||
    !isObject(report) ||
    report.type !== 'insights' ||
    Object.keys(report).some((key) => !['type', 'params'].includes(key)) ||
    !isObject(report.params) ||
    !Object.keys(report.params).length ||
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
  const description = `Measurement: ${spec.metricRef}; source revision: ${spec.sourceRevision}; source digest: ${spec.sourceDigest}; artifact digest: ${config.artifactDigest}; unit ${metric.unit}; target ${metric.target.operator} ${metric.target.value}; expected window ${metric.window.days} days/${metric.window.timezone}. Native report time scope is owner-reviewed; query, rendering and traffic are unverified.`
  const base = `api/app/workspaces/${config.workspace}/`
  return {
    provider: config.provider,
    artifactDigest: config.artifactDigest,
    credentialEnv: config.tokenEnv,
    workspaceCheck: {
      method: 'GET',
      url: new URL(`api/app/projects/${config.project}/workspaces/public`, config.baseUrl).href,
      workspace: config.workspace,
      project: config.project,
    },
    dashboard: {
      method: 'POST',
      url: new URL(`${base}dashboards`, config.baseUrl).href,
      body: {
        title: spec.title,
        description,
        is_private: true,
        is_restricted: true,
        filters: [],
        breakdowns: [],
        time_filter: null,
      },
    },
    report: {
      method: 'POST',
      url: new URL(`${base}bookmarks`, config.baseUrl).href,
      body: {
        v: 2,
        name: metric.name,
        type: report.type,
        params: report.params,
        description,
        is_visibility_restricted: true,
        is_modification_restricted: true,
      },
      dashboardBinding: 'newly-created-dashboard-id',
    },
    verification: [
      'read-exact-bookmark-v2',
      'read-one-matching-dashboard-link',
      'read-private-dashboard-without-overrides',
    ],
    window: { ...metric.window, basis: config.windowBinding, verified: false },
    effects: 'not-performed',
  }
}

/** Explicit workspace scope and owned-report identity avoid guessing opaque dashboard contents. */
export function mixpanelDashboardHost(
  configuration: unknown,
  options: Parameters<typeof withDashboardHttp>[1],
): ProviderHost {
  const config = mixpanelDashboardConfig(configuration)
  return {
    invoke: async (call) => {
      let dashboardId: number | undefined,
        phase = 'workspace-read'
      const base = `api/app/workspaces/${config.workspace}/`,
        reference = () => new URL(`${base}dashboards/${dashboardId}`, config.baseUrl).href
      try {
        const plan = mixpanelDashboardPlan(config, call)
        return await withDashboardHttp(
          config,
          { ...options, authentication: 'bearer', readQuery: 'mixpanel-v2' },
          async (request) => {
            const workspaces = appResult(
              await request(`api/app/projects/${config.project}/workspaces/public`),
            )
            if (!Array.isArray(workspaces)) return fail()
            const matches = workspaces.filter(
              (entry) => isObject(entry) && entry.id === config.workspace,
            )
            const workspace = matches[0]
            if (
              matches.length !== 1 ||
              !isObject(workspace) ||
              workspace.project_id !== config.project ||
              workspace.is_visible === false
            )
              return fail()
            phase = 'dashboard-create'
            const created = appResult(await request(`${base}dashboards`, plan.dashboard.body))
            if (!isObject(created) || !Number.isSafeInteger(created.id) || Number(created.id) < 1)
              return fail()
            dashboardId = Number(created.id)
            if (created.title !== plan.dashboard.body.title) return fail()
            phase = 'report-create'
            const report = appResult(
              await request(`${base}bookmarks`, { ...plan.report.body, dashboard_id: dashboardId }),
            )
            if (!isObject(report) || !Number.isSafeInteger(report.id) || Number(report.id) < 1)
              return fail()
            phase = 'report-read'
            const observed = appResult(await request(`${base}bookmarks/${report.id}?v=2`))
            if (
              !isObject(observed) ||
              observed.id !== report.id ||
              observed.project_id !== config.project ||
              observed.dashboard_id !== dashboardId ||
              observed.include_in_dashboard !== true ||
              observed.name !== plan.report.body.name ||
              observed.type !== 'insights' ||
              observed.description !== plan.report.body.description ||
              contractDigest(observed.params) !== contractDigest(plan.report.body.params)
            )
              return fail()
            phase = 'attachment-read'
            const links = appResult(
              await request(`${base}dashboards/bookmarks/${report.id}/dashboard-ids`),
            )
            if (!Array.isArray(links) || links.length !== 1 || links[0] !== dashboardId)
              return fail()
            phase = 'dashboard-read'
            const dashboard = appResult(await request(`${base}dashboards/${dashboardId}`))
            if (
              !isObject(dashboard) ||
              dashboard.id !== dashboardId ||
              dashboard.title !== plan.dashboard.body.title ||
              dashboard.description !== plan.dashboard.body.description ||
              dashboard.is_private !== true ||
              dashboard.is_restricted !== true ||
              dashboard.is_shared_with_project !== false ||
              dashboard.num_active_public_links !== 0 ||
              !empty(dashboard.filters) ||
              !empty(dashboard.breakdowns) ||
              dashboard.time_filter !== null
            )
              return fail()
            return {
              status: 'succeeded' as const,
              ref: reference(),
              complete: true,
              revision: measurementDigest({
                artifact: config.artifactDigest,
                workspace: config.workspace,
                dashboard: dashboardId,
                report: report.id,
                params: observed.params,
              }),
              body: JSON.stringify({
                createdRemotely: true,
                dashboardId,
                reportId: report.id,
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
          'Mixpanel creation or verification failed; inspect the retained launch intent and remote state; diagnostics omitted',
        )
      }
    },
  }
}
