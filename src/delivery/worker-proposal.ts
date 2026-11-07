// Decodes and bounds a worker's proposal.
import { createHash } from 'node:crypto'
import { isObject, type Schema, validate } from '../config/schema.js'
import { safeSourceText } from './input.js'
import proposalSchema from './schemas/worker-proposal-v1.json' with { type: 'json' }
import {
  decodeWorkerResult,
  validateWorkerAssignment,
  type WorkerAssignment,
  WorkerProtocolError,
  type WorkerResult,
  workerCriteriaResponseSchema,
  workerResultArtifacts,
} from './worker-protocol.js'

export const WORKER_PROPOSAL_SCHEMA = proposalSchema
export const INLINE_ARTIFACT_LIMIT = 256 * 1024
export const WORKER_PROPOSAL_LIMIT = 1024 * 1024
type ProposalBoundary = 'encoding' | 'text' | 'json' | 'shape'
const failures = new WeakMap<WorkerProtocolError, { boundary: ProposalBoundary; field?: string }>()

/** Only errors created here have metadata; arbitrary thrown properties never enter a diagnostic. */
export function workerProposalFailure(error: unknown) {
  const detail = error instanceof WorkerProtocolError ? failures.get(error) : undefined
  return detail ? { ...detail } : undefined
}

/** Walk trusted schema names only; unknown keys and array offsets must not become retained text. */
function shapeFailureField(value: unknown, rule: Schema, path = 'proposal'): string {
  if (rule.type === 'object' && isObject(value)) {
    for (const key of rule.required ?? []) if (!Object.hasOwn(value, key)) return `${path}.${key}`
    if (Object.keys(value).some((key) => !Object.hasOwn(rule.properties ?? {}, key)))
      return `${path}.*`
    for (const [key, child] of Object.entries(rule.properties ?? {}))
      if (Object.hasOwn(value, key) && validate(value[key], child).length)
        return shapeFailureField(value[key], child, `${path}.${key}`)
  } else if (rule.type === 'array' && Array.isArray(value) && rule.items) {
    for (const child of value)
      if (validate(child, rule.items).length)
        return shapeFailureField(child, rule.items, `${path}[]`)
  }
  return path
}
export interface WorkerProposal
  extends Pick<WorkerResult, 'status' | 'summary' | 'criteria' | 'findings' | 'unknowns'> {
  schema: 'wholeloop/delivery-worker-proposal@1'
  assignment: string
  artifacts: { ref: string; kind: WorkerResult['artifacts'][number]['kind']; text: string }[]
}
/** The model echoes the exact assignment; deterministic byte metadata belongs to the controller. */
export function workerProposalResponseSchema(assignment: WorkerAssignment) {
  validateWorkerAssignment(assignment)
  const schema: Schema = structuredClone(proposalSchema)
  if (!schema.properties) throw new WorkerProtocolError('response-schema')
  schema.properties.assignment = {
    type: 'string',
    const: assignment.assignment,
  }
  schema.properties.criteria = workerCriteriaResponseSchema(assignment)
  // These controller cells consume one fixed report, even when its JSON body
  // describes a plan. The generic artifact-kind enum otherwise advertises
  // values that the producer stage must reject after an expensive model call.
  if (
    /^artifact:(?:definition|plan|acceptance-definition|build-plan):[a-f0-9]{64}$/.test(
      assignment.identity.cell ?? '',
    )
  ) {
    const fields = schema.properties.artifacts?.items?.properties
    if (!fields?.kind || !fields.ref) throw new WorkerProtocolError('response-schema')
    fields.kind = { ...fields.kind, enum: ['report'], const: 'report' }
    fields.ref = { ...fields.ref, const: 'artifacts/production.json' }
  }
  return schema
}

/** An owned stdout proposal is still a worker claim, never a runtime/QA/decision observation. */
export function decodeWorkerProposal(input: Uint8Array, assignment: WorkerAssignment) {
  validateWorkerAssignment(assignment)
  if (input.byteLength > WORKER_PROPOSAL_LIMIT) throw new WorkerProtocolError('output-limit')
  const bytes = Buffer.from(input),
    text = bytes.toString('utf8')
  let value: unknown
  let boundary: ProposalBoundary = 'encoding'
  try {
    if (!Buffer.from(text).equals(bytes)) throw new Error('Invalid UTF-8')
    boundary = 'text'
    safeSourceText(text, WORKER_PROPOSAL_LIMIT)
    boundary = 'json'
    value = JSON.parse(text)
    boundary = 'shape'
    if (validate(value, proposalSchema as Schema).length) throw new Error('Invalid shape')
  } catch {
    const error = new WorkerProtocolError('invalid-or-unsafe-proposal')
    let field: string | undefined
    try {
      if (boundary === 'shape') field = shapeFailureField(value, proposalSchema)
    } catch {
      // Failure classification cannot replace the original decoder refusal.
    }
    failures.set(error, { boundary, ...(field ? { field } : {}) })
    throw error
  }
  const proposal = value as WorkerProposal
  if (proposal.assignment !== assignment.assignment)
    throw new WorkerProtocolError('result-identity')
  if (proposal.artifacts.length > 100) throw new WorkerProtocolError('output-artifact-limit')
  const bodies = new Map<string, Buffer>()
  let total = 0
  const artifacts = proposal.artifacts.map(({ ref, kind, text }) => {
    if ([...ref].some((char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127))
      throw new WorkerProtocolError('artifact-boundary')
    let body: Buffer
    try {
      // Artifact text is data: empty files, whitespace and literal newlines remain exact.
      // Metadata's nonempty-text rules must not rewrite or reject those bytes.
      safeSourceText(text, INLINE_ARTIFACT_LIMIT)
      body = Buffer.from(text)
    } catch {
      throw new WorkerProtocolError('invalid-or-unsafe-proposal-artifact')
    }
    total += body.length
    if (total > Math.min(INLINE_ARTIFACT_LIMIT, assignment.limits.artifactBytes))
      throw new WorkerProtocolError('output-artifact-limit')
    bodies.set(ref, body)
    return {
      ref,
      kind,
      bytes: body.length,
      sha256: createHash('sha256').update(body).digest('hex'),
    }
  })
  const result = decodeWorkerResult(
    Buffer.from(
      JSON.stringify({
        schema: 'wholeloop/delivery-worker-result@1',
        assignment: assignment.assignment,
        identity: structuredClone(assignment.identity),
        origin: 'worker-claim',
        status: proposal.status,
        summary: proposal.summary,
        criteria: proposal.criteria,
        findings: proposal.findings,
        unknowns: proposal.unknowns,
        artifacts,
      }),
    ),
    assignment,
  )
  const observed = workerResultArtifacts(assignment, result, (artifact) => {
    const body = bodies.get(artifact.ref)
    if (!body) throw new WorkerProtocolError('unobserved-output-artifact')
    return body
  })
  return { result, artifacts: observed }
}
