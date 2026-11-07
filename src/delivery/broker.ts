// The delivery broker that leases scoped capabilities to workers within a grant.
import { existsSync } from 'node:fs'
import { isObject } from '../config/schema.js'
import { contractDigest } from '../contracts/compatibility.js'
import type { DeliveryAuthority, DeliveryEffect } from './authority.js'
import { readSourceFile, safeSourceText } from './input.js'
import { checkPlanEnvelope, deliveryPlanRoute, validateDeliveryShape } from './plan.js'
import receiptSchema from './schemas/broker-receipt-v1.json' with { type: 'json' }
import requestSchema from './schemas/broker-request-v1.json' with { type: 'json' }

export const BROKER_REQUEST_SCHEMA = requestSchema
export const BROKER_RECEIPT_SCHEMA = receiptSchema
export type BrokerRole = 'builder' | 'verifier' | 'reviewer' | 'refuter' | 'researcher'
export interface BrokerScope {
  grant: string
  run: string
  revision: number
  plan: string
  unit: string
  attempt: string
  generation: number
  role: BrokerRole
  runtime: string
  criteria: string[]
  findings: string[]
  contracts: string[]
}
export interface BrokerBoundary {
  instance: string
  assignment: string
  containment: 'isolated' | 'non-contained'
  controllerStore: 'denied' | 'unverified'
  credentials: 'denied' | 'unverified'
  tools: 'restricted' | 'unverified'
  interactive: 'disabled' | 'permitted' | 'unverified'
  provenance: 'host-observed' | 'fixture'
}
/** Read-only lease observations belong to the controller, never worker JSON or nested mutations. */
export interface TrustedBrokerRuntime {
  observe(scope: Readonly<BrokerScope>): BrokerBoundary
  current(scope: Readonly<BrokerScope>): boolean
  planAccepted(grant: string, plan: string): boolean
  ownsBranch(scope: Readonly<BrokerScope>, repository: string, branch: string): boolean
}
interface BrokerMessage {
  schema: 'wholeloop/delivery-broker-request@1'
  id: string
  method:
    | 'artifact.propose'
    | 'evidence.submit'
    | 'finding.submit'
    | 'source.read'
    | 'effect.request'
  data: Record<string, string>
}
export interface BrokerReceipt {
  schema: 'wholeloop/delivery-broker-receipt@1'
  request: string | null
  status: 'recorded' | 'denied'
  reason: string
  assignment: string
  origin: 'worker-claim'
  effects: 'not-performed'
  runtime?: BrokerBoundary['provenance']
}
const ROLE_METHODS: Record<BrokerRole, BrokerMessage['method'][]> = {
  builder: ['artifact.propose', 'effect.request'],
  verifier: ['evidence.submit'],
  reviewer: ['finding.submit'],
  refuter: ['evidence.submit'],
  researcher: ['artifact.propose', 'source.read'],
}
class BrokerRequestError extends Error {}
class BrokerContextError extends Error {}

function message(value: unknown): BrokerMessage {
  if (
    !isObject(value) ||
    Object.keys(value).some((key) => !['schema', 'id', 'method', 'data'].includes(key))
  )
    throw new BrokerRequestError('invalid-message')
  const rule = requestSchema.oneOf.find((entry) => entry.properties.method.const === value.method)
  if (!rule) throw new BrokerRequestError('invalid-message')
  try {
    validateDeliveryShape(value, rule)
  } catch {
    throw new BrokerRequestError('invalid-message')
  }
  const text = JSON.stringify(value)
  if (Buffer.byteLength(text) > 65536) throw new BrokerRequestError('message-limit')
  try {
    safeSourceText(text, 65536)
  } catch {
    throw new BrokerRequestError('unsafe-message')
  }
  const result = structuredClone(value) as unknown as BrokerMessage
  const ref = result.data.ref
  if (
    ref !== undefined &&
    (!/^artifacts\/[a-zA-Z0-9][a-zA-Z0-9._/-]{0,4095}$/.test(ref) ||
      ref.split('/').some((part) => part === '.' || part === '..'))
  )
    throw new BrokerRequestError('artifact-boundary')
  return result
}

/** A session closes over controller-selected identity; workers supply only a bounded request. */
export class DeliveryBroker {
  constructor(
    readonly authority: DeliveryAuthority,
    readonly runtime: TrustedBrokerRuntime,
  ) {}

