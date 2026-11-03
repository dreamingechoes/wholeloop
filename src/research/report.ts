import type { StateEvent } from '../state/events.js'
import type { AngleResult, Claim, Refutation, ResearchPlan } from './contracts.js'

export function researchState(events: readonly StateEvent[], subject: string, run: string) {
  const relevant = events.filter(
    (entry) => entry.subject === subject && 'run' in entry.data && entry.data.run === run,
  )
  const planned = relevant.find((entry) => entry.type === 'research.planned')
  if (planned?.type !== 'research.planned')
    throw new Error('Plan research before submitting or completing it')
  const results = relevant.flatMap((entry) =>
    entry.type === 'research.submitted' ? [entry.data.result] : [],
  )
  const votes = relevant.flatMap((entry) =>
    entry.type === 'research.examined' ? [entry.data.vote] : [],
  )
  return { plan: planned.data.plan, results, votes }
}

export function researchReport(
  plan: ResearchPlan,
  results: readonly AngleResult[],
  votes: readonly Refutation[],
) {
  if (new Set(results.map((result) => result.angle)).size !== results.length)
    throw new Error('Duplicate angle result')
  const openQuestions = [...plan.openQuestions]
  const claims: (Omit<Claim, 'id'> & {
    id: string
    angle: string
    dropped: boolean
    refutations: number
    examinations: Refutation[]
  })[] = []
  for (const angle of plan.angles) {
    const result = results.find((result) => result.angle === angle.id)
    if (!result || result.status === 'unavailable') {
      openQuestions.push({
        question: plan.question,
        missing: `${angle.provider}: ${result?.reason ?? 'No source result received'}`,
        who: plan.owner,
      })
      continue
    }
    openQuestions.push(...result.openQuestions)
    for (const claim of result.claims) {
      const id = `${angle.id}:${claim.id}`
      const examinations = votes
        .filter((vote) => vote.claim === id)
        .sort((a, b) => a.verifier - b.verifier)
      if (new Set(examinations.map((vote) => vote.verifier)).size !== examinations.length)
        throw new Error('Duplicate verifier for one claim')
      if (examinations.some((vote) => vote.verifier < 1 || vote.verifier > plan.verifiers))
        throw new Error('Verifier is outside the planned quorum')
      if (!claim.loadBearing && examinations.length)
        throw new Error('Only load-bearing claims are cross-examined')
      const refutations = examinations.filter((vote) => vote.outcome === 'refute').length
      const dropped = claim.loadBearing && refutations >= plan.refutations
      const incomplete = claim.loadBearing && examinations.length < plan.verifiers
      const uncertain = examinations.some((vote) => vote.outcome === 'uncertain')
      if (uncertain)
        openQuestions.push({
          question: `Is claim ${id} supported?`,
          missing: 'At least one independent verifier could not establish support or refutation',
          who: plan.owner,
        })
      if (incomplete)
        openQuestions.push({
          question: `Is claim ${id} supported?`,
          missing: `${plan.verifiers - examinations.length} independent verifier response(s) missing`,
          who: plan.owner,
        })
      claims.push({
        ...claim,
        id,
        angle: angle.id,
        dropped,
        refutations,
        examinations,
        confidence: incomplete || uncertain ? ('low' as const) : claim.confidence,
      })
    }
  }
  if (results.some((result) => !plan.angles.some((angle) => angle.id === result.angle)))
    throw new Error('Result references an unplanned angle')
  if (votes.some((vote) => !claims.some((claim) => claim.id === vote.claim)))
    throw new Error('Examination references an unknown claim')
  return {
    claims: claims.filter((claim) => !claim.dropped),
    dropped: claims.filter((claim) => claim.dropped),
    openQuestions,
  }
}

export function researchBrief(events: readonly StateEvent[], subject: string, run: string): string {
  const { plan, results, votes } = researchState(events, subject, run)
  return renderResearchBrief(plan, researchReport(plan, results, votes))
}

/** Pure rendering of a synthesized report; the CLI workflow and the runner share it. */
export function renderResearchBrief(
  plan: ResearchPlan,
  report: ReturnType<typeof researchReport>,
): string {
  const renderClaim = (claim: (typeof report.claims)[number]) =>
    [
      `### ${claim.id}`,
      `Claim: ${claim.text}`,
      // A claim the worker did not mark load-bearing is never examined. Printing
      // a refutation count for it read as a verified claim in the first live
      // trial, and both delegated judges rejected the brief for it.
      claim.loadBearing
        ? `Confidence: ${claim.confidence}; active refutations: ${claim.refutations}/${plan.refutations}.`
        : `Confidence: ${claim.confidence}, as the source worker stated it; not load-bearing, so not independently examined.`,
      ...claim.evidence.map((entry) => `Evidence: ${entry.ref}\n\n${entry.excerpt}`),
      ...claim.examinations.map(
        (entry) =>
          `Verifier ${entry.verifier}: ${entry.outcome} — ${entry.reason}${entry.evidence.map((evidence) => `\n\nRefutation evidence: ${evidence.ref}\n\n${evidence.excerpt}`).join('')}`,
      ),
    ].join('\n\n')
  return `# Research brief\n\n## Question\n\n${plan.question}\n\n## Owner\n\n${plan.owner}\n\n## Claims\n\n${report.claims.length} retained claim(s).\n\n${report.claims.map(renderClaim).join('\n\n') || 'No supported claims were returned.'}\n\n## Dropped claims\n\n${report.dropped.length} claim(s) met the refutation quorum.\n\n${report.dropped.map(renderClaim).join('\n\n') || 'None; silence never refutes a claim.'}\n\n## Open questions\n\n${report.openQuestions.map((entry) => `- ${entry.question} — missing: ${entry.missing}; who: ${entry.who}`).join('\n') || 'None reported.'}\n`
}
