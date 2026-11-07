// Repository guidance for launch drafts.
import { readFileSync, statSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { isObject } from '../config/schema.js'
import { resolveSlot } from '../discovery/resolve.js'
import { discover } from '../discovery/tree.js'
import type { FlowEngine } from '../flow/engine.js'
import { canonicalPath, inside } from '../state/paths.js'
import type { LaunchGuidance } from './contracts.js'
import { measurementDigest } from './measurement.js'

export function launchGuidance(engine: FlowEngine): (LaunchGuidance & { content: string })[] {
  const inventory = discover(engine.root, engine.store.files, engine.home)
  const slots = engine.config().slots
  return ['comms.voice', 'launch.templates'].map((slot) => {
    const binding = resolveSlot(slot, inventory.repo, {
      user: inventory.user,
      ...(isObject(slots) && typeof slots[slot] === 'string' ? { binding: slots[slot] } : {}),
    })
    const selected = binding.selected
    if (!selected || binding.questions.length)
      throw new Error(`Resolve ${slot} before preparing launch material`)
    let content =
      slot === 'comms.voice'
        ? 'Use plain concrete language. Distinguish observed facts, plans and unknowns; every message remains a draft for human review.'
        : 'Include rollout stages and rollback, audience-specific comms drafts, dashboards tied to pinned metrics, a support guide, a one-pager and a runbook.'
    if (selected.origin !== 'harness') {
      const base = selected.origin === 'user' ? engine.home : engine.root
      const file = canonicalPath(isAbsolute(selected.ref) ? selected.ref : join(base, selected.ref))
      if (
        !inside(canonicalPath(base), file) ||
        !statSync(file).isFile() ||
        statSync(file).size > 1024 * 1024
      )
        throw new Error('Launch guidance must be a readable local file under 1 MiB')
      content = readFileSync(file, 'utf8')
      if (!content.trim()) throw new Error('Launch guidance must contain meaningful instructions')
    }
    return {
      slot,
      ref: selected.ref,
      origin: selected.origin,
      digest: measurementDigest(content),
      content,
    }
  })
}
