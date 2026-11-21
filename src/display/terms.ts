// Shares the vocabulary lint between experience measurements and person-facing display checks.
export const PERSON_WORDS = {
  preflight: 'starting checks',
  receipt: 'result',
  slot: 'assignment',
  binding: 'selected guidance',
  pinned: 'agreed',
  journal: 'history',
  digest: 'summary or revision identifier',
  quorum: 'required independent checks',
  envelope: 'submitted result',
  projection: 'current view',
  conductor: 'coordinator',
  'basis snapshot': 'evidence used',
  'active-refutation majority': 'independent examination result',
} as const

export const INTERNAL_TERMS = Object.keys(PERSON_WORDS) as (keyof typeof PERSON_WORDS)[]

export function bannedTerms(text: string): (keyof typeof PERSON_WORDS)[] {
  return INTERNAL_TERMS.filter((term) => new RegExp(`\\b${term}s?\\b`, 'i').test(text))
}
