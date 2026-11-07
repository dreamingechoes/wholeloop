// The worker protocol: roles, identities, tools, assignments and results.
import { createHash } from 'node:crypto'
import type { Schema } from '../config/schema.js'
import { contractDigest } from '../contracts/compatibility.js'
import type { BrokerBoundary } from './broker.js'
import type { BudgetLimits } from './budget-events.js'
import { rejectSourceCredentials, safeSourceText } from './input.js'
import { type DeliveryPolicy, validateDeliveryShape } from './plan.js'
import assignmentSchema from './schemas/worker-assignment-v1.json' with { type: 'json' }
import executionSchema from './schemas/worker-execution-v1.json' with { type: 'json' }
import resultSchema from './schemas/worker-result-v1.json' with { type: 'json' }

export const WORKER_SCHEMAS = {
  assignment: assignmentSchema,
  result: resultSchema,
  execution: executionSchema,
}
export type WorkerRole =
  | 'builder'
  | 'verifier'
  | 'reviewer'
  | 'refuter'
  | 'researcher'
  | 'planner'
  | 'challenger'
export interface WorkerIdentity {
  run: string
  plan: string
  revision: number
  role: WorkerRole
  attempt: string
  generation: number
  unit?: string
  cell?: string
}
export interface WorkerArtifact {
  ref: string
  sha256: string
  bytes: number
}
export interface WorkerContext {
  kind:
    | 'source'
    | 'criterion'
    | 'guidance'
    | 'contract'
    | 'kept-finding'
    | 'resume'
    | 'hidden-acceptance'
  artifact: WorkerArtifact
  audience: 'shared' | 'assignment'
  attempt?: string
}
export interface WorkerTools {
  workspace: 'none' | 'read-only' | 'write'
  artifacts: 'own-output-only'
  broker: string[]
  askUser: false
  interactive: false
  /** The client's own read-only web search and fetch, for a research job only (ADR-0204). */
  web?: 'read'
}
export interface WorkerAssignment {
  schema: 'wholeloop/delivery-worker-assignment@1'
  assignment: string
  identity: WorkerIdentity
  grantDigest: string
  source: string
  brief: string
  endpoint: DeliveryPolicy['endpoint']
  intervention: 'supervised' | 'on-exception' | 'none'
  environment: { id: string; recipe: string; boundary: string }
  candidates: { repository: string; head: string; snapshot: string }[]
  criteria: string[]
  findings: string[]
  contracts: string[]
  context: WorkerContext[]
  tools: WorkerTools
  deadline: string
  limits: BudgetLimits
}
export interface WorkerResult {
  schema: 'wholeloop/delivery-worker-result@1'
  assignment: string
  identity: WorkerIdentity
  status: 'complete' | 'blocked' | 'unavailable' | 'failed'
  origin: 'worker-claim'
  summary: string
  artifacts: (WorkerArtifact & { kind: 'plan' | 'patch' | 'report' | 'evidence' })[]
  criteria: { id: string; status: 'pass' | 'fail' | 'unavailable'; evidence: string[] }[]
  findings: { id: string; text: string; evidence: string[]; criterion?: string }[]
  unknowns: { question: string; reason: string; owner: string }[]
}
export interface WorkerExecution {
  schema: 'wholeloop/delivery-worker-execution@1'
  assignment: string
  identity: WorkerIdentity
  runtime: { backend: string; instance: string; worker: string }
  status:
    | 'succeeded'
    | 'failed'
    | 'timed-out'
    | 'cancelled'
    | 'invalid-output'
    | 'changed'
    | 'stale'
  code?: number
  stdout: string
  stderr: string
  result?: string
  startedAt: string
  finishedAt: string
  provenance: 'fixture' | 'host-observed'
  origin: 'controller-observation'
  acceptance: 'not-established'
}
export class WorkerProtocolError extends Error {
  constructor(readonly problem: string) {
    super(`Delivery worker refused: ${problem}; contents omitted`)
  }
}
const METHODS: Record<WorkerRole, string[]> = {
  builder: ['artifact.propose', 'effect.request'],
  verifier: ['evidence.submit'],
  reviewer: ['finding.submit'],
  refuter: ['evidence.submit'],
  researcher: ['artifact.propose', 'source.read'],
  planner: [],
  challenger: [],
}
export function workerTools(role: WorkerRole, web = false): WorkerTools {
  if (!Object.hasOwn(METHODS, role)) throw new WorkerProtocolError('role')
  return {
    ...(web ? { web: 'read' as const } : {}),
    workspace:
      role === 'builder'
        ? 'write'
        : ['planner', 'challenger'].includes(role)
          ? 'none'
          : 'read-only',
    artifacts: 'own-output-only',
    broker: [...METHODS[role]],
    askUser: false,
    interactive: false,
  }
}
function shape(
  value: unknown,
  schema: typeof assignmentSchema | typeof resultSchema | typeof executionSchema,
  maximum: number,
) {
  try {
    safeSourceText(JSON.stringify(value), maximum)
    validateDeliveryShape(value, schema)
  } catch {
    throw new WorkerProtocolError('invalid-or-unsafe-shape')
  }
}
function ref(value: string): void {
  if (
    !value.startsWith('artifacts/') ||
    value.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw new WorkerProtocolError('artifact-boundary')
}
function utc(value: string): number {
  const time = Date.parse(value)
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value)
    throw new WorkerProtocolError('time')
  return time
}
export function validateWorkerAssignment(value: unknown): asserts value is WorkerAssignment {
  shape(value, assignmentSchema, 2 * 1024 * 1024)
  const assignment = value as WorkerAssignment
  const { assignment: digest, ...body } = assignment
  const identity = assignment.identity
  if (digest !== contractDigest(body)) throw new WorkerProtocolError('assignment-digest')
  // Web reads exist only for an owned research job, whose cell the research
  // attempts derive from the job key; no other role or cell can ask for them.
  const web = assignment.tools.web === 'read'
  if (
    contractDigest(assignment.tools) !== contractDigest(workerTools(identity.role, web)) ||
    (web &&
      !(
        (identity.role === 'planner' && identity.cell?.startsWith('research:angle:')) ||
        (identity.role === 'challenger' && identity.cell?.startsWith('research:claim:'))
      ))
  )
    throw new WorkerProtocolError('role-tools')
  if (
    (identity.revision === 0 && !['planner', 'challenger'].includes(identity.role)) ||
    (identity.revision > 0 &&
      !identity.unit &&
      !['planner', 'challenger'].includes(identity.role)) ||
    (identity.role === 'builder' && identity.cell !== undefined)
  )
    throw new WorkerProtocolError('identity')
  utc(assignment.deadline)
  if (
    new Set(assignment.candidates.map((item) => item.repository)).size !==
    assignment.candidates.length
  )
    throw new WorkerProtocolError('candidate-repository')
  if (
    new Set(assignment.context.map((item) => item.artifact.ref)).size !== assignment.context.length
  )
    throw new WorkerProtocolError('context-alias')
  if (assignment.context.reduce((total, item) => total + item.artifact.bytes, 0) > 1024 * 1024)
    throw new WorkerProtocolError('resume-limit')
  for (const context of assignment.context) {
    ref(context.artifact.ref)
    if (
      (context.audience === 'assignment' && context.attempt !== identity.attempt) ||
      (context.audience === 'shared' && context.attempt !== undefined)
    )
      throw new WorkerProtocolError('context-owner')
    if (
      context.kind === 'hidden-acceptance' &&
      (identity.role !== 'verifier' || context.audience !== 'assignment')
    )
      throw new WorkerProtocolError('hidden-acceptance')
  }
}
export function createWorkerAssignment(
  input: Omit<WorkerAssignment, 'schema' | 'assignment' | 'tools'>,
  options: { web?: boolean } = {},
): WorkerAssignment {
  const body = {
    ...structuredClone(input),
    schema: 'wholeloop/delivery-worker-assignment@1' as const,
    tools: workerTools(input.identity.role, options.web === true),
  }
  const assignment = { ...body, assignment: contractDigest(body) }
  validateWorkerAssignment(assignment)
  return assignment
}

