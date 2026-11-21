// Repository guidance for impact reports.

import { isObject } from '../config/schema.js'
import { guidanceText } from '../discovery/content.js'
import { resolveSlot } from '../discovery/resolve.js'
import { discover } from '../discovery/tree.js'
import type { FlowEngine } from '../flow/engine.js'
import { measurementDigest } from '../launch/measurement.js'

export function impactGuidance(engine: FlowEngine, subject?: string, run?: string) {
  const inventory = discover(engine.root, engine.store.files, engine.home)
  const slots = engine.config(subject, 'measure-impact', run).slots
  const binding = resolveSlot('learn.report', inventory.repo, {
    user: inventory.user,
    ...(isObject(slots) && typeof slots['learn.report'] === 'string'
      ? { binding: slots['learn.report'] }
      : {}),
  })
  const selected = binding.selected
  if (!selected) throw new Error('Resolve learn.report before measuring impact')
  let content =
    'Show each pinned metric, baseline, target, observed value, verdict and exact query/source/window; keep qualitative quotes separate and missing observations unknown.'
  if (selected.ref !== 'default') {
    const text = guidanceText(engine.root, engine.home, selected)
    if (text === undefined)
      throw new Error('Impact report guidance must be a readable local file under 1 MiB')
    content = text
    if (!content.trim()) throw new Error('Impact report guidance needs meaningful instructions')
  }
  return { ref: selected.ref, origin: selected.origin, digest: measurementDigest(content), content }
}
