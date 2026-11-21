// Resolves repository guidance automatically while leaving personal guidance to an explicit choice.
import { knownSlot, SLOT_RULES } from './rules.js'
import type { CapabilityMap } from './types.js'

interface Candidate {
  ref: string
  origin: 'repo' | 'user' | 'config'
  score: number
  confident: boolean
  reason: string
  contentHash?: string
  access?: string
}

export function resolveSlot(
  slot: string,
  repo: CapabilityMap,
  options: { binding?: string; user?: CapabilityMap } = {},
) {
  if (!knownSlot(slot)) throw new Error(`Unknown slot: ${slot}`)
  if (repo.problems.length || options.user?.problems.length)
    throw new Error('Resolve discovery problems before selecting a binding')
  const found: Candidate[] = [],
    excluded: { ref: string; origin: 'repo' | 'user'; reason: string }[] = []
  const pattern = SLOT_RULES.find(([name]) => name === slot)?.[1]
  const personalPattern = pattern ? new RegExp(`^(?:${pattern.source})$`) : undefined
  for (const [origin, map] of [
    ['repo', repo],
    ['user', options.user],
  ] as const)
    for (const asset of map?.assets ?? []) {
      const tagged = asset.slots.includes(slot)
      if (asset.entrypoint && !tagged) {
        excluded.push({
          ref: asset.path,
          origin,
          reason:
            'Wholeloop entrypoint; excluded from heuristic guidance unless explicitly tagged or configured',
        })
        continue
      }
      // Personal guidance must name the method itself, not merely end in a broad word such as research.
      const nameMatch =
        pattern &&
        ['skill', 'agent', 'convention', 'design'].includes(asset.kind) &&
        (origin === 'user'
          ? personalPattern?.test(asset.name.toLowerCase())
          : pattern.test(asset.name.toLowerCase()))
      if (!tagged && !nameMatch) continue
      found.push({
        ref: asset.path,
        origin,
        score: (origin === 'repo' ? 200 : 0) + (tagged ? 100 : 80),
        confident: origin === 'repo',
        reason: tagged
          ? `Explicit metadata.wholeloop.slot tag for ${slot}`
          : `Name matches the versioned ${slot} rule`,
        ...(asset.contentHash ? { contentHash: asset.contentHash } : {}),
        ...(asset.access ? { access: asset.access } : {}),
      })
    }
  if (slot === 'verify.suite')
    for (const command of repo.commands)
      found.push({
        ref: command.ref,
        origin: 'repo',
        score: 200 + command.priority / 10,
        confident: true,
        reason: command.reason,
      })
  const boundHash = options.binding
    ? found.find((candidate) => candidate.ref === options.binding)?.contentHash
    : undefined
  if (options.binding)
    found.push({
      ref: options.binding,
      origin: 'config',
      ...(boundHash ? { contentHash: boundHash } : {}),
      score: 1000,
      confident: true,
      reason: 'Explicit configured binding overrides discovered candidates',
    })
  found.sort((a, b) => b.score - a.score || a.ref.localeCompare(b.ref))
  const hashes = new Set<string>(),
    refs = new Set<string>()
  const candidates = found.filter((candidate) => {
    if (refs.has(candidate.ref) || (candidate.contentHash && hashes.has(candidate.contentHash)))
      return false
    refs.add(candidate.ref)
    if (candidate.contentHash) hashes.add(candidate.contentHash)
    return true
  })
  const automatic = candidates.filter((candidate) => candidate.origin !== 'user'),
    best = automatic[0]
  const tied = automatic.filter((candidate) => candidate.score === best?.score)
  const ambiguous = tied.length > 1
  const selected = ambiguous
    ? null
    : best
      ? { ref: best.ref, origin: best.origin, reason: best.reason }
      : {
          ref: 'default',
          origin: 'harness',
          reason: 'Use wholeloop guidance unless a personal choice is made',
        }
  const offered = ambiguous ? candidates : best ? [] : candidates
  return {
    schema: 'wholeloop/resolve@1',
    slot,
    selected,
    ...(excluded.length ? { excluded } : {}),
    candidates: candidates.map((candidate) => ({
      ...candidate,
      selected: selected?.ref === candidate.ref,
      outcome:
        selected?.ref === candidate.ref
          ? 'Selected by precedence and confidence'
          : candidate.origin === 'user' && !best
            ? 'Offered only; use wholeloop guidance unless explicitly chosen'
            : ambiguous && candidate.score === best?.score
              ? 'Needs an explicit choice'
              : 'Lost to a higher-precedence or stronger candidate',
    })),
    questions: offered.length
      ? [
          {
            id: `slot:${slot}`,
            prompt: `Which guidance should fill ${slot}?`,
            multi: false,
            required: ambiguous,
            options: [
              { value: 'default', label: "Use wholeloop's default" },
              ...offered
                .filter((candidate) => candidate.ref !== 'default')
                .map((candidate) => ({
                  value: candidate.ref,
                  label: `${candidate.access === 'configured-for-another-client' ? 'configured for another client' : candidate.origin}: ${candidate.ref}`,
                })),
            ],
            remember: ['run', 'project', 'user'],
          },
        ]
      : [],
  }
}