/** Only explicit pinned references enter a fresh context; never recover permissions from conversation text. */
export function workerResumePack(
  assignment: WorkerAssignment,
  read: (artifact: Readonly<WorkerArtifact>) => Uint8Array,
) {
  validateWorkerAssignment(assignment)
  return assignment.context.map((context) => {
    const bytes = Buffer.from(read(structuredClone(context.artifact)))
    rejectSourceCredentials(bytes.toString('utf8'))
    if (
      bytes.length !== context.artifact.bytes ||
      createHash('sha256').update(bytes).digest('hex') !== context.artifact.sha256
    )
      throw new WorkerProtocolError('changed-context')
    return { context: structuredClone(context), bytes }
  })
}

export function decodeWorkerResult(input: Uint8Array, assignment: WorkerAssignment): WorkerResult {
  validateWorkerAssignment(assignment)
  if (input.byteLength > 1024 * 1024) throw new WorkerProtocolError('output-limit')
  const bytes = Buffer.from(input),
    text = bytes.toString('utf8')
  if (!Buffer.from(text).equals(bytes)) throw new WorkerProtocolError('output-encoding')
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new WorkerProtocolError('truncated-or-invalid-output')
  }
  shape(value, resultSchema, 1024 * 1024)
  const result = value as WorkerResult
  if (
    result.assignment !== assignment.assignment ||
    contractDigest(result.identity) !== contractDigest(assignment.identity)
  )
    throw new WorkerProtocolError('result-identity')
  if (
    (assignment.identity.role !== 'verifier' && result.criteria.length) ||
    result.criteria.some((item) => !assignment.criteria.includes(item.id)) ||
    new Set(result.criteria.map((item) => item.id)).size !== result.criteria.length ||
    new Set(result.findings.map((item) => item.id)).size !== result.findings.length ||
    result.findings.some((item) => item.criterion && !assignment.criteria.includes(item.criterion))
  )
    throw new WorkerProtocolError('result-scope')
  const references = new Set(assignment.context.map((item) => item.artifact.ref))
  for (const artifact of result.artifacts) {
    ref(artifact.ref)
    if (references.has(artifact.ref)) throw new WorkerProtocolError('output-overwrites-input')
    references.add(artifact.ref)
  }
  if (
    [...result.criteria, ...result.findings].some((item) =>
      item.evidence.some((path) => !references.has(path)),
    )
  )
    throw new WorkerProtocolError('unknown-evidence')
  return structuredClone(result)
}