  open(value: BrokerScope) {
    const scope = structuredClone(value)
    if (
      !/^attempt-[a-f0-9]{16}$/.test(scope.attempt) ||
      !Number.isSafeInteger(scope.generation) ||
      scope.generation < 1 ||
      !Object.hasOwn(ROLE_METHODS, scope.role)
    )
      throw new Error('Invalid controller broker scope; contents omitted')
    const assignment = contractDigest(scope)
    try {
      this.context(scope, assignment)
      return {
        available: true,
        assignment,
        request: (value: unknown) => this.receive(scope, assignment, value),
      }
    } catch (error) {
      const reason =
        error instanceof BrokerContextError ? error.message : 'unavailable-or-damaged-context'
      return {
        available: false,
        assignment,
        request: (value: unknown) => this.denied(assignment, value, reason),
      }
    }
  }

  private context(scope: BrokerScope, assignment: string) {
    if (!this.runtime.current(scope)) throw new BrokerContextError('stale-assignment')
    const authority = this.authority.inspect(scope.grant)
    if (authority.status !== 'active') throw new BrokerContextError(`grant-${authority.status}`)
    const prepared = this.authority.planning.getPlan(scope.run, scope.revision)
    if (prepared.digest !== scope.plan) throw new BrokerContextError('plan-mismatch')
    const grant = authority.grant
    if (grant.basis.kind === 'plan') {
      if (
        grant.basis.digest !== scope.plan ||
        grant.basis.run !== scope.run ||
        grant.basis.revision !== scope.revision
      )
        throw new BrokerContextError('grant-plan-mismatch')
    } else {
      if (prepared.plan.envelope !== grant.basis.digest)
        throw new BrokerContextError('grant-envelope-mismatch')
      checkPlanEnvelope(
        prepared.plan,
        this.authority.planning.getEnvelope(grant.basis.digest).envelope,
      )
      if (
        !grant.decisions.includes('delivery-plan') ||
        !this.runtime.planAccepted(authority.digest, scope.plan)
      )
        throw new BrokerContextError('unaccepted-derived-plan')
    }
    const unit = prepared.plan.work.find((entry) => entry.id === scope.unit)
    if (
      !unit ||
      scope.criteria.some((id) => !unit.criteria.includes(id)) ||
      scope.contracts.some(
        (id) => ![...unit.produces.map((entry) => entry.id), ...unit.consumes].includes(id),
      )
    )
      throw new BrokerContextError('assignment-scope')
    if (
      (scope.role === 'builder' && unit.role === 'research') ||
      (scope.role === 'researcher' && unit.role !== 'research')
    )
      throw new BrokerContextError('assignment-role')
    const boundary = this.runtime.observe(scope)
    if (
      boundary.instance !== scope.runtime ||
      boundary.assignment !== assignment ||
      boundary.containment !== 'isolated' ||
      boundary.controllerStore !== 'denied' ||
      boundary.credentials !== 'denied' ||
      boundary.tools !== 'restricted' ||
      !['fixture', 'host-observed'].includes(boundary.provenance)
    )
      throw new BrokerContextError('unavailable-boundary')
    if (grant.policy.intervention === 'none' && boundary.interactive !== 'disabled')
      throw new BrokerContextError('interactive-runtime')
    if (
      deliveryPlanRoute(prepared.plan).next === 'blocked' ||
      (scope.role === 'builder' && !prepared.plan.definition.ready)
    )
      throw new BrokerContextError('definition-not-ready')
    return { grant, unit, boundary, prepared }
  }

  private denied(assignment: string, value: unknown, reason: string): BrokerReceipt {
    const requestId =
      isObject(value) && typeof value.id === 'string' && /^request-[a-f0-9]{16}$/.test(value.id)
        ? value.id
        : null
    return {
      schema: 'wholeloop/delivery-broker-receipt@1',
      request: requestId,
      status: 'denied',
      reason,
      assignment,
      origin: 'worker-claim',
      effects: 'not-performed',
    }
  }

