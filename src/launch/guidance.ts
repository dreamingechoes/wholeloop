// Repository guidance for launch drafts.

import { isObject } from '../config/schema.js'
import { guidanceText } from '../discovery/content.js'
import { resolveSlot } from '../discovery/resolve.js'
import { discover } from '../discovery/tree.js'
import type { FlowEngine } from '../flow/engine.js'
import type { LaunchGuidance } from './contracts.js'
import { measurementDigest } from './measurement.js'

export function launchGuidance(
  engine: FlowEngine,
  subject?: string,
  run?: string,
): (LaunchGuidance & { content: string })[] {
  const inventory = discover(engine.root, engine.store.files, engine.home)
  const slots = engine.config(subject, 'prepare-launch', run).slots
  return ['comms.voice', 'launch.templates'].map((slot) => {
    const binding = resolveSlot(slot, inventory.repo, {
      user: inventory.user,
      ...(isObject(slots) && typeof slots[slot] === 'string' ? { binding: slots[slot] } : {}),
    })
    const selected = binding.selected
    if (!selected) throw new Error(`Resolve ${slot} before preparing launch material`)
    let content =
      slot === 'comms.voice'
        ? 'Use plain concrete language. Distinguish observed facts, plans and unknowns; every message remains a draft for human review.'
        : 'Include rollout stages and rollback, audience-specific comms drafts, dashboards tied to pinned metrics, a support guide, a one-pager and a runbook.'
    if (selected.ref !== 'default') {
      const text = guidanceText(engine.root, engine.home, selected)
      if (text === undefined)
        throw new Error('Launch guidance must be a readable local file under 1 MiB')
      content = text
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
