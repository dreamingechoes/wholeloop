// Binds authored conclusions to the exact evidence aggregate without letting prose replace it.

import { stripVTControlCharacters } from 'node:util'
import { validate } from '../config/schema.js'
import { contractDigest } from '../contracts/compatibility.js'
import { stripCode } from '../docs/markdown.js'
import type { ResearchPlan } from './contracts.js'
import type { researchReport } from './report.js'
import schema from './schemas/conclusion-v1.json' with { type: 'json' }

export interface ResearchConclusion {
  schema: 'wholeloop/research-conclusion@1'
  basis: string
  answer: string
  recommendation: string
}
type Report = ReturnType<typeof researchReport>
// Newlines and tabs are prose; other controls can spoof terminal output.
// biome-ignore lint/suspicious/noControlCharactersInRegex: reject non-prose C0 controls and DEL.
const PROSE_CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g
export const conclusionText = (text: string) => text.replace(/\r\n?/g, '\n').trim()
export const conclusionSchema = schema
export const conclusionBasis = (plan: ResearchPlan, report: Report) =>
  contractDigest({ plan, report })

export function validateConclusion(
  value: unknown,
  basis?: string,
): asserts value is ResearchConclusion {
  const problems = validate(value, schema, 'conclusion')
  if (problems.length) throw new Error(problems.join('\n'))
  const conclusion = value as ResearchConclusion
  for (const text of [conclusion.answer, conclusion.recommendation]) {
    if (
      !text.trim() ||
      Buffer.byteLength(text, 'utf8') > 16384 ||
      stripCode(text).some((line) => /^\s*#{1,6}\s/.test(line)) ||
      !text.isWellFormed() ||
      stripVTControlCharacters(text).replace(PROSE_CONTROL, '') !== text
    )
      throw new Error(
        'Conclusion prose must be meaningful, bounded and contain no section headings',
      )
  }
  if (basis && conclusion.basis !== basis)
    throw new Error('Research evidence changed; read the conclusion context again')
}

export function researchCertainty(report: Report) {
  const notChecked = [
    ...new Set([
      ...(!report.claims.length ? ['No retained claim supports an answer.'] : []),
      ...report.openQuestions.map((question) => question.missing),
      ...report.claims
        .filter((claim) => !claim.loadBearing)
        .map((claim) => `${claim.id}: not independently examined`),
      ...report.claims.flatMap((claim) =>
        claim.examinations
          .filter((vote) => vote.outcome === 'uncertain')
          .map((vote) => `${claim.id}, verifier ${vote.verifier}: ${vote.reason}`),
      ),
    ]),
  ]
  const confidence = !report.claims.length
    ? 'unknown'
    : notChecked.length || report.claims.some((claim) => claim.confidence === 'low')
      ? 'low'
      : report.claims.some((claim) => claim.confidence === 'medium')
        ? 'medium'
        : 'high'
  return { confidence, notChecked }
}

export function researchSummary(report: Report, conclusion: ResearchConclusion) {
  const certainty = researchCertainty(report)
  const text = `Answer\n${conclusionText(conclusion.answer)}\n\nRecommendation\n${conclusionText(conclusion.recommendation)}\n\nConfidence: ${certainty.confidence}.\nNot checked: ${certainty.notChecked.map((entry) => stripVTControlCharacters(entry).replace(PROSE_CONTROL, '').replace(/\s+/g, ' ').trim()).join('; ') || 'None reported.'}`
  return {
    answer: conclusionText(conclusion.answer),
    recommendation: conclusionText(conclusion.recommendation),
    ...certainty,
    text,
  }
}

export function researchTitle(question: string) {
  const text = question.replace(/\s+/g, ' ').trim()
  const characters = [...text]
  return characters.length > 72 ? `${characters.slice(0, 71).join('')}…` : text
}
