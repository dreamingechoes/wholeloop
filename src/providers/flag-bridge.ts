import { isObject, validate } from '../config/schema.js'
import { measurementDigest } from '../launch/measurement.js'
import { growthBookFlag } from './growthbook.js'
import type { ProviderHost } from './operations.js'
import schema from './schemas/flag-bridge-v1.json' with { type: 'json' }
import { unleashFlag } from './unleash.js'

export interface FlagBridge {
  schema: 'wholeloop/flag-bridge@1'
  provider: string
  baseUrl: string
  project: string
  tokenEnv: string
}
const identifier = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const fail = (): never => {
  throw new Error('Incomplete or complex flag configuration; exposure remains unknown')
}

export function flagBridgeConfig(value: unknown): FlagBridge {
  if (validate(value, schema).length)
    throw new Error('Invalid non-secret flag bridge configuration; contents omitted')
  const input = value as FlagBridge
  let url: URL
  try {
    url = new URL(input.baseUrl)
  } catch {
    throw new Error('Use a valid non-secret HTTPS base URL; contents omitted')
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    input.baseUrl.length > 2048 ||
    url.href !== input.baseUrl ||
    !input.baseUrl.endsWith('/') ||
    !identifier.test(input.project) ||
    !/^[A-Z][A-Z0-9_]{0,127}$/.test(input.tokenEnv)
  )
    throw new Error(
      'Use an explicit canonical HTTPS base URL, project and credential environment reference',
    )
  if (
    input.provider === 'launchdarkly' &&
    !['https://app.launchdarkly.com/', 'https://app.eu.launchdarkly.com/'].includes(input.baseUrl)
  )
    throw new Error('Select the official US or EU LaunchDarkly REST origin')
  return { ...input }
}

/** A plan resolves no credential and performs no request. Service implementations are explicit. */
export function flagReadPlan(configuration: unknown, flag: string, environment: string) {
  const config = flagBridgeConfig(configuration)
  if (!identifier.test(flag) || !identifier.test(environment))
    throw new Error('Use bounded exact flag/environment identifiers')
  let path: string
  if (config.provider === 'launchdarkly')
    path = `api/v2/flags/${encodeURIComponent(config.project)}/${encodeURIComponent(flag)}`
  else if (config.provider === 'unleash')
    path = `api/admin/projects/${encodeURIComponent(config.project)}/features/${encodeURIComponent(flag)}`
  else if (config.provider === 'growthbook') path = `v1/features/${encodeURIComponent(flag)}`
  else throw new Error('This flag service bridge is not implemented')
  const url = new URL(path, config.baseUrl)
  if (config.provider === 'launchdarkly') url.searchParams.set('env', environment)
  else if (config.provider === 'unleash') url.searchParams.set('variantEnvironments', 'true')
  return {
    schema: 'wholeloop/flag-read@1',
    status: 'planned',
    provider: config.provider,
    flag,
    environment,
    request: { method: 'GET', url: url.href, credentialEnv: config.tokenEnv },
    effects: 'not-performed',
  }
}

/** Normalize only unrestricted boolean user rollout; never invent a cohort or evaluate targeting. */
export function launchDarklyFlag(value: unknown, flag: string, environment: string) {
  if (
    !isObject(value) ||
    value.key !== flag ||
    value.kind !== 'boolean' ||
    value.archived !== false ||
    !Array.isArray(value.variations) ||
    value.variations.length !== 2 ||
    !value.variations.every((entry) => isObject(entry) && typeof entry.value === 'boolean') ||
    new Set(value.variations.map((entry) => (entry as { value: boolean }).value)).size !== 2 ||
    !isObject(value.environments) ||
    !Object.hasOwn(value.environments, environment)
  )
    return fail()
  const selected = value.environments[environment]
  if (
    !isObject(selected) ||
    typeof selected.on !== 'boolean' ||
    selected.archived === true ||
    !Number.isSafeInteger(selected.version) ||
    Number(selected.version) < 1 ||
    !['targets', 'contextTargets', 'rules', 'prerequisites'].every(
      (field) => Array.isArray(selected[field]) && selected[field].length === 0,
    ) ||
    !isObject(selected.fallthrough)
  )
    return fail()
  const variations = value.variations as { value: boolean }[]
  const indexValue = (index: unknown) => {
    if (!Number.isInteger(index) || (index !== 0 && index !== 1)) return fail()
    return variations[Number(index)]?.value ?? fail()
  }
  // An off variation serving true would make enabled=false/exposure=0 a false observation.
  if (indexValue(selected.offVariation) !== false) return fail()
  const fallthrough = selected.fallthrough
  let exposure: number
  if (Object.hasOwn(fallthrough, 'variation') && !Object.hasOwn(fallthrough, 'rollout')) {
    exposure = indexValue(fallthrough.variation) ? 100 : 0
  } else if (!Object.hasOwn(fallthrough, 'variation') && isObject(fallthrough.rollout)) {
    const rollout = fallthrough.rollout
    if (
      (rollout.kind !== undefined && rollout.kind !== 'rollout') ||
      (rollout.contextKind !== undefined && rollout.contextKind !== 'user') ||
      (rollout.bucketBy !== undefined && rollout.bucketBy !== 'key') ||
      !Array.isArray(rollout.variations) ||
      rollout.variations.length !== 2
    )
      return fail()
    let total = 0,
      exposed = 0
    const seen = new Set<unknown>()
    for (const entry of rollout.variations) {
      if (
        !isObject(entry) ||
        !Number.isSafeInteger(entry.weight) ||
        Number(entry.weight) < 0 ||
        Number(entry.weight) > 100000 ||
        seen.has(entry.variation) ||
        entry.untracked === true
      )
        return fail()
      seen.add(entry.variation)
      total += Number(entry.weight)
      if (indexValue(entry.variation)) exposed += Number(entry.weight)
    }
    if (total !== 100000) return fail()
    exposure = exposed / 1000
  } else return fail()
  const observation = {
    flag,
    environment,
    enabled: selected.on,
    exposure: selected.on ? exposure : 0,
    audience: 'all',
  }
  return {
    observation,
    revision: measurementDigest({ observation, version: selected.version, fallthrough }),
  }
}

