import { CliError } from '../cli/errors.js'
import { loadExtensionOptions } from '../config/load.js'
import { isObject } from '../config/schema.js'
import { loadCatalog } from '../extensions/catalog.js'
import { templateAdapter } from '../extensions/kinds.js'
import { SPEC_SECTIONS } from './contract.js'

export interface SpecTemplate {
  kind: 'repository' | 'manifest'
  ref: string
  sections: string[]
  content?: string
}
export function specTemplate(
  root: string,
  userFile: string,
  configuration: Record<string, unknown>,
  binding?: { ref: string; origin: string } | null,
): SpecTemplate {
  if (binding && binding.origin !== 'harness')
    return { kind: 'repository', ref: binding.ref, sections: [...SPEC_SECTIONS] }
  const catalog = loadCatalog(templateAdapter, loadExtensionOptions({ root, userFile }))
  if (catalog.problems.length)
    throw new CliError(
      catalog.problems.map(({ file, message }) => `${file}: ${message}`).join('\n'),
    )
  const id =
    isObject(configuration.templates) && typeof configuration.templates.spec === 'string'
      ? configuration.templates.spec
      : 'spec'
  const entry = catalog.entries.find(({ manifest }) => manifest.id === id)
  if (!entry) throw new CliError(`Unknown spec template: ${id}`)
  return {
    kind: 'manifest',
    ref: entry.origin,
    sections: [...new Set([...SPEC_SECTIONS, ...entry.manifest.sections.required])],
    content: entry.manifest.content,
  }
}
