import { BuildWorkflow } from '../build/workflow.js'
import type { FlowEngine } from '../flow/engine.js'
import { type GateHost, inspectGateRound } from '../gates/execution.js'
import { workspaceSnapshot } from '../gates/snapshot.js'
import { GateWorkflow } from '../gates/workflow.js'
import { type ReviewOptions, ReviewWorkflow } from './workflow.js'

/** A review observes one round; only the builder or person may repair a failed change. */
export async function runReview(
  engine: FlowEngine,
  options: ReviewOptions,
  host: GateHost,
  mode: 'native' | 'sequential' = 'native',
) {
  if (host.stopped()) return { status: 'stopped' }
  const workflow = new ReviewWorkflow(engine)
  const begun = workflow.begin(options)
  if (!('plan' in begun)) return begun
  const context = new BuildWorkflow(engine).engineFor(begun.subject)
  const personal = workspaceSnapshot(context.root).digest
  const checkPersonal = () => {
    if (workspaceSnapshot(context.root).digest !== personal)
      throw new Error(
        'Reviewer changed the original checkout; preserve its files and inspect the host',
      )
  }
  await inspectGateRound(context, begun.plan, host, mode === 'sequential', checkPersonal)
  if (host.stopped()) return { status: 'stopped', subject: begun.subject }
  const verdict = new GateWorkflow(context).verdict(begun.subject, 'review')
  return {
    status: verdict.verdict,
    subject: begun.subject,
    verdict,
    ...(verdict.verdict === 'PASS' ? { receipt: workflow.complete(begun.subject) } : {}),
  }
}
