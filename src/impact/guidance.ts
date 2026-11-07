// Repository guidance for impact reports.
import { readFileSync, statSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { isObject } from '../config/schema.js'
import { resolveSlot } from '../discovery/resolve.js'
import { discover } from '../discovery/tree.js'
import type { FlowEngine } from '../flow/engine.js'
import { measurementDigest } from '../launch/measurement.js'
import { canonicalPath, inside } from '../state/paths.js'

export function impactGuidance(engine: FlowEngine) {
  const inventory = discover(engine.root, engine.store.files, engine.home)
  const slots = engine.config().slots
  const binding = resolveSlot('learn.report', inventory.repo, {
    user: inventory.user,
    ...(isObject(slots) && typeof slots['learn.report'] === 'string'
      ? { binding: slots['learn.report'] }
      : {}),
  })
  const selected = binding.selected
  if (!selected || binding.questions.length)
    throw new Error('Resolve learn.report before measuring impact')
  let content =
    'Show each pinned metric, baseline, target, observed value, verdict and exact query/source/window; keep qualitative quotes separate and missing observations unknown.'
  if (selected.origin !== 'harness') {
    const base = selected.origin === 'user' ? engine.home : engine.root
    const file = canonicalPath(isAbsolute(selected.ref) ? selected.ref : join(base, selected.ref))
    if (
      !inside(canonicalPath(base), file) ||
      !statSync(file).isFile() ||
      statSync(file).size > 1024 * 1024
    )
      throw new Error('Impact report guidance must be a readable local file under 1 MiB')
    content = readFileSync(file, 'utf8')
    if (!content.trim()) throw new Error('Impact report guidance needs meaningful instructions')
  }
  return { ref: selected.ref, origin: selected.origin, digest: measurementDigest(content), content }
}
