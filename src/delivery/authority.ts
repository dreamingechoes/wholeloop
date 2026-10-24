import { existsSync } from 'node:fs'
import { contractDigest } from '../contracts/compatibility.js'
import { OPERATIONS } from '../providers/taxonomy.js'
import { readSourceFile, safeSourceText } from './input.js'
import type { DeliveryBasis } from './plan.js'
import { deliveryPlanRoute, observePlanBases, validateDeliveryShape } from './plan.js'
import { DeliveryPlanning } from './planning-store.js'
import requestSchema from './schemas/authorization-request-v1.json' with { type: 'json' }
import grantSchema from './schemas/grant-v1.json' with { type: 'json' }
import revokeSchema from './schemas/revocation-request-v1.json' with { type: 'json' }
import revocationSchema from './schemas/revocation-v1.json' with { type: 'json' }

export const AUTHORIZATION_REQUEST_SCHEMA = requestSchema
export const REVOCATION_REQUEST_SCHEMA = revokeSchema
export const DELIVERY_EFFECTS = [
  'source.read',
  'report.write',
  'workspace.create',
  'code.write',
  'test.run',
  'git.commit',
  'git.push',
  'pr.create',
  'pr.update',
  'pr.ready',
  'pr.merge',
] as const
export type DeliveryEffect = (typeof DELIVERY_EFFECTS)[number]
export interface AuthorizationRequest {
  schema: 'wholeloop/delivery-authorization-request@1'
  id: string
  operator: string
  basis: { kind: 'plan' | 'envelope'; digest: string; run?: string; revision?: number }
  expiresAt?: string
  effects: DeliveryEffect[]
  decisions: string[]
  repositories: { repository: string; topicPrefix: string; remote?: string }[]
  reads: { provider: string; scope: string; operations: string[] }[]
  effectLimit: number
}
export interface DeliveryGrant extends Omit<AuthorizationRequest, 'schema' | 'expiresAt'> {
  schema: 'wholeloop/delivery-grant@1'
  requestDigest: string
  issuedAt: string
  expiresAt: string
  source: string
  owner: string
  policy: DeliveryBasis['policy']
  budgets: DeliveryBasis['budgets']
  provenance: 'operator-control'
}
export interface RevocationRequest {
  schema: 'wholeloop/delivery-revocation-request@1'
  grant: string
  operator: string
  reason: string
}
interface Revocation extends Omit<RevocationRequest, 'schema'> {
  schema: 'wholeloop/delivery-revocation@1'
  at: string
  provenance: 'operator-control'
}
export interface AuthorizationReceipt {
  schema: 'wholeloop/delivery-authorization@1'
  digest: string
  grant: DeliveryGrant
  status: 'active' | 'expired' | 'revoked' | 'clock-invalid'
  revocation: Revocation | null
  runtime: 'not-observed-by-this-command'
}
export class DeliveryAuthorityError extends Error {
  constructor(readonly problem: string) {
    super(`Delivery authority refused: ${problem}; contents omitted`)
  }
}
function utc(value: string): number {
  const time = Date.parse(value)
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value)
    throw new DeliveryAuthorityError('invalid-time')
  return time
}
export function deliveryReadOperation(operation: string): boolean {
  return (
    OPERATIONS.has(operation) &&
    ((operation.startsWith('source.') && operation.endsWith('.query')) ||
      [
        'tracker.read-item',
        'docs.read',
        'codehost.read-pr',
        'codehost.pr-status',
        'dashboards.read',
        'flags.read-state',
        'design.read-context',
      ].includes(operation))
  )
}
function safeShape(
  value: unknown,
  schema: typeof requestSchema | typeof grantSchema | typeof revokeSchema | typeof revocationSchema,
): void {
  try {
    validateDeliveryShape(value, schema)
    safeSourceText(JSON.stringify(value), 1024 * 1024)
  } catch {
    throw new DeliveryAuthorityError('invalid-or-unsafe-input')
  }
}

