// Stores explicit run-scoped guidance as external configuration, separate from project/user files.

import { isObject } from '../config/schema.js'
import type { StoreFiles } from '../state/files.js'
import { canonicalPath } from '../state/paths.js'
import { knownSlot } from './rules.js'

export const validGuidanceRun = (run: string) => /^(?:run|gate)-[a-f0-9]{16}$/.test(run)

function location(run: string) {
  if (!validGuidanceRun(run)) throw new Error('Use a run ID returned by step begin or a gate plan')
  return `config/run-guidance/${run}.json`
}

export function runGuidance(files: StoreFiles, root: string, run: string): Record<string, string> {
  const content = files.read(location(run))
  if (content === undefined) return {}
  const value: unknown = JSON.parse(content)
  if (
    !isObject(value) ||
    value.schema !== 'wholeloop/run-guidance@1' ||
    value.run !== run ||
    value.repository !== canonicalPath(root) ||
    !isObject(value.slots) ||
    Object.keys(value).some((key) => !['schema', 'run', 'repository', 'slots'].includes(key)) ||
    !Object.entries(value.slots).every(
      ([slot, ref]) => knownSlot(slot) && typeof ref === 'string' && ref.trim(),
    )
  )
    throw new Error('Invalid or foreign run guidance; contents omitted')
  return value.slots as Record<string, string>
}

export function rememberRunGuidance(
  files: StoreFiles,
  root: string,
  run: string,
  slot: string,
  value: string,
) {
  if (!knownSlot(slot) || !value.trim()) throw new Error('Invalid run guidance choice')
  const file = location(run)
  files.locked(() => {
    const slots = runGuidance(files, root, run)
    if (slots[slot] === value) return
    files.atomic(
      file,
      `${JSON.stringify({ schema: 'wholeloop/run-guidance@1', run, repository: canonicalPath(root), slots: { ...slots, [slot]: value } })}\n`,
    )
  })
  return files.path(file)
}
