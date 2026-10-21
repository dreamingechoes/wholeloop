import { isObject } from '../config/schema.js'
import type { withDashboardHttp } from './dashboard-http.js'
import { grafanaDashboardHost, grafanaDashboardPlan } from './grafana-dashboard.js'
import { metabaseDashboardHost, metabaseDashboardPlan } from './metabase-dashboard.js'
import { mixpanelDashboardHost, mixpanelDashboardPlan } from './mixpanel-dashboard.js'
import type { OperationCall } from './operations.js'
import { postHogDashboardHost, postHogDashboardPlan } from './posthog-dashboard.js'

/** Selecting a host is explicit; ordinary rollout handoffs never gain remote write authority. */
export function dashboardBridge(configuration: unknown) {
  if (isObject(configuration) && configuration.schema === 'wholeloop/posthog-dashboard-bridge@1')
    return {
      plan: (call: OperationCall) => postHogDashboardPlan(configuration, call),
      host: (options: Parameters<typeof withDashboardHttp>[1]) =>
        postHogDashboardHost(configuration, options),
    }
  if (isObject(configuration) && configuration.schema === 'wholeloop/metabase-dashboard-bridge@1')
    return {
      plan: (call: OperationCall) => metabaseDashboardPlan(configuration, call),
      host: (options: Parameters<typeof withDashboardHttp>[1]) =>
        metabaseDashboardHost(configuration, options),
    }
  if (isObject(configuration) && configuration.schema === 'wholeloop/mixpanel-dashboard-bridge@1')
    return {
      plan: (call: OperationCall) => mixpanelDashboardPlan(configuration, call),
      host: (options: Parameters<typeof withDashboardHttp>[1]) =>
        mixpanelDashboardHost(configuration, options),
    }
  return {
    plan: (call: OperationCall) => grafanaDashboardPlan(configuration, call),
    host: (options: Parameters<typeof withDashboardHttp>[1]) =>
      grafanaDashboardHost(configuration, options),
  }
}
