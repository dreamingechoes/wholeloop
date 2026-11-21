// Renders a synthesized research report and brief; the CLI workflow and the runner share it.

import type { StateEvent } from '../state/events.js'
import {
  conclusionBasis,
  conclusionText,
  type ResearchConclusion,
  researchCertainty,
  validateConclusion,
} from './conclusion.js'
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
      // The dropping quorum is not a quorum for certainty: a retained minority
      // counterexample must remain unresolved rather than disappear under a majority.
      const disputed = !dropped && refutations > 0
      const incomplete = claim.loadBearing && examinations.length < plan.verifiers
      const uncertain = examinations.some((vote) => vote.outcome === 'uncertain')
      if (disputed)
        openQuestions.push({
          question: `What qualification is needed for claim ${id}?`,
          missing: `Independent counterevidence disputes the current wording: ${examinations
            .filter((vote) => vote.outcome === 'refute')
            .map((vote) => vote.reason)
            .join(' ')} The dropping quorum was not reached; support remains unresolved.`,
          who: plan.owner,
        })
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
        confidence: incomplete || uncertain || disputed ? ('low' as const) : claim.confidence,
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

export function researchBrief(
  events: readonly StateEvent[],
  subject: string,
  run: string,
  conclusion?: ResearchConclusion,
): string {
  const { plan, results, votes } = researchState(events, subject, run)
  return renderResearchBrief(plan, researchReport(plan, results, votes), conclusion)
}

/** Older private reports remain evidence ledgers until their conductor supplies a conclusion. */
export function renderResearchBrief(
  plan: ResearchPlan,
  report: ReturnType<typeof researchReport>,
  conclusion?: ResearchConclusion,
): string {
  if (conclusion) validateConclusion(conclusion, conclusionBasis(plan, report))
  const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()
  const evidence = (label: string, entry: { ref: string; excerpt: string }) =>
    `${label}: ${oneLine(entry.ref)}\n\n${entry.excerpt
      .split(/\r?\n/)
      .map((line) => `> ${line}`)
      .join('\n')}`
  const renderClaim = (claim: (typeof report.claims)[number]) => {
    const counts = ['confirm', 'refute', 'uncertain']
      .map((outcome) => ({
        outcome,
        count: claim.examinations.filter((vote) => vote.outcome === outcome).length,
      }))
      .filter(({ count }) => count)
    const missing = plan.verifiers - claim.examinations.length
    const votes = [
      ...counts.map(({ outcome, count }) => `${count} ${outcome}`),
      ...(missing ? [`${missing} missing`] : []),
    ].join(', ')
    const keyOf = (entry: { ref: string; excerpt: string }) =>
      JSON.stringify([entry.ref, entry.excerpt])
    const sourceEvidence = new Set(claim.evidence.map(keyOf))
    const seen = new Set<string>()
    const verifierEvidence = claim.examinations.flatMap((vote) =>
      vote.evidence.flatMap((entry) => {
        const key = keyOf(entry)
        if (seen.has(key) || (vote.outcome !== 'refute' && sourceEvidence.has(key))) return []
        seen.add(key)
        return [evidence('Verifier evidence', entry)]
      }),
    )
    return [
      `### ${oneLine(claim.id)}`,
      `Claim: ${oneLine(claim.text)}`,
      ...(claim.refutations > 0 && !claim.dropped
        ? [
            'Status: disputed; retained below the dropping quorum, not established as unqualified fact.',
          ]
        : []),
      claim.loadBearing
        ? `Confidence: ${claim.confidence}; verifiers: ${votes}; refuted by ${claim.refutations} of ${plan.verifiers} (drops at ${plan.refutations}).`
        : `Confidence: ${claim.confidence}, as the source worker stated it; not load-bearing, so not independently examined.`,
      ...claim.evidence.map((entry) => evidence('Evidence', entry)),
      ...claim.examinations
        .filter((vote) => vote.outcome === 'refute')
        .map((vote) => `Verifier ${vote.verifier}: refute — ${oneLine(vote.reason)}`),
      ...verifierEvidence,
    ].join('\n\n')
  }
  const certainty = researchCertainty(report)
  const uncertainty = report.claims.flatMap((claim) =>
    claim.examinations
      .filter((vote) => vote.outcome === 'uncertain')
      .map(
        (vote) =>
          `- Verifier ${vote.verifier} for ${oneLine(claim.id)} — not checked: ${oneLine(vote.reason)}`,
      ),
  )
  const authored = conclusion
    ? `## Answer\n\n${conclusionText(conclusion.answer)}\n\n## Recommendation\n\n${conclusionText(conclusion.recommendation)}\n\nConfidence: ${certainty.confidence}.\n\nNot checked: ${certainty.notChecked.join('; ') || 'None reported.'}\n\n`
    : ''
  return `# Research brief\n\n${authored}## Question\n\n${plan.question
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join(
      '\n',
    )}\n\n## Owner\n\n${oneLine(plan.owner)}\n\n## Claims\n\n${report.claims.length} retained claim(s).\n\n${report.claims.map(renderClaim).join('\n\n') || 'No supported claims were returned.'}\n\n## Dropped claims\n\n${report.dropped.length} claim(s) met the refutation quorum.\n\n${report.dropped.map(renderClaim).join('\n\n') || 'None; silence never refutes a claim.'}\n\n## Open questions\n\n${report.openQuestions.map((entry) => `- ${oneLine(entry.question)} — missing: ${oneLine(entry.missing)}; who: ${oneLine(entry.who)}`).join('\n') || 'None reported.'}${uncertainty.length ? `\n${uncertainty.join('\n')}` : ''}\n`
}
