import type { LearningChallenge } from './contracts.js'
import type { LearningWorkflow } from './workflow.js'

export interface LearningHost {
  challenge(context: ReturnType<LearningWorkflow['context']>): Promise<LearningChallenge>
  stopped(): boolean
}
/** Counterargument collection ends at the human decision; it never selects or records an outcome. */
export async function runLearning(
  workflow: LearningWorkflow,
  options: Parameters<LearningWorkflow['begin']>[0],
  host: LearningHost,
) {
  if (host.stopped()) return { status: 'stopped', subject: options.subject ?? null }
  const begun = workflow.begin(options)
  if (begun.status !== 'planned') return begun
  if (host.stopped()) return { status: 'stopped', subject: begun.subject }
  const challenge = await host.challenge(begun.context)
  if (host.stopped()) return { status: 'stopped', subject: begun.subject }
  return {
    status: 'awaiting-human-decision',
    subject: begun.subject,
    report: workflow.challenge(begun.subject, challenge),
  }
}
