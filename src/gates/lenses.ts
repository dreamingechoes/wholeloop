// Selects gate lenses for changed units with a small path-matching vocabulary.
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

/** Documentation the optional code lenses have nothing to say about. */
const DOCUMENTATION = [
  '**/*.md',
  '**/*.mdx',
  '**/*.markdown',
  '**/*.rst',
  '**/*.txt',
  'docs/**',
  '**/LICENSE',
  '**/LICENSE.*',
]
export const TINY_CHANGE_LINES = 10
/**
 * Optional built-in lenses apply by change size and paths (ADR-0258, point 1). Mandatory lenses
 * never reach this: they always run. An empty or unmeasured change keeps every lens.
 */
export function optionalLensExclusion(
  id: string,
  inputs: GateInputs,
  lines: number | undefined,
): string | undefined {
  if (!inputs.paths.length) return undefined
  if (
    ['design-fit', 'performance', 'simplicity'].includes(id) &&
    inputs.paths.every((path) => DOCUMENTATION.some((pattern) => pathMatches(pattern, path)))
  )
    return 'Not applicable: only documentation changed'
  if (
    ['change-shape', 'simplicity'].includes(id) &&
    inputs.paths.length === 1 &&
    lines !== undefined &&
    lines <= TINY_CHANGE_LINES
  )
    return `Not applicable: ${lines} changed line${lines === 1 ? '' : 's'} in one file`
  return undefined
}

export function gateLenses(
  gate: 'verify' | 'review',
  config: Record<string, unknown>,
  options: CatalogOptions,
  inputs: GateInputs,
  change: { lines?: number | undefined; rigor?: 'quick' | 'standard' | 'deep' } = {},
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
    const optional = !(lens['fail-safe'] || builtin?.[2])
    // Quick skips every optional lens; size and path rules apply to optional built-ins only,
    // because an extension lens declares its own applicability.
    const reason =
      optional && change.rigor === 'quick'
        ? 'Skipped: quick rigor was chosen for this run'
        : optional && builtin
          ? optionalLensExclusion(id, inputs, change.lines)
          : undefined
    if (reason) {
      excluded.push({ id, reason })
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
