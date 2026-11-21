// Existing workflow fixtures still author a conclusion instead of bypassing the new boundary.

import type { ResearchWorkflow } from '../../src/research/workflow.js'

export function completeResearch(workflow: ResearchWorkflow, subject: string) {
  const context = workflow.complete(subject)
  if (context.schema !== 'wholeloop/research-conclusion-context@1')
    throw new Error('Expected conclusion context')
  const completed = workflow.complete(subject, {
    schema: 'wholeloop/research-conclusion@1',
    basis: context.basis,
    answer:
      context.report.claims.map((claim) => claim.text).join(' ') ||
      'No supported answer is available from the fixture evidence.',
    recommendation: 'Resolve the recorded unknowns before acting.',
  })
  if (completed.schema !== 'wholeloop/research-complete@1')
    throw new Error('Expected completed research')
  return completed
}
