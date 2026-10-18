// Keep the mandatory set independent of manifests so overrides cannot narrow coverage.
export const BUILTIN_LENSES = [
  ['correctness', 'Find behavioral defects the tests missed.', true],
  ['design-fit', 'Check the repository patterns, interfaces and boundaries.', false],
  ['performance', 'Find unbounded work, repeated queries and wasteful I/O.', false],
  ['security', 'Check trust boundaries, authorization, secrets and injection.', true],
  ['simplicity', 'Find unnecessary complexity and unclear responsibilities.', false],
  ['change-shape', 'Check scope, reviewability and unrelated edits.', false],
] as const
