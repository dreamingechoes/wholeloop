// Shares the vocabulary lint between experience measurements and person-facing display checks.
export const INTERNAL_TERMS = [
  'preflight',
  'receipt',
  'slot',
  'binding',
  'pinned',
  'journal',
  'digest',
  'quorum',
  'envelope',
  'projection',
  'conductor',
  'basis snapshot',
  'active-refutation majority',
] as const

export function bannedTerms(text: string): string[] {
  return INTERNAL_TERMS.filter((term) => new RegExp(`\\b${term}s?\\b`, 'i').test(text))
}