/** Read-only REST transport. The supplied host resolves credentials from its own store. */
export function remoteFlagHost(
  configuration: unknown,
  options: {
    secret: (name: string) => string | undefined | Promise<string | undefined>
    fetch?: typeof globalThis.fetch
    signal?: AbortSignal
  },
): ProviderHost {
  const config = flagBridgeConfig(configuration)
  return {
    invoke: async (call) => {
      let cleanup = () => {}
      try {
        if (
          call.provider !== config.provider ||
          call.operation !== 'flags.read-state' ||
          call.tool !== 'wholeloop.flags.read-state' ||
          typeof call.args.flag !== 'string' ||
          typeof call.args.environment !== 'string' ||
          Object.keys(call.args).some((key) => !['flag', 'environment', 'service'].includes(key)) ||
          (call.args.service !== undefined && call.args.service !== config.provider)
        )
          throw new Error()
        const plan = flagReadPlan(config, call.args.flag, call.args.environment)
        options.signal?.throwIfAborted()
        const credential = await options.secret(config.tokenEnv)
        if (
          !credential ||
          credential.length > 8192 ||
          credential.trim() !== credential ||
          /[\r\n]/.test(credential)
        )
          throw new Error()
        options.signal?.throwIfAborted()
        // AbortSignal.any requires Node 20.3; the published core also supports 20.0.
        // Release both subscriptions on every outcome instead of retaining host signals.
        const controller = new AbortController(),
          timeout = AbortSignal.timeout(10000)
        const abort = () => controller.abort()
        options.signal?.addEventListener('abort', abort, { once: true })
        timeout.addEventListener('abort', abort, { once: true })
        cleanup = () => {
          options.signal?.removeEventListener('abort', abort)
          timeout.removeEventListener('abort', abort)
        }
        const signal = controller.signal
        const response = await (options.fetch ?? globalThis.fetch)(plan.request.url, {
          method: 'GET',
          headers: {
            Authorization: config.provider === 'growthbook' ? `Bearer ${credential}` : credential,
            Accept: 'application/json',
          },
          redirect: 'error',
          credentials: 'omit',
          signal,
        })
        if (
          response.status !== 200 ||
          response.redirected ||
          !response.body ||
          !/^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? '')
        ) {
          await response.body?.cancel()
          throw new Error()
        }
        const chunks: Uint8Array[] = []
        let bytes = 0
        for await (const chunk of response.body) {
          bytes += chunk.length
          if (bytes > 1024 * 1024) throw new Error()
          chunks.push(chunk)
        }
        const raw: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        const result =
          config.provider === 'growthbook'
            ? growthBookFlag(raw, call.args.flag, call.args.environment, config.project)
            : config.provider === 'unleash'
              ? unleashFlag(raw, call.args.flag, call.args.environment, config.project)
              : launchDarklyFlag(raw, call.args.flag, call.args.environment)
        const ref = new URL(plan.request.url)
        ref.search = ''
        return {
          status: 'succeeded',
          ref: ref.href,
          complete: true,
          revision: result.revision,
          body: JSON.stringify(result.observation),
        }
      } catch {
        throw new Error(
          'Flag service read failed or configuration is unsupported; state remains unknown; diagnostics omitted',
        )
      } finally {
        cleanup()
      }
    },
  }
}
