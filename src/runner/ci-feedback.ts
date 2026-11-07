// Validates CI feedback and its evidence identity.
import { contractDigest } from '../contracts/compatibility.js'
import { validateDeliveryShape } from '../delivery/plan.js'
import { DeliveryRunnerError } from './route.js'
import schema from './schemas/ci-feedback-v1.json' with { type: 'json' }

export interface CiFeedbackRead {
  schema: 'wholeloop/delivery-ci-feedback@1'
  repository: string
  pr: string
  head: string
  base: string
  observedAt: string
  complete: true
  items: {
    identity: string
    origin: 'pr-comment'
    revision: string
    current: boolean
    adopted: false
    source: 'issue-comment' | 'review-comment' | 'review'
    revisionSource: 'host-commit' | 'current-head-snapshot'
  }[]
  provenance: 'fixture' | 'host-observed'
  evidence: string
}
/** Semantic identity excludes the observation clock, not any feedback or binding. */
export function ciFeedbackEvidence(value: Omit<CiFeedbackRead, 'evidence'>) {
  return contractDigest({
    repository: value.repository,
    pr: value.pr,
    head: value.head,
    base: value.base,
    complete: value.complete,
    items: value.items,
  })
}
export function validateCiFeedback(value: unknown): asserts value is CiFeedbackRead {
  validateDeliveryShape(value, schema)
  const read = value as CiFeedbackRead
  if (
    !Number.isFinite(Date.parse(read.observedAt)) ||
    new Date(read.observedAt).toISOString() !== read.observedAt ||
    read.evidence !== ciFeedbackEvidence(read) ||
    new Set(read.items.map((item) => item.identity)).size !== read.items.length ||
    read.items.some((item) => item.current !== (item.revision === read.head))
  )
    throw new DeliveryRunnerError('ci-feedback-binding')
}
