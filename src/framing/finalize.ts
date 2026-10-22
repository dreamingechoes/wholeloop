import { createHash } from 'node:crypto'
import { validate } from '../config/schema.js'
import { stripCode } from '../docs/markdown.js'
import type { FlowEngine } from '../flow/engine.js'
import { checkShape } from '../flow/registry.js'
import type { StateEvent } from '../state/events.js'
import { checkFrame, FRAME_SECTIONS, validateFrameOutcome } from './contract.js'
import decisionSchema from './schemas/decision-v1.json' with { type: 'json' }
import reviewSchema from './schemas/review-v1.json' with { type: 'json' }

export const FRAME_DECISION_SCHEMA = decisionSchema
export const FRAME_REVIEW_SCHEMA = reviewSchema
export const FRAME_REVIEW_COVERAGE = ['problem', 'evidence', 'impact', 'decision-fidelity'] as const
export interface FrameDecision {
  schema: 'wholeloop/frame-decision@1'
  by: string
  outcome: 'go' | 'on-hold' | 'dropped'
  reason: string
  reopen?: string
  stopConditions: string[]
}
export interface FrameReview {
  schema: 'wholeloop/frame-review@1'
  subject: string
  run: string
  /** Exact final bytes approved by the owner, not only the initial idea or an earlier revision. */
  sha256: string
  decision: FrameDecision
  reviewer: { by: string; sha256: string; coverage: string[]; unresolvedFindings: string[] }
}
export const frameDigest = (content: string) => createHash('sha256').update(content).digest('hex')

export function frameDecision(value: unknown): FrameDecision {
  if (validate(value, decisionSchema).length) throw new Error('Use a valid explicit owner decision')
  const decision = value as FrameDecision
  validateFrameOutcome(decision)
  if (!decision.by.trim() || decision.stopConditions.some((entry) => !entry.trim()))
    throw new Error('Name the owner and retain only explicitly approved stop conditions')
  if (decision.outcome !== 'on-hold' && decision.reopen !== undefined)
    throw new Error('Only an on-hold decision has a reopening condition')
  return structuredClone(decision)
}

/** Encode values as data so multiline owner text cannot introduce headings or extra decision rules. */
export function frameDecisionText(decision: FrameDecision): string {
  return [
    `Decision: ${decision.outcome}`,
    `Reason: ${JSON.stringify(decision.reason)}`,
    ...(decision.reopen ? [`Reopen when: ${JSON.stringify(decision.reopen)}`] : []),
    `Approved stop conditions: ${JSON.stringify(decision.stopConditions)}`,
  ].join('\n')
}

function stopSection(content: string) {
  const raw = content.split('\n')
  const visible = stripCode(content)
  const matches = visible.flatMap((line, index) => {
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)
    return match ? [{ index, depth: match[1]?.length ?? 0, title: match[2]?.toLowerCase() }] : []
  })
  const stops = matches.filter((entry) => entry.title === 'stop conditions')
  if (stops.length !== 1) throw new Error('Require exactly one Stop conditions section')
  const start = stops[0]
  if (!start) throw new Error('Require a Stop conditions section')
  const end =
    matches.find((entry) => entry.index > start.index && entry.depth <= start.depth)?.index ??
    raw.length
  return { raw, start: start.index + 1, end }
}

export function frameRun(events: readonly StateEvent[], subject: string) {
  const latest = [...events]
    .reverse()
    .find(
      (entry) =>
        entry.subject === subject &&
        ['step.started', 'step.completed', 'step.skipped'].includes(entry.type) &&
        'step' in entry.data &&
        entry.data.step === 'frame-problem',
    )
  if (latest?.type !== 'step.started') throw new Error('Begin an active framing run first')
  return latest.data.run
}

/** Share exact rendering with scripted test declarations without granting runtime approval. */
export function renderFrameDecision(content: string, input: unknown) {
  const decision = frameDecision(input)
  const section = stopSection(content)
  const draft = [
    ...section.raw.slice(0, section.start),
    '',
    frameDecisionText(decision),
    '',
    ...section.raw.slice(section.end),
  ].join('\n')
  const problems = [...checkShape(draft, FRAME_SECTIONS), ...checkFrame(draft)]
  if (problems.length) throw new Error(problems.join('\n'))
  return draft
}

export function prepareFrame(engine: FlowEngine, subject: string, content: string, input: unknown) {
  const item = engine.store.get(subject)
  if (item.kind !== 'initiative' || item.status !== 'open')
    throw new Error('Frame an open initiative')
  const run = frameRun(engine.store.events(), subject)
  const decision = frameDecision(input)
  if (decision.by !== item.owner)
    throw new Error('The explicit decision must name the initiative owner')
  const draft = renderFrameDecision(content, decision)
  const sha256 = frameDigest(draft)
  return {
    schema: 'wholeloop/frame-draft@1',
    subject,
    run,
    artifact: { content: draft, sha256 },
    reviewTemplate: {
      schema: 'wholeloop/frame-review@1',
      subject,
      run,
      sha256,
      decision,
      reviewer: { by: '', sha256, coverage: [], unresolvedFindings: [] },
    },
    instructions:
      'Save these exact draft bytes outside the repository. Obtain owner approval for this final digest and a semantic challenger review covering every area. Complete the review template from actual observations, never from structural validation alone.',
  }
}

export function validateFrameReview(
  content: string,
  value: unknown,
  identity: { subject: string; run: string; owner: string },
): FrameReview {
  if (
    Buffer.byteLength(JSON.stringify(value) ?? '') > 65536 ||
    validate(value, reviewSchema).length
  )
    throw new Error('Use a bounded versioned final framing review; contents omitted')
  const review = structuredClone(value) as FrameReview
  const decision = frameDecision(review.decision)
  if (
    review.subject !== identity.subject ||
    review.run !== identity.run ||
    decision.by !== identity.owner
  )
    throw new Error('Final framing approval must match the current initiative, run and owner')
  if (review.sha256 !== frameDigest(content) || review.reviewer.sha256 !== review.sha256)
    throw new Error(
      'The final framing bytes changed; obtain fresh owner approval and challenger review',
    )
  if (
    !review.reviewer.by.trim() ||
    review.reviewer.unresolvedFindings.length ||
    review.reviewer.coverage.length !== FRAME_REVIEW_COVERAGE.length
  )
    throw new Error('Complete semantic coverage and resolve every finding before finalization')
  const section = stopSection(content)
  if (
    section.raw.slice(section.start, section.end).join('\n').trim() !== frameDecisionText(decision)
  )
    throw new Error(
      'Stop conditions must contain only the exact owner-approved decision; keep suggestions as proposals',
    )
  return review
}

export function finalizeFrame(
  engine: FlowEngine,
  subject: string,
  content: string,
  input: unknown,
) {
  const review = validateFrameReview(content, input, {
    subject,
    run: frameRun(engine.store.events(), subject),
    owner: engine.store.get(subject).owner,
  })
  const completion = engine.complete(
    'frame-problem',
    subject,
    content,
    {
      outcome: review.decision.outcome,
      reason: review.decision.reason,
      ...(review.decision.reopen ? { reopen: review.decision.reopen } : {}),
    },
    review,
  )
  return {
    schema: 'wholeloop/frame-finalized@1',
    subject,
    sha256: review.sha256,
    review: {
      by: review.reviewer.by,
      coverage: review.reviewer.coverage,
      attestation: 'client-reported',
    },
    completion,
  }
}
