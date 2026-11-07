// Runs one verification round through its host; failures go back to a builder or a handoff.
import { BuildWorkflow } from '../build/workflow.js'
import type { FlowEngine } from '../flow/engine.js'
import type { GateHost } from '../gates/execution.js'
import { inspectGateRound } from '../gates/execution.js'
import { workspaceSnapshot } from '../gates/snapshot.js'
import { GateWorkflow } from '../gates/workflow.js'
import { runSuite } from './suite.js'
import { VerificationWorkflow, type VerifyOptions } from './workflow.js'

export type VerificationHost = GateHost & {
  observeSuite?: (suite: Awaited<ReturnType<typeof runSuite>>) => void
}

/** Checkers observe; callers route a failed round to a builder or an explicit handoff. */
export async function runVerification(
  engine: FlowEngine,
  options: VerifyOptions,
  host: VerificationHost,
  mode: 'native' | 'sequential' = 'native',
) {
  if (host.stopped()) return { status: 'stopped' }
  const workflow = new VerificationWorkflow(engine)
  const begun = workflow.begin(options)
  if (!('plan' in begun)) return begun
  const subject = begun.subject ?? ''
  const context = new BuildWorkflow(engine).engineFor(subject)
  const personal = workspaceSnapshot(context.root).digest
  const checkPersonal = () => {
    if (workspaceSnapshot(context.root).digest !== personal)
      throw new Error(
        'Verifier changed the original checkout; preserve its files and inspect the host',
      )
  }
  const suite = await runSuite(context, subject, begun.plan.run, begun.plan.round)
  host.observeSuite?.(suite)
  checkPersonal()
  if (host.stopped()) return { status: 'stopped', subject }
  if (suite.current)
    await inspectGateRound(context, begun.plan, host, mode === 'sequential', checkPersonal)
  if (host.stopped()) return { status: 'stopped', subject }
  const verdict = new GateWorkflow(context).verdict(subject, 'verify')
  return {
    status: verdict.verdict,
    subject,
    verdict,
    ...(verdict.verdict === 'PASS' ? { receipt: workflow.complete(subject) } : {}),
  }
}