/** The control-plane entrypoint is never exposed as a worker broker method. */
export class DeliveryAuthority {
  readonly planning: DeliveryPlanning
  constructor(
    store?: string,
    readonly now: () => string = () => new Date().toISOString(),
  ) {
    this.planning = new DeliveryPlanning(store)
  }

  authorize(value: unknown) {
    safeShape(value, requestSchema)
    const request = structuredClone(value) as AuthorizationRequest
    this.id(request.id)
    const requestDigest = contractDigest(request)
    return this.planning.sources.files.locked(() => {
      if (existsSync(this.planning.sources.files.path(this.path(request.id)))) {
        const existing = this.inspect(request.id)
        if (existing.grant.requestDigest !== requestDigest)
          throw new DeliveryAuthorityError('authorization-id-conflict')
        return existing
      }
      const basis = this.basis(request.basis)
      this.check(request, basis)
      observePlanBases(basis.repositories)
      const issuedAt = this.now(),
        issued = utc(issuedAt)
      const expiresAt = request.expiresAt ?? new Date(issued + 24 * 60 * 60 * 1000).toISOString()
      if (utc(expiresAt) <= issued) throw new DeliveryAuthorityError('expired-authorization')
      const grant: DeliveryGrant = {
        ...request,
        schema: 'wholeloop/delivery-grant@1',
        requestDigest,
        issuedAt,
        expiresAt,
        source: basis.source,
        owner: basis.owner,
        policy: basis.policy,
        budgets: basis.budgets,
        provenance: 'operator-control',
      }
      safeShape(grant, grantSchema)
      this.write(this.path(grant.id), grant)
      return this.inspect(grant.id)
    })
  }

  inspect(id: string): AuthorizationReceipt {
    this.id(id)
    const grant = this.read(this.path(id)) as unknown as DeliveryGrant
    safeShape(grant, grantSchema)
    if (grant.id !== id) throw new DeliveryAuthorityError('grant-identity')
    const revocationPath = `delivery/authority/revocations/${id}.json`
    const revocation = existsSync(this.planning.sources.files.path(revocationPath))
      ? (this.read(revocationPath) as unknown as Revocation)
      : null
    if (revocation) {
      safeShape(revocation, revocationSchema)
      if (revocation.grant !== id) throw new DeliveryAuthorityError('revocation-identity')
      utc(revocation.at)
    }
    const current = utc(this.now())
    const status = revocation
      ? 'revoked'
      : current < utc(grant.issuedAt)
        ? 'clock-invalid'
        : current >= utc(grant.expiresAt)
          ? 'expired'
          : 'active'
    return {
      schema: 'wholeloop/delivery-authorization@1',
      digest: contractDigest(grant),
      grant,
      status,
      revocation,
      runtime: 'not-observed-by-this-command',
    }
  }

  revoke(value: unknown) {
    safeShape(value, revokeSchema)
    const request = structuredClone(value) as RevocationRequest
    this.id(request.grant)
    return this.planning.sources.files.locked(() => {
      const existing = this.inspect(request.grant)
      if (existing.revocation) return existing
      const at = this.now()
      utc(at)
      this.write(`delivery/authority/revocations/${request.grant}.json`, {
        ...request,
        schema: 'wholeloop/delivery-revocation@1',
        at,
        provenance: 'operator-control',
      })
      return this.inspect(request.grant)
    })
  }

  basis(reference: AuthorizationRequest['basis']): DeliveryBasis {
    if (reference.kind === 'envelope') {
      if (reference.run !== undefined || reference.revision !== undefined)
        throw new DeliveryAuthorityError('invalid-basis')
      return this.planning.getEnvelope(reference.digest).envelope
    }
    if (reference.run === undefined || reference.revision === undefined)
      throw new DeliveryAuthorityError('invalid-basis')
    const receipt = this.planning.getPlan(reference.run, reference.revision)
    if (receipt.digest !== reference.digest) throw new DeliveryAuthorityError('basis-digest')
    if (deliveryPlanRoute(receipt.plan).next === 'blocked')
      throw new DeliveryAuthorityError('ineligible-plan')
    return receipt.plan
  }

