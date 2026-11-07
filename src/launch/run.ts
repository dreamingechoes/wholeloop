// Runs the launcher, which returns drafts and has no way to send anything.
import type { LaunchDraft } from './contracts.js'
import type { LaunchWorkflow } from './workflow.js'

export interface LauncherHost {
  draft(context: ReturnType<LaunchWorkflow['context']>): Promise<LaunchDraft>
  stopped(): boolean
}
/** The launcher returns drafts; it receives no provider invocation or sending interface. */
export async function runLaunch(
  workflow: LaunchWorkflow,
  options: Parameters<LaunchWorkflow['begin']>[0],
  host: LauncherHost,
) {
  if (host.stopped()) return { status: 'stopped' }
  const begun = workflow.begin(options)
  if (begun.status !== 'planned') return begun
  const context = workflow.context(begun.subject)
  const draft = context.draft ?? (await host.draft(context))
  if (host.stopped()) return { status: 'stopped', subject: begun.subject }
  return workflow.complete(begun.subject, draft)
}
