// Repository guidance for learning decisions.

import { isObject } from '../config/schema.js'
import { guidanceText } from '../discovery/content.js'
import { resolveSlot } from '../discovery/resolve.js'
import { discover } from '../discovery/tree.js'
import type { FlowEngine } from '../flow/engine.js'
import { measurementDigest } from '../launch/measurement.js'

export function learningGuidance(engine: FlowEngine, subject?: string, run?: string) {
  const inventory = discover(engine.root, engine.store.files, engine.home)
  const slots = engine.config(subject, 'decide-next', run).slots
  const binding = resolveSlot('learn.decision', inventory.repo, {
    user: inventory.user,
    ...(isObject(slots) && typeof slots['learn.decision'] === 'string'
      ? { binding: slots['learn.decision'] }
      : {}),
  })
  const selected = binding.selected
  if (!selected) throw new Error('Resolve learn.decision before recording the decision')
  let content =
    'Show the original promise, measured or self-reported evidence, strongest opposing argument, explicit person/reason, pending checkpoints and proposed follow-up.'
  if (selected.ref !== 'default') {
    const text = guidanceText(engine.root, engine.home, selected)
    if (text === undefined)
      throw new Error('Learning decision guidance must be a readable local file under 1 MiB')
    content = text
    if (!content.trim()) throw new Error('Learning decision guidance needs meaningful instructions')
  }
  return { ref: selected.ref, origin: selected.origin, digest: measurementDigest(content), content }
}
