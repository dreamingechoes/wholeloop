import { checkShape } from '../../src/flow/registry.js'
import {
  checkScopePlan,
  parseScopePlan,
  SCOPE_SECTIONS,
  type ScopeContext,
} from '../../src/scopes/contract.js'

export interface ScopeAuthor {
  readGuidance(ref: string): Promise<string>
  draft(input: { context: ScopeContext; profile: string; flagGuidance?: string }): Promise<string>
}

/** Repository flag guidance must be available before the author chooses names. */
export async function draftScopes(
  context: ScopeContext,
  profile: string,
  flagBinding: { ref: string; origin: string } | null,
  author: ScopeAuthor,
): Promise<string> {
  const flagGuidance =
    flagBinding && flagBinding.origin !== 'harness'
      ? await author.readGuidance(flagBinding.ref)
      : undefined
  const content = await author.draft({
    context,
    profile,
    ...(flagGuidance === undefined ? {} : { flagGuidance }),
  })
  const problems = checkShape(content, SCOPE_SECTIONS)
  if (problems.length) throw new Error(problems.join('\n'))
  checkScopePlan(parseScopePlan(content), context)
  return content
}
