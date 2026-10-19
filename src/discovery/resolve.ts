import { knownSlot, SLOT_RULES } from './rules.js'
import type { CapabilityMap } from './types.js'

interface Candidate {
  ref: string
  origin: 'repo' | 'user' | 'config'
  score: number
  confident: boolean
  reason: string
}

export function resolveSlot(
  slot: string,
  repo: CapabilityMap,
  options: { binding?: string; user?: CapabilityMap } = {},
) {
  if (!knownSlot(slot)) throw new Error(`Unknown slot: ${slot}`)
  if (repo.problems.length || options.user?.problems.length)
    throw new Error('Resolve discovery problems before selecting a binding')
  const candidates: Candidate[] = []
  const excluded: { ref: string; origin: 'repo' | 'user'; reason: string }[] = []
  const pattern = SLOT_RULES.find(([name]) => name === slot)?.[1]
  for (const [origin, map] of [
    ['repo', repo],
    ['user', options.user],
  ] as const)
    for (const asset of map?.assets ?? []) {
      const offset = origin === 'repo' ? 200 : 0
      if (asset.slots.includes(slot))
        candidates.push({
          ref: asset.path,
          origin,
          score: offset + 100,
          confident: true,
          reason: `Explicit metadata.wholeloop.slot tag for ${slot}`,
        })
      else if (asset.entrypoint)
        excluded.push({
          ref: asset.path,
          origin,
          reason:
            'Wholeloop entrypoint; excluded from heuristic guidance unless explicitly tagged or configured',
        })
      else if (pattern && ['skill', 'agent', 'convention', 'design'].includes(asset.kind)) {
        const nameMatch = pattern.test(asset.name.toLowerCase())
        const descriptionMatch = pattern.test(asset.description.toLowerCase())
        if (nameMatch || descriptionMatch)
          candidates.push({
            ref: asset.path,
            origin,
            score: offset + (nameMatch ? 80 : 40),
            confident: nameMatch,
            reason: nameMatch
              ? `Name matches the versioned ${slot} rule`
              : `Description-only match for ${slot}; confirmation required`,
          })
      }
    }
  if (slot === 'verify.suite')
    for (const command of repo.commands)
      candidates.push({
        ref: command.ref,
        origin: 'repo',
        score: 200 + command.priority / 10,
        confident: true,
        reason: command.reason,
      })
  if (options.binding)
    candidates.push({
      ref: options.binding,
      origin: 'config',
      score: 1000,
      confident: true,
      reason: 'Explicit configured binding overrides discovered candidates',
    })
  candidates.sort((a, b) => b.score - a.score || a.ref.localeCompare(b.ref))
  const best = candidates[0]
  const tied = candidates.filter((candidate) => candidate.score === best?.score)
  const ambiguous = !!best && (!best.confident || tied.length > 1)
  const selected =
    !ambiguous && best
      ? { ref: best.ref, origin: best.origin, reason: best.reason }
      : best
        ? null
        : {
            ref: 'default',
            origin: 'harness',
            reason: 'No repository or user candidate; use harness guidance',
          }
  return {
    schema: 'wholeloop/resolve@1',
    slot,
    selected,
    ...(excluded.length ? { excluded } : {}),
    candidates: candidates.map((candidate) => ({
      ...candidate,
      selected: selected?.ref === candidate.ref && selected?.origin === candidate.origin,
      outcome:
        ambiguous && candidate.score === best?.score
          ? 'Needs an explicit choice'
          : selected?.ref === candidate.ref && selected?.origin === candidate.origin
            ? 'Selected by precedence and confidence'
            : 'Lost to a higher-precedence or stronger candidate',
    })),
    questions: ambiguous
      ? [
          {
            id: `slot:${slot}`,
            prompt: `Which repository guidance should fill ${slot}?`,
            multi: false,
            options: tied.map((candidate) => ({
              value: candidate.ref,
              label: `${candidate.origin}: ${candidate.ref}`,
            })),
            remember: ['project', 'user'],
          },
        ]
      : [],
  }
}
