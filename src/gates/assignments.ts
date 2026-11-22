// Builds read-only jobs from observed gate inputs, without changing the immutable round plan.

import type { ReviewContext } from '../review/contracts.js'
import type { SuiteResult } from '../verification/contracts.js'
import { workerAssignment } from '../workers/assignment.js'
import { assignmentCost } from '../workers/cost.js'
import type { WorkerModels } from '../workers/models.js'
import { GATE_SCHEMAS, type GatePlan, type GateResult, type GateVote } from './contracts.js'

export interface SuiteObservation {
  run: string
  round: number
  current: boolean
  result: SuiteResult
  output: { ref: string; stdout: string; stderr: string }[]
}

export function gateAssignments(
  plan: GatePlan,
  observations: {
    results: readonly GateResult[]
    votes: readonly GateVote[]
    review?: ReviewContext
    suite?: SuiteObservation
    models?: WorkerModels | undefined
  },
) {
  const { review, suite } = observations
  if (review && (review.input.run !== plan.run || review.input.round !== plan.round))
    throw new Error('Review observations belong to a different gate assignment')
  if (suite && (suite.run !== plan.run || suite.round !== plan.round))
    throw new Error('Suite observations belong to a different gate assignment')
  if (plan.gate === 'review' ? !review?.current : !suite?.current)
    return { jobs: [], examinations: [] }
  const source = {
    access: 'read-only',
    repository: plan.repository,
    base: plan.base,
    snapshot: plan.snapshot.digest,
  }
  const context = (unit: string) =>
    plan.gate === 'review' && review
      ? {
          review: {
            diff: review.diff,
            rubric: review.rubric,
            before: review.input.before,
            after: review.input.after,
            diffDigest: review.input.diffDigest,
            previousFindings: review.previousFindings.filter((entry) => entry.unit === unit),
          },
        }
      : {
          suite: suite
            ? {
                result: suite.result,
                output: suite.output,
                rawOutputAvailable: suite.output.length > 0,
              }
            : undefined,
        }
  const assignments = {
    jobs: plan.units
      .filter(
        (unit) =>
          !['suite', 'testability'].includes(unit.id) &&
          !observations.results.some((result) => result.unit === unit.id),
      )
      .map((unit) => ({
        id: `inspect:${unit.id}`,
        round: plan.round,
        ...workerAssignment(
          {
            role: plan.gate === 'verify' ? 'verifier' : 'reviewer',
            subject: plan.subject,
            run: plan.run,
            question: unit.asks,
            allowedSource: source,
            input: { unit, ...context(unit.id) },
            resultSchema: GATE_SCHEMAS.result,
          },
          { unit: unit.id },
        ),
      })),
    examinations: observations.results.flatMap((result) =>
      result.findings.flatMap((finding) => {
        const unit = plan.units.find((unit) => unit.id === result.unit)
        if (!unit) throw new Error('Finding has no planned gate unit')
        const id = `${unit.id}:${finding.id}`
        return Array.from({ length: plan.verifiers }, (_, index) => index + 1)
          .filter(
            (verifier) =>
              !observations.votes.some((vote) => vote.finding === id && vote.verifier === verifier),
          )
          .map((verifier) => ({
            id: `refute:${id}:${verifier}`,
            round: plan.round,
            ...workerAssignment(
              {
                role: 'reviewer',
                subject: plan.subject,
                run: plan.run,
                question: `Cross-examine this finding against its pinned evidence: ${finding.text}`,
                allowedSource: source,
                input: { unit, finding: { ...finding, id }, verifier, ...context(unit.id) },
                resultSchema: GATE_SCHEMAS.vote,
              },
              { finding: id, verifier },
            ),
          }))
      }),
    ),
  }
  return {
    ...assignments,
    cost: assignmentCost(assignments.jobs, assignments.examinations, observations.models),
  }
}