  private receive(scope: BrokerScope, assignment: string, value: unknown): BrokerReceipt {
    const deny = (reason: string) => this.denied(assignment, value, reason)
    let request: BrokerMessage
    try {
      request = message(value)
    } catch (error) {
      return deny(error instanceof BrokerRequestError ? error.message : 'invalid-message')
    }
    try {
      return this.authority.planning.sources.files.locked(() => {
        const { grant, unit, boundary, prepared } = this.context(scope, assignment)
        if (!ROLE_METHODS[scope.role].includes(request.method)) return deny('role-method')
        const data = request.data
        if (
          request.method === 'artifact.propose' &&
          ((scope.role === 'builder' && !['plan', 'patch'].includes(data.kind ?? '')) ||
            (scope.role === 'researcher' && !['plan', 'report'].includes(data.kind ?? '')))
        )
          return deny('artifact-role')
        if (request.method === 'evidence.submit') {
          if (
            ['criterion', 'finding', 'contract'].filter((key) => data[key] !== undefined).length !==
            1
          )
            return deny('ambiguous-evidence-scope')
          if (
            scope.role === 'refuter'
              ? !scope.findings.includes(data.finding ?? '')
              : !(
                  scope.criteria.includes(data.criterion ?? '') ||
                  scope.contracts.includes(data.contract ?? '')
                )
          )
            return deny('evidence-scope')
        }
        if (
          request.method === 'source.read' &&
          (!grant.effects.includes('source.read') ||
            !grant.reads.some(
              (rule) =>
                rule.provider === data.provider &&
                rule.scope === data.scope &&
                rule.operations.includes(data.operation ?? ''),
            ))
        )
          return deny('read-scope')
        if (request.method === 'effect.request') {
          // Publication/merge remains a controller operation after actual eligibility, never a worker RPC.
          if (data.effect !== 'git.commit') return deny('controller-only-effect')
          const selected = grant.repositories.find((entry) => entry.repository === data.repository)
          const repo = prepared.plan.repositories.find((entry) => entry.id === data.repository)
          if (
            !grant.effects.includes(data.effect as DeliveryEffect) ||
            !selected ||
            !repo ||
            unit.repository !== repo.id ||
            !data.branch?.startsWith(selected.topicPrefix) ||
            !/^wl\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(data.branch) ||
            `refs/heads/${data.branch}` === repo.target ||
            !this.runtime.ownsBranch(scope, repo.id, data.branch)
          )
            return deny('effect-scope')
        }
        const path = `delivery/broker/${scope.attempt}/${scope.generation}/${request.id}.json`
        const input = contractDigest(request)
        const receipt: BrokerReceipt = {
          schema: 'wholeloop/delivery-broker-receipt@1',
          request: request.id,
          status: 'recorded',
          reason: 'scoped-request',
          assignment,
          origin: 'worker-claim',
          effects: 'not-performed',
          runtime: boundary.provenance,
        }
        if (existsSync(this.authority.planning.sources.files.path(path))) {
          const existing: unknown = JSON.parse(
            readSourceFile(this.authority.planning.sources.files.root, path, 65536),
          )
          if (
            !isObject(existing) ||
            Object.keys(existing).length !== 4 ||
            !isObject(existing.request) ||
            !isObject(existing.receipt) ||
            existing.digest !==
              contractDigest({
                input: existing.input,
                request: existing.request,
                receipt: existing.receipt,
              }) ||
            existing.input !== input ||
            contractDigest(existing.request) !== input ||
            contractDigest(existing.receipt) !== contractDigest(receipt)
          )
            return deny('request-id-conflict')
          return receipt
        }
        // Retain claims as claims. No payload can append a legacy decision or human test receipt.
        this.authority.planning.sources.files.atomic(
          path,
          `${JSON.stringify({ input, request, receipt, digest: contractDigest({ input, request, receipt }) })}\n`,
        )
        return receipt
      })
    } catch (error) {
      return deny(
        error instanceof BrokerContextError ? error.message : 'unavailable-or-damaged-context',
      )
    }
  }
}

/** Construct a fresh environment rather than filtering an inherited credential-bearing one. */
export function deliveryWorkerEnvironment(input: {
  home: string
  path: string
  temp: string
  run: string
  attempt: string
}): NodeJS.ProcessEnv {
  for (const value of Object.values(input)) {
    safeSourceText(value, 4096)
    if (!value.trim() || value.includes('\n') || value.includes('\r'))
      throw new Error('Invalid worker environment; contents omitted')
  }
  return {
    HOME: input.home,
    PATH: input.path,
    TMPDIR: input.temp,
    LANG: 'C',
    NO_COLOR: '1',
    GIT_TERMINAL_PROMPT: '0',
    WL_DELIVERY_RUN: input.run,
    WL_DELIVERY_ATTEMPT: input.attempt,
  }
}
