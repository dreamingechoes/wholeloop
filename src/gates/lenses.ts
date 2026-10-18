import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { isObject } from '../config/schema.js'
import { type CatalogOptions, loadCatalog } from '../extensions/catalog.js'
import { lensAdapter } from '../extensions/kinds.js'
import { BUILTIN_LENSES } from './builtins.js'

export interface GateUnit {
  id: string
  lens: string
  asks: string
  prompt: string
  failSafe: boolean
  origin: string
}
export interface GateInputs {
  paths: string[]
  languages: string[]
  slots: string[]
}

/** Only *, ** and ? are supported: a small deterministic path vocabulary, no shell. */
export function pathMatches(pattern: string, path: string): boolean {
  if (pattern.length > 512) throw new Error('Lens path pattern exceeds 512 characters')
  let expression = '^'
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i] ?? ''
    if (char === '*' && pattern[i + 1] === '*') {
      i++
      if (pattern[i + 1] === '/') {
        i++
        expression += '(?:.*/)?'
      } else expression += '.*'
    } else if (char === '*') expression += '[^/]*'
    else if (char === '?') expression += '[^/]'
    else expression += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`${expression}$`).test(path)
}

export function gateLenses(
  gate: 'verify' | 'review',
  config: Record<string, unknown>,
  options: CatalogOptions,
  inputs: GateInputs,
) {
  const catalog = loadCatalog(lensAdapter, options)
  if (catalog.problems.length) throw new Error('Resolve lens catalog problems before running gates')
  const settings = isObject(config.lenses) ? config.lenses : {}
  const disabled = isObject(settings.disable) ? settings.disable : {}
  const added = Array.isArray(settings.add) ? (settings.add as string[]) : []
  const ids = [
    ...new Set([...(gate === 'review' ? BUILTIN_LENSES.map(([id]) => id) : []), ...added]),
  ]
  const units: GateUnit[] = []
  const excluded: { id: string; reason: string }[] = []
  for (const id of ids) {
    const entry = catalog.entries.find(({ manifest }) => manifest.id === id)
    if (!entry) throw new Error(`Unknown configured lens: ${id}`)
    const lens = entry.manifest
    const builtin = BUILTIN_LENSES.find(([key]) => key === id)
    if (builtin && (lens.gate !== 'review' || lens['applies-when']))
      throw new Error('Built-in lens applicability cannot be narrowed; disable it with a reason')
    if (lens.gate !== gate) continue
    if (disabled[id]) {
      excluded.push({ id, reason: `Disabled: ${disabled[id]}` })
      continue
    }
    const when = lens['applies-when']
    const applies =
      !when ||
      Object.entries(when).every(([field, values]) =>
        values.some((value) =>
          field === 'paths'
            ? inputs.paths.some((path) => pathMatches(value, path))
            : inputs[field as 'languages' | 'slots'].includes(value),
        ),
      )
    if (!applies) {
      excluded.push({ id, reason: 'Not applicable to the pinned paths, languages and slots' })
      continue
    }
    units.push({
      id,
      lens: id,
      asks: lens.asks,
      prompt: entry.resources.prompt ? readFileSync(entry.resources.prompt, 'utf8') : lens.asks,
      failSafe: lens['fail-safe'] || !!builtin?.[2],
      origin: entry.origin,
    })
  }
  if (gate === 'review' && !units.length)
    throw new Error('A review gate needs at least one active lens')
  const policy = createHash('sha256')
    .update(
      JSON.stringify({
        gate,
        added,
        disabled,
        entries: catalog.entries.map((entry) => ({
          manifest: entry.manifest,
          prompt: entry.resources.prompt
            ? readFileSync(entry.resources.prompt, 'utf8')
            : entry.manifest.asks,
        })),
      }),
    )
    .digest('hex')
  return { units, excluded, policy }
}
