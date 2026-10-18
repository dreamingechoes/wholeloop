import { checkShape } from '../../src/flow/registry.js'
import {
  checkSlicePlan,
  parseSlicePlan,
  SLICE_SECTIONS,
  type SlicingContext,
} from '../../src/slices/contract.js'

export interface SliceAuthor {
  readGuidance(ref: string): Promise<string>
  draft(input: { context: SlicingContext; profile: string; guidance?: string }): Promise<string>
}

/** Team slicing conventions inform the cut; executable criteria and contract checks remain additive. */
export async function draftSlices(
  context: SlicingContext,
  profile: string,
  binding: { ref: string; origin: string } | null,
  author: SliceAuthor,
): Promise<string> {
  const guidance =
    binding && binding.origin !== 'harness' ? await author.readGuidance(binding.ref) : undefined
  const content = await author.draft({
    context,
    profile,
    ...(guidance === undefined ? {} : { guidance }),
  })
  const problems = checkShape(content, SLICE_SECTIONS)
  if (problems.length) throw new Error(problems.join('\n'))
  checkSlicePlan(parseSlicePlan(content), context)
  return content
}
