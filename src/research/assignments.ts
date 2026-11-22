// Expands transient research jobs without changing the pinned plan or exposing other votes.

import { workerAssignment } from '../workers/assignment.js'
import { assignmentCost } from '../workers/cost.js'
import type { CitationCheck } from './citation-proof.js'
import type { AngleResult, Refutation, ResearchPlan } from './contracts.js'
import { researchReport } from './report.js'
import resultSchema from './schemas/result-v1.json' with { type: 'json' }
import voteSchema from './schemas/vote-v1.json' with { type: 'json' }

export function researchAssignments(
  plan: ResearchPlan,
  results: readonly AngleResult[],
  votes: readonly Refutation[],
  citationChecks: readonly (CitationCheck & { angle: string })[] = [],
  localRevision?: { repository: string; commit: string | null; reason?: string },
) {
  const report = researchReport(plan, results, votes, citationChecks)
  const assignments = {
    jobs: plan.angles
      .filter((angle) => !results.some((result) => result.angle === angle.id))
      .map((angle) => ({
        angle: structuredClone(angle),
        ...workerAssignment(
          {
            role: 'researcher' as const,
            subject: plan.subject,
            run: plan.run,
            question: plan.question,
            allowedSource: {
              access: 'read-only',
              projectCodeExecution: 'forbidden',
              tools: 'read-only-required',
              ...angle,
            },
            input: {
              angle: angle.id,
              ...(angle.capability === 'source.code' && localRevision
                ? { localCodeRevision: localRevision }
                : {}),
            },
            resultSchema,
          },
          { angle: angle.id },
        ),
      })),
    examinations: report.claims
      .filter((claim) => claim.loadBearing)
      .flatMap((claim) => {
        const angle = plan.angles.find((angle) => angle.id === claim.angle)
        if (!angle) throw new Error('Claim has no planned source')
        const original = results
          .find((result) => result.angle === angle.id)
          ?.claims.find((entry) => `${angle.id}:${entry.id}` === claim.id)
        if (!original) throw new Error('Claim has no original source result')
        return Array.from({ length: plan.verifiers }, (_, index) => index + 1)
          .filter(
            (verifier) =>
              !votes.some((vote) => vote.claim === claim.id && vote.verifier === verifier),
          )
          .map((verifier) => ({
            claim: claim.id,
            verifier,
            ...workerAssignment(
              {
                role: 'challenger' as const,
                subject: plan.subject,
                run: plan.run,
                question: plan.question,
                allowedSource: {
                  access: 'read-only',
                  projectCodeExecution: 'forbidden',
                  tools: 'read-only-required',
                  ...angle,
                },
                input: {
                  claim: { ...original, id: claim.id },
                  verifier,
                  ...(claim.codeCitations ? { codeCitations: claim.codeCitations } : {}),
                },
                resultSchema: voteSchema,
              },
              { claim: claim.id, verifier },
            ),
          }))
      }),
  }
  return { ...assignments, cost: assignmentCost(assignments.jobs, assignments.examinations) }
}
