// Collects conformance runs for exact observed client versions.
import { realpathSync, statSync } from 'node:fs'
import { delimiter, dirname, join, resolve } from 'node:path'
import { openCodeMajor } from '../adapters/opencode-version.js'
import { isObject, validate } from '../config/schema.js'
import type { ConformanceContext } from './contracts.js'
import { prepareConformance } from './prepare.js'
import { conformanceBinary } from './recipes.js'
import { runConformance } from './run.js'
import collectionSchema from './schemas/collection-v1.json' with { type: 'json' }

export interface CollectionEntry {
  cli: string
  channel: 'pinned' | 'latest'
  pin: string
}

/** Resolve no moving aliases here: the host supplies exact observed versions before collection. */
export function conformanceCollection(input: unknown): CollectionEntry[] {
  if (isObject(input) && Array.isArray(input.entries) && input.entries.length > 14)
    throw new Error('Conformance collection supports at most fourteen entries')
  if (validate(input, collectionSchema).length)
    throw new Error('Invalid wholeloop/conformance-collection@1 plan; contents omitted')
  const entries = (input as { entries: CollectionEntry[] }).entries
  const seen = new Set<string>()
  for (const entry of entries) {
    if (entry.pin.length > 128 || entry.pin.trim() !== entry.pin)
      throw new Error('Conformance version pin must be exact and at most 128 characters')
    const key = `${entry.cli}/${entry.channel}`
    if (seen.has(key)) throw new Error('Duplicate CLI/channel collection entry')
    seen.add(key)
  }
  return entries.map((entry) => ({ ...entry }))
}

/** Run fresh fixtures sequentially; a native failure remains evidence and never stops another entry. */
export async function collectConformance(
  context: ConformanceContext,
  input: unknown,
  mode: 'fixture' | 'live',
  options: {
    binRoot?: string
    timeoutMs?: number
    signal?: AbortSignal
    env?: NodeJS.ProcessEnv
  } = {},
) {
  const entries = conformanceCollection(input)
  const timeoutMs = options.timeoutMs ?? 180_000
  if (
    !['fixture', 'live'].includes(mode) ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 100 ||
    timeoutMs > 600_000 ||
    (mode === 'fixture' && options.binRoot !== undefined) ||
    (mode === 'live' && !options.binRoot)
  )
    throw new Error(
      'Choose explicit fixture or live collection; live requires --bin-root and a bounded timeout',
    )
  const environment = options.env ?? process.env
  for (const entry of entries) if (entry.cli === 'opencode') openCodeMajor(entry.pin)
  // Preflight every selected native path before creating the first fixture. Missing clients
  // must not silently fall back to a global executable and masquerade as another channel.
  const paths = entries.map((entry) => {
    if (mode === 'fixture') return undefined
    try {
      const bin = realpathSync(resolve(options.binRoot ?? '', entry.cli, entry.channel, 'bin'))
      const binary = realpathSync(join(bin, conformanceBinary(entry.cli)))
      const stat = statSync(binary)
      if (!stat.isFile() || !(stat.mode & 0o111)) throw new Error()
      return bin
    } catch {
      throw new Error(
        'Provide every selected native client/channel executable before collection; diagnostics omitted',
      )
    }
  })
  const runs = []
  for (const [index, entry] of entries.entries()) {
    if (options.signal?.aborted) break
    const prepared = prepareConformance(context, entry.cli, entry.pin)
    const bin = paths[index]
    const report = await runConformance(context, prepared.id, mode, {
      timeoutMs,
      ...(options.signal ? { signal: options.signal } : {}),
      env: {
        ...environment,
        PATH: [bin, dirname(process.execPath), environment.PATH].filter(Boolean).join(delimiter),
      },
    })
    // Keep the opaque initiative ID required for successful observations, never paths or draft contents.
    const { journal: _journal, ...evidence } = report
    runs.push({ channel: entry.channel, observedAt: new Date().toISOString(), report: evidence })
  }
  return {
    schema: 'wholeloop/conformance-results@1',
    status: options.signal?.aborted ? 'cancelled' : 'completed',
    mode,
    planned: entries.length,
    runs,
    limitations: [
      'Exact versions and native binary provisioning are supplied by the host; collection does not resolve or install latest.',
      'Fixture results remain simulation. Live framing does not establish hooks, permissions, MCP behavior or semantic quality.',
      'Native client trust/authentication and external effects require explicit owner setup; collection grants no permission bypass.',
    ],
  }
}
