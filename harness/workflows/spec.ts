import { checkShape } from '../../src/flow/registry.js'
import { checkSpec } from '../../src/spec/contract.js'
import type { SpecTemplate } from '../../src/spec/template.js'

export interface SpecAuthor {
  readGuidance(ref: string): Promise<string>
  draft(input: { template: SpecTemplate; guidance?: string; profile: string }): Promise<string>
}

/** A host reads selected repository guidance before drafting; core checks remain additive. */
export async function draftSpec(
  template: SpecTemplate,
  profile: string,
  author: SpecAuthor,
): Promise<string> {
  const guidance =
    template.kind === 'repository' ? await author.readGuidance(template.ref) : undefined
  const content = await author.draft({
    template,
    profile,
    ...(guidance !== undefined ? { guidance } : {}),
  })
  const problems = [...checkShape(content, template.sections), ...checkSpec(content)]
  if (problems.length) throw new Error(problems.join('\n'))
  return content
}
