// Repository guidance for learning decisions.
import { isAbsolute, join } from 'node:path'
import { isObject } from '../config/schema.js'
import { resolveSlot } from '../discovery/resolve.js'
import { discover } from '../discovery/tree.js'
import type { FlowEngine } from '../flow/engine.js'
import { readRegularText } from '../fs/regular-file.js'
import { measurementDigest } from '../launch/measurement.js'
import { canonicalPath, inside } from '../state/paths.js'

export function learningGuidance(engine: FlowEngine) {
  const inventory = discover(engine.root, engine.store.files, engine.home)
  const slots = engine.config().slots
  const binding = resolveSlot('learn.decision', inventory.repo, {
    user: inventory.user,
    ...(isObject(slots) && typeof slots['learn.decision'] === 'string'
      ? { binding: slots['learn.decision'] }
      : {}),
  })
  const selected = binding.selected
  if (!selected || binding.questions.length)
    throw new Error('Resolve learn.decision before recording the decision')
  let content =
    'Show the original promise, measured or self-reported evidence, strongest opposing argument, explicit person/reason, pending checkpoints and proposed follow-up.'
  if (selected.origin !== 'harness') {
    const base = selected.origin === 'user' ? engine.home : engine.root
    const file = canonicalPath(isAbsolute(selected.ref) ? selected.ref : join(base, selected.ref))
    // The canonical path is checked, then read through one descriptor that refuses a link
    // swapped in after the check.
    const text = inside(canonicalPath(base), file) ? readRegularText(file, 1024 * 1024) : undefined
    if (text === undefined)
      throw new Error('Learning decision guidance must be a readable local file under 1 MiB')
    content = text
    if (!content.trim()) throw new Error('Learning decision guidance needs meaningful instructions')
  }
  return { ref: selected.ref, origin: selected.origin, digest: measurementDigest(content), content }
}
