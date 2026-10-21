import { isObject, validate } from '../config/schema.js'
import { contractDigest } from '../contracts/compatibility.js'
import { measurementDigest } from '../launch/measurement.js'
import measurementSchema from '../launch/schemas/measurement-v1.json' with { type: 'json' }
import type { Metric } from '../spec/contract.js'
import type { OperationCall } from './operations.js'

interface LaunchDashboardSpec {
  schema: 'wholeloop/launch-dashboard@1'
  title: string
  metricRef: string
  sourceRevision: string
  sourceDigest: string
  metric: Metric
}
/** Match the exact completed artifact at every service boundary before resolving credentials. */
export function dashboardArtifact(
  call: OperationCall,
  provider: string,
  artifactDigest: string,
): LaunchDashboardSpec {
  const fail = (): never => {
    throw new Error('Invalid metric-pinned dashboard artifact; contents omitted')
  }
  if (
    call.provider !== provider ||
    call.operation !== 'dashboards.create' ||
    call.tool !== 'wholeloop.dashboard.handoff' ||
    Object.keys(call.args).some(
      (key) => !['title', 'body', 'artifact', 'measurementEntry', 'dashboard'].includes(key),
    ) ||
    typeof call.args.body !== 'string' ||
    measurementDigest(call.args.body) !== artifactDigest ||
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
  return spec as unknown as LaunchDashboardSpec
}

/** Canonical deployment prefixes keep all generated requests and references in one service. */
export function dashboardBaseUrl(baseUrl: string) {
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    throw new Error('Invalid dashboard HTTPS base; contents omitted')
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.href !== baseUrl ||
    !baseUrl.endsWith('/') ||
    baseUrl.length > 2048
  )
    throw new Error('Invalid dashboard HTTPS base; contents omitted')
}
