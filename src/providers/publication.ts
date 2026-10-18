import { loadExtensionOptions } from '../config/load.js'
import { isObject } from '../config/schema.js'
import { loadProviders, resolveProvider } from '../providers/load.js'

/** Local destinations already are the core item and artifact; avoid duplicate copies. */
export function publicationPlan(
  root: string,
  userFile: string,
  configuration: Record<string, unknown>,
  subject: string,
  artifact: string,
) {
  const registry = loadProviders(loadExtensionOptions({ root, userFile }))
  if (registry.problems.length)
    throw new Error('Resolve provider registry problems before publishing artifacts')
  return Object.fromEntries(
    ['docs', 'tracker'].map((capability) => {
      const operation = capability === 'docs' ? 'docs.create' : 'tracker.create-item'
      const configured =
        isObject(configuration.providers) && typeof configuration.providers[capability] === 'string'
          ? configuration.providers[capability]
          : undefined
      const provider = resolveProvider(registry, operation, configured)
      return [
        capability,
        {
          provider: provider.manifest.id,
          operation,
          status: provider.manifest.access.local ? ('stored' as const) : ('pending' as const),
          ref: capability === 'docs' ? artifact : subject,
          ...(provider.manifest.access.local
            ? {}
            : {
                handoff:
                  'The local artifact is ready; execute the provider operation in the host and record its external link.',
              }),
        },
      ]
    }),
  )
}