/** Artifact claims become byte observations only through the host's bounded owned-output reader. */
export function workerResultArtifacts(
  assignment: WorkerAssignment,
  result: WorkerResult,
  read: (artifact: Readonly<WorkerArtifact>) => Uint8Array,
) {
  decodeWorkerResult(Buffer.from(JSON.stringify(result)), assignment)
  if (
    result.artifacts.reduce((total, artifact) => total + artifact.bytes, 0) >
    assignment.limits.artifactBytes
  )
    throw new WorkerProtocolError('output-artifact-limit')
  return result.artifacts.map((artifact) => {
    const bytes = Buffer.from(read(structuredClone(artifact)))
    rejectSourceCredentials(bytes.toString('utf8'))
    if (
      bytes.length !== artifact.bytes ||
      createHash('sha256').update(bytes).digest('hex') !== artifact.sha256
    )
      throw new WorkerProtocolError('changed-output-artifact')
    return { artifact: structuredClone(artifact), bytes }
  })
}

/** Generation must not invite criterion claims that the role decoder forbids. */
export function workerCriteriaResponseSchema(assignment: WorkerAssignment): Schema {
  validateWorkerAssignment(assignment)
  const rule: Schema = structuredClone(resultSchema.properties.criteria)
  if (assignment.identity.role !== 'verifier' || !assignment.criteria.length)
    return Object.assign(rule, { maxItems: 0 })
  if (!rule.items?.properties?.id) throw new WorkerProtocolError('response-schema')
  rule.items.properties.id = { type: 'string', enum: [...assignment.criteria] }
  return rule
}

