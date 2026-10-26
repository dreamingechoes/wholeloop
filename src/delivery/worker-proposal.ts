import { createHash } from 'node:crypto'
import { type Schema, validate } from '../config/schema.js'
import { safeSourceText } from './input.js'
import proposalSchema from './schemas/worker-proposal-v1.json' with { type: 'json' }
import {
  decodeWorkerResult,
  validateWorkerAssignment,
  type WorkerAssignment,
  WorkerProtocolError,
  type WorkerResult,
  workerResultArtifacts,
} from './worker-protocol.js'

export const WORKER_PROPOSAL_SCHEMA = proposalSchema
export const INLINE_ARTIFACT_LIMIT = 256 * 1024
export const WORKER_PROPOSAL_LIMIT = 1024 * 1024
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
  return schema
}

/** An owned stdout proposal is still a worker claim, never a runtime/QA/decision observation. */
export function decodeWorkerProposal(input: Uint8Array, assignment: WorkerAssignment) {
  validateWorkerAssignment(assignment)
  if (input.byteLength > WORKER_PROPOSAL_LIMIT) throw new WorkerProtocolError('output-limit')
  const bytes = Buffer.from(input),
    text = bytes.toString('utf8')
  let value: unknown
  try {
    if (!Buffer.from(text).equals(bytes)) throw new Error('Invalid UTF-8')
    safeSourceText(text, WORKER_PROPOSAL_LIMIT)
    value = JSON.parse(text)
    if (validate(value, proposalSchema as Schema).length) throw new Error('Invalid shape')
  } catch {
    throw new WorkerProtocolError('invalid-or-unsafe-proposal')
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
