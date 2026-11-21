import { researchAssignments } from '../../src/research/assignments.js'
import type { Angle, AngleResult, Refutation, ResearchPlan } from '../../src/research/contracts.js'
import { validateRefutation, validateResult } from '../../src/research/contracts.js'
import { researchReport } from '../../src/research/report.js'
import { scheduleAssignments } from '../../src/workers/schedule.js'

export interface ResearchEngine {
  investigate(
    angle: Angle,
    plan: ResearchPlan,
    assignment?: ReturnType<typeof researchAssignments>['jobs'][number],
  ): Promise<AngleResult>
  challenge(
    claim: string,
    verifier: number,
    plan: ResearchPlan,
    assignment?: ReturnType<typeof researchAssignments>['examinations'][number],
  ): Promise<Refutation>
}
export interface ResearchSink {
  submit(result: AngleResult): void
  examine(vote: Refutation): void
}

/** The host supplies tools; scheduling changes concurrency, never source coverage. */
export async function runResearch(
  plan: ResearchPlan,
  engine: ResearchEngine,
  sink: ResearchSink,
  mode: 'native' | 'sequential' = 'native',
) {
  const results = await scheduleAssignments(
    researchAssignments(plan, [], []).jobs,
    async (assignment) => {
      const angle = assignment.angle
      let result: AngleResult
      try {
        result = await engine.investigate(angle, plan, assignment)
      } catch {
        result = {
          angle: angle.id,
          status: 'unavailable',
          claims: [],
          openQuestions: [],
          reason: 'Source request failed; verify access in the host client',
        }
      }
      validateResult(result)
      if (result.angle !== angle.id) throw new Error('Worker returned a different angle')
      sink.submit(result)
      return result
    },
    mode,
  )
  const jobs = researchAssignments(plan, results, []).examinations
  const votes = await scheduleAssignments(
    jobs,
    async (job) => {
      let vote: Refutation
      try {
        vote = await engine.challenge(job.claim, job.verifier, plan, job)
      } catch {
        vote = {
          claim: job.claim,
          verifier: job.verifier,
          outcome: 'uncertain',
          reason: 'Independent verifier did not return evidence',
          evidence: [],
        }
      }
      validateRefutation(vote)
      if (vote.claim !== job.claim || vote.verifier !== job.verifier)
        throw new Error('Worker returned a different examination assignment')
      sink.examine(vote)
      return vote
    },
    mode,
  )
  return researchReport(plan, results, votes)
}
