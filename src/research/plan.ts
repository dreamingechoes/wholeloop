// Builds the research plan from a question and the configured sources.
import { isObject } from '../config/schema.js'
import type { McpDeclaration } from '../providers/detect.js'
import { detectProvider } from '../providers/detect.js'
import type { Registry } from '../providers/load.js'
import { type ResearchPlan, validatePlan } from './contracts.js'

export function researchPlan(options: {
  subject: string
  run: string
  question: string
  owner: string
  configuration: Record<string, unknown>
  registry: Registry
  declarations: readonly McpDeclaration[]
  path?: string
}): ResearchPlan {
  if (options.registry.problems.length)
    throw new Error('Resolve provider registry problems before planning research')
  const providers = options.configuration.providers
  const configured =
    isObject(providers) && Array.isArray(providers.sources) ? (providers.sources as string[]) : []
  const research = options.configuration.research
  const verifiers =
    isObject(research) && typeof research.verifiers === 'number' ? research.verifiers : 3
  const angles = options.registry.providers
    .flatMap(({ manifest }) => {
      const detection = detectProvider(manifest, options.declarations, options.path)
      if (!configured.includes(manifest.id) && !detection.available) return []
      return manifest.capabilities
        .filter(
          (capability) =>
            capability.startsWith('source.') && manifest.operations[`${capability}.query`],
        )
        .map((capability) => ({
          id: `${manifest.id}:${capability}`,
          provider: manifest.id,
          capability,
          operation: `${capability}.query`,
          available: detection.available,
          evidence: detection.evidence,
        }))
    })
    .sort((a, b) => a.id.localeCompare(b.id))
  const plan = {
    schema: 'wholeloop/research-plan@1' as const,
    subject: options.subject,
    run: options.run,
    question: options.question,
    owner: options.owner,
    verifiers,
    refutations: Math.floor(verifiers / 2) + 1,
    angles,
    openQuestions: configured
      .filter((id) => !angles.some((angle) => angle.provider === id))
      .map((id) => ({
        question: `What evidence can ${id} provide?`,
        missing: 'Configured source has no validated query provider',
        who: options.owner,
      })),
  }
  validatePlan(plan)
  return plan
}