export function workerResponseSchema(assignment: WorkerAssignment) {
  validateWorkerAssignment(assignment)
  const schema: Schema = structuredClone(resultSchema)
  if (!schema.properties) throw new WorkerProtocolError('response-schema')
  schema.properties.assignment = { type: 'string', const: assignment.assignment }
  schema.properties.criteria = workerCriteriaResponseSchema(assignment)
  schema.properties.identity = {
    type: 'object',
    additionalProperties: false,
    required: Object.keys(assignment.identity),
    properties: Object.fromEntries(
      Object.entries(assignment.identity).map(([key, value]) => [
        key,
        {
          type: typeof value === 'number' ? 'integer' : 'string',
          const: value,
        },
      ]),
    ),
  }

  return schema
}

/** This accepts controller host observations, never fields parsed from worker output. */
export function stampWorkerExecution(
  assignment: WorkerAssignment,
  observation: Omit<
    WorkerExecution,
    'schema' | 'assignment' | 'identity' | 'origin' | 'acceptance' | 'result'
  >,
  options: {
    result?: WorkerResult
    readArtifact?: (artifact: Readonly<WorkerArtifact>) => Uint8Array
    boundary: BrokerBoundary
    current: () => boolean
    tools: WorkerTools
  },
): WorkerExecution {
  validateWorkerAssignment(assignment)
  const boundary = options.boundary
  if (
    boundary.assignment !== assignment.assignment ||
    boundary.instance !== observation.runtime.instance ||
    boundary.containment !== 'isolated' ||
    boundary.controllerStore !== 'denied' ||
    boundary.credentials !== 'denied' ||
    boundary.tools !== 'restricted' ||
    boundary.interactive !== 'disabled' ||
    boundary.provenance !== observation.provenance ||
    contractDigest(options.tools) !== contractDigest(assignment.tools)
  )
    throw new WorkerProtocolError('unobserved-boundary')
  if (utc(observation.finishedAt) < utc(observation.startedAt))
    throw new WorkerProtocolError('execution-time')
  if (
    observation.status === 'succeeded' &&
    (observation.code !== 0 ||
      !options.result ||
      utc(observation.finishedAt) >= utc(assignment.deadline) ||
      !options.current())
  )
    throw new WorkerProtocolError('unobserved-success')
  if (options.result) decodeWorkerResult(Buffer.from(JSON.stringify(options.result)), assignment)
  if (observation.status === 'succeeded' && options.result) {
    if (options.result.artifacts.length && !options.readArtifact)
      throw new WorkerProtocolError('unobserved-output-artifact')
    workerResultArtifacts(
      assignment,
      options.result,
      options.readArtifact ?? (() => new Uint8Array()),
    )
    if (!options.current()) throw new WorkerProtocolError('stale-after-artifact-read')
  }

  const receipt: WorkerExecution = {
    ...structuredClone(observation),
    schema: 'wholeloop/delivery-worker-execution@1',
    assignment: assignment.assignment,
    identity: structuredClone(assignment.identity),
    origin: 'controller-observation',
    acceptance: 'not-established',
    ...(options.result ? { result: contractDigest(options.result) } : {}),
  }
  shape(receipt, executionSchema, 1024 * 1024)
  return receipt
}
