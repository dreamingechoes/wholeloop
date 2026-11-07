// The built-in provider manifests and guidance bundled into the CLI.
import catalog from './catalog.json' with { type: 'json' }
import { validateProvider } from './manifest.js'

export const BUILTIN_GUIDANCE: Record<string, Record<string, string>> = Object.fromEntries(
  catalog.map((entry) => [entry.manifest.id, entry.guidance]),
)
export const BUILTINS = catalog.map(({ manifest: value }) => {
  validateProvider(value)
  return value
})