  private check(request: AuthorizationRequest, basis: DeliveryBasis): void {
    const unique = (values: string[]) => new Set(values).size === values.length
    if (
      !unique(request.effects) ||
      !unique(request.decisions) ||
      !unique(request.repositories.map((scope) => scope.repository)) ||
      !unique(request.reads.map((rule) => `${rule.provider}:${rule.scope}`))
    )
      throw new DeliveryAuthorityError('duplicate-scope')
    const ceiling: Record<DeliveryBasis['policy']['endpoint'], readonly DeliveryEffect[]> = {
      'research-report': ['source.read', 'report.write'],
      'local-handoff': [
        'source.read',
        'report.write',
        'workspace.create',
        'code.write',
        'test.run',
        'git.commit',
      ],
      'to-pr': DELIVERY_EFFECTS.filter((effect) => effect !== 'pr.merge'),
      'to-merge': DELIVERY_EFFECTS,
    }
    if (request.effects.some((effect) => !ceiling[basis.policy.endpoint].includes(effect)))
      throw new DeliveryAuthorityError('endpoint-effect-ceiling')
    if (request.decisions.some((id) => !basis.policy.delegations.some((entry) => entry.id === id)))
      throw new DeliveryAuthorityError('undeclared-decision')
    for (const scope of request.repositories) {
      const repo = basis.repositories.find((entry) => entry.id === scope.repository)
      if (
        !repo ||
        !/^wl\/(?:[a-zA-Z0-9_-]+\/)*$/.test(scope.topicPrefix) ||
        (scope.remote !== undefined && scope.remote !== repo.remote?.name)
      )
        throw new DeliveryAuthorityError('repository-scope')
      if (
        request.effects.some((effect) =>
          ['git.push', 'pr.create', 'pr.update', 'pr.ready', 'pr.merge'].includes(effect),
        ) &&
        (!scope.remote || !repo.remote)
      )
        throw new DeliveryAuthorityError('missing-effect-remote')
    }
    if (
      basis.policy.endpoint !== 'research-report' &&
      basis.repositories.some(
        (repo) => !request.repositories.some((scope) => scope.repository === repo.id),
      )
    )
      throw new DeliveryAuthorityError('missing-repository-scope')
    if (request.effects.includes('git.push') && basis.budgets.ciPushes === 0)
      throw new DeliveryAuthorityError('zero-push-budget')
    for (const rule of request.reads)
      if (
        !unique(rule.operations) ||
        rule.operations.some((operation) => !deliveryReadOperation(operation))
      )
        throw new DeliveryAuthorityError('unsupported-read-operation')
    if (request.reads.length && !request.effects.includes('source.read'))
      throw new DeliveryAuthorityError('missing-read-authority')
  }

  private id(id: string): void {
    if (!/^authorization-[a-f0-9]{16}$/.test(id))
      throw new DeliveryAuthorityError('invalid-grant-id')
  }
  private path(id: string): string {
    return `delivery/authority/grants/${id}.json`
  }
  private write(path: string, value: unknown): void {
    this.planning.sources.files.atomic(
      path,
      `${JSON.stringify({ value, digest: contractDigest(value) })}\n`,
    )
  }
  private read(path: string): Record<string, unknown> {
    try {
      const record = JSON.parse(readSourceFile(this.planning.sources.files.root, path))
      if (
        Object.keys(record).length !== 2 ||
        typeof record.digest !== 'string' ||
        !record.value ||
        typeof record.value !== 'object' ||
        contractDigest(record.value) !== record.digest
      )
        throw new Error()
      return record.value as Record<string, unknown>
    } catch {
      throw new DeliveryAuthorityError('missing-or-damaged-authority')
    }
  }
}
