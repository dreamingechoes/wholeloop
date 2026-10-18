import type { Angle, AngleResult, Refutation, ResearchPlan } from '../../src/research/contracts.js'
import { validateRefutation, validateResult } from '../../src/research/contracts.js'
import { researchReport } from '../../src/research/report.js'

export interface ResearchEngine {
  investigate(angle: Angle, plan: ResearchPlan): Promise<AngleResult>
  challenge(claim: string, verifier: number, plan: ResearchPlan): Promise<Refutation>
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
  async function schedule<T, R>(
    inputs: readonly T[],
    operation: (input: T) => Promise<R>,
  ): Promise<R[]> {
    if (mode === 'native') return Promise.all(inputs.map(operation))
    const results: R[] = []
    for (const input of inputs) results.push(await operation(input))
    return results
  }
  const results = await schedule(plan.angles, async (angle) => {
    let result: AngleResult
    try {
      result = await engine.investigate(angle, plan)
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
  })
  const report = researchReport(plan, results, [])
  const jobs = report.claims
    .filter((claim) => claim.loadBearing)
    .flatMap((claim) =>
      Array.from({ length: plan.verifiers }, (_, index) => ({
        claim: claim.id,
        verifier: index + 1,
      })),
    )
  const votes = await schedule(jobs, async (job) => {
    let vote: Refutation
    try {
      vote = await engine.challenge(job.claim, job.verifier, plan)
    } catch {
      vote = {
        ...job,
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
  })
  return researchReport(plan, results, votes)
}
