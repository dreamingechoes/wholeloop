// Inspects a gate round through its host.
import type { FlowEngine } from '../flow/engine.js'
import type { ReviewContext } from '../review/contracts.js'
import { prepareReviewInput } from '../review/input.js'
import { type WorkerCost, workerCost } from '../workers/cost.js'
import { scheduleAssignments } from '../workers/schedule.js'
import type { GatePlan, GateResult, GateVote } from './contracts.js'
import { workspaceSnapshot } from './snapshot.js'
import { gateRuns } from './state.js'
import { GateWorkflow } from './workflow.js'

export interface GateHost {
  preview?(cost: WorkerCost): void
  inspect(
    plan: GatePlan,
    unit: GatePlan['units'][number],
    review?: ReviewContext,
  ): Promise<GateResult>
  refute(
    plan: GatePlan,
    finding: string,
    verifier: number,
    review?: ReviewContext,
  ): Promise<GateVote>
  stopped(): boolean
}
export async function inspectGateRound(
  engine: FlowEngine,
  plan: GatePlan,
  host: GateHost,
  sequential: boolean,
  checkPersonal: () => void,
) {
  const review = plan.gate === 'review' ? prepareReviewInput(engine, plan) : undefined
  if (review && !review.current) throw new Error('Review input is stale')
  const gates = new GateWorkflow(engine)
  const current = gateRuns(engine.store.events())
    .find((run) => run.run === plan.run)
    ?.rounds.at(-1)
  const unchanged = () => workspaceSnapshot(plan.repository).digest === plan.snapshot.digest
  const inspections = plan.units.filter(
    (unit) => !current?.results.some((result) => result.unit === unit.id),
  )
  const workers = inspections.filter((unit) => !['suite', 'testability'].includes(unit.id))
  if (workers.length)
    host.preview?.(
      workerCost(
        workers.map(() => (plan.gate === 'verify' ? 'verifier' : 'reviewer')),
        workers,
      ),
    )
  await scheduleAssignments(
    inspections,
    async (unit) => {
      if (host.stopped()) return
      let result: GateResult
      try {
        result = await host.inspect(plan, unit, review)
      } catch {
        result = {
          unit: unit.id,
          status: 'unavailable',
          evidence: [],
          findings: [],
          reason: 'Worker did not return evidence',
        }
      }
      checkPersonal()
      if (result.unit !== unit.id) throw new Error('Gate worker returned a different assignment')
      const recorded = gateRuns(engine.store.events())
        .find((run) => run.run === plan.run)
        ?.rounds.at(-1)
        ?.results.find((entry) => entry.unit === result.unit)
      if (recorded) {
        if (JSON.stringify(recorded) !== JSON.stringify(result))
          throw new Error('Worker returned observations different from its recorded unit')
        return
      }
      try {
        gates.submit(plan.subject, plan.run, plan.round, result)
      } catch (error) {
        if (unchanged()) throw error
      }
    },
    sequential ? 'sequential' : 'native',
  )
  const submitted = gateRuns(engine.store.events())
    .find((run) => run.run === plan.run)
    ?.rounds.at(-1)
  const jobs = (submitted?.results ?? [])
    .flatMap((result) =>
      result.findings.flatMap((finding) =>
        Array.from({ length: plan.verifiers }, (_, index) => ({
          finding: `${result.unit}:${finding.id}`,
          verifier: index + 1,
        })),
      ),
    )
    .filter(
      (job) =>
        !submitted?.votes.some(
          (vote) => vote.finding === job.finding && vote.verifier === job.verifier,
        ),
    )
  if (jobs.length)
    host.preview?.(
      workerCost(
        jobs.map(() => 'reviewer'),
        jobs,
      ),
    )
  await scheduleAssignments(
    jobs,
    async (job) => {
      if (host.stopped()) return
      let vote: GateVote
      try {
        vote = await host.refute(plan, job.finding, job.verifier, review)
      } catch {
        return
      }
      checkPersonal()
      if (vote.finding !== job.finding || vote.verifier !== job.verifier)
        throw new Error('Refutation worker returned a different assignment')
      try {
        gates.submit(plan.subject, plan.run, plan.round, vote)
      } catch (error) {
        if (unchanged()) throw error
      }
    },
    sequential ? 'sequential' : 'native',
  )
}
