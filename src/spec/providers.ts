// Validates measurement providers before completion; detection offers choices, never source authority.
import { loadExtensionOptions } from '../config/load.js'
import { GUIDANCE_CLIENTS, guidanceClient } from '../discovery/clients.js'
import { detectMcpByClient } from '../providers/detect.js'
import { loadProviders, type Registry } from '../providers/load.js'
import { type SourceCandidate, sourceCandidates } from '../providers/source-access.js'
import { TAXONOMY } from '../providers/taxonomy.js'
import type { Metric } from './contract.js'

export function metricRegistry(root: string, userFile: string): Registry {
  return loadProviders(loadExtensionOptions({ root, userFile }))
}

export function metricProviderProblem(
  registry: Registry,
  provider: string,
  operation: string,
): string | undefined {
  const manifest = registry.providers.find((entry) => entry.manifest.id === provider)?.manifest,
    capability = operation.slice(0, operation.lastIndexOf('.'))
  if (!manifest) return `unknown provider ${provider}`
  if (
    !manifest.capabilities.some((entry) => entry === capability) ||
    !manifest.operations[operation]
  )
    return `provider ${provider} does not offer ${operation}`
  return undefined
}

export function checkMetricProviders(
  metrics: readonly Metric[],
  registry: Registry,
  candidates?: readonly SourceCandidate[],
) {
  const problems: string[] = registry.problems.map(
      ({ file, message }) => `Provider registry ${file}: ${message}`,
    ),
    warnings: string[] = []
  for (const metric of metrics) {
    const problem = metricProviderProblem(registry, metric.source.provider, metric.source.operation)
    if (problem) problems.push(`Metric ${metric.id}: ${problem}`)
    else if (
      candidates &&
      !candidates.some(
        (candidate) => candidate.id === metric.source.provider && candidate.available,
      )
    )
      warnings.push(
        `Metric ${metric.id}: ${metric.source.provider} is not detected in the current client; tool access and authentication remain unverified`,
      )
  }
  return { problems, warnings }
}

export function metricSourceContext(options: {
  root: string
  userFile: string
  home: string
  client?: string | undefined
  env?: NodeJS.ProcessEnv
  path?: string
}) {
  const declared = guidanceClient(),
    client = declared ?? options.client
  if (options.client && !GUIDANCE_CLIENTS.some((entry) => entry === options.client))
    throw new Error('Unknown measurement client')
  if (declared && options.client && declared !== options.client)
    throw new Error('The measurement client must match the executing adapter')
  const registry = metricRegistry(options.root, options.userFile)
  if (registry.problems.length)
    throw new Error('Resolve provider registry problems before choosing measurement tools')
  const detected = detectMcpByClient(options.root, options.home, options.env ?? process.env)
  if (detected.problems.some((problem) => problem.target === client))
    throw new Error(
      'Resolve MCP configuration problems in the current client before choosing measurement tools',
    )
  return {
    registry,
    client: client ?? 'unknown',
    ...sourceCandidates({
      registry,
      declarations: detected.declarations,
      client,
      ...(options.path === undefined ? {} : { path: options.path }),
    }),
  }
}

export function metricProviderOffers(
  context: ReturnType<typeof metricSourceContext>,
  answers: Readonly<Record<string, string>>,
) {
  return {
    client: context.client,
    capabilities: Object.keys(TAXONOMY)
      .filter((capability) => capability.startsWith('source.'))
      .map((capability) => {
        const providers = context.candidates.filter((candidate) =>
            candidate.capabilities.some((entry) => entry === capability),
          ),
          preferred = answers[`metric:${capability}`]
        return {
          capability,
          providers,
          selected: preferred && providers.some(({ id }) => id === preferred) ? preferred : null,
          ...(preferred && !providers.some(({ id }) => id === preferred)
            ? {
                warning: `Remembered provider ${preferred} no longer offers ${capability}; choose again`,
              }
            : {}),
        }
      }),
    unusable: context.unusable,
  }
}

export function checkMetricChoice(registry: Registry, qid: string, provider: string): void {
  const capability = qid.slice('metric:'.length)
  if (!capability.startsWith('source.') || !Object.hasOwn(TAXONOMY, capability))
    throw new Error('Choose a registered source capability for the metric')
  const problems = registry.problems.length
    ? 'Resolve provider registry problems before choosing measurement tools'
    : metricProviderProblem(registry, provider, `${capability}.query`)
  if (problems) throw new Error(problems)
}
