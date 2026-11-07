// Proves that red and green private runs differ only in the implementation under test.
import { contractDigest } from '../contracts/compatibility.js'
import type { DeliveryPlan } from '../delivery/plan.js'
import type { EnvironmentRecipe } from '../environment/recipe.js'
import type { EnvironmentRuntime } from '../environment/runtime.js'
import { git } from '../worktrees/git.js'

/** Only implementation-script bytes and allocated controller paths may differ between red and green. */
export function privateExecutionIdentity(recipe: EnvironmentRecipe) {
  return contractDigest({
    ...recipe,
    repositories: recipe.repositories.map(({ id }) => ({ id })),
    files: recipe.files.map((file) => {
      const { sha256, ...identity } = file
      return file.kind === 'script' ? identity : { ...identity, sha256 }
    }),
  })
}
/** Observe while the baseline is current; a later dirty worktree cannot supply this proof retrospectively. */
export function privateBaseline(
  record: Pick<EnvironmentRuntime, 'candidates'>,
  recipe: EnvironmentRecipe,
  plan: DeliveryPlan,
) {
  try {
    for (const candidate of record.candidates) {
      const expected = plan.repositories.find((repo) => repo.id === candidate.repository)
      if (
        !expected ||
        candidate.head !== expected.base ||
        git(candidate.path, ['rev-parse', 'HEAD']) !== `${expected.base}\n` ||
        git(candidate.path, [
          '--no-optional-locks',
          'status',
          '--porcelain=v1',
          '--untracked-files=all',
        ]).trim()
      )
        return { status: 'not-clean-base', evidence: contractDigest(record.candidates) }
      for (const file of recipe.files.filter((file) => file.repository === candidate.repository))
        git(candidate.path, ['ls-files', '--error-unmatch', '--', file.ref])
    }
    return { status: 'observed-clean-base', evidence: contractDigest(record.candidates) }
  } catch {
    return { status: 'unavailable', evidence: contractDigest({ available: false }) }
  }
}

/** A failed control or unavailable observation cannot supply a relevant regression mismatch. */
export function relevantBaselineFailure(
  assertions: readonly { id: string; status: string }[],
  relevant: readonly string[],
) {
  return (
    assertions.every((a) => relevant.includes(a.id) || a.status === 'passed') &&
    assertions.some((a) => relevant.includes(a.id) && a.status === 'failed')
  )
}
