import { isAbsolute, resolve } from 'node:path'
import { type Schema, validate } from '../config/schema.js'
import { contractDigest } from '../contracts/compatibility.js'
import { type Criterion, lintCriteria } from '../definition/criteria.js'
import { knownSlot } from '../discovery/rules.js'
import { codehostRepository } from '../pull-requests/codehost.js'
import { checkDependencies } from '../slices/contract.js'
import { ITEM_ID } from '../state/events.js'
import { inside } from '../state/paths.js'
import { namedBase, repository } from '../worktrees/git.js'
import { SOURCE_LIMIT, safeSourceText } from './input.js'
import envelopeSchema from './schemas/envelope-v1.json' with { type: 'json' }
import planSchema from './schemas/plan-v1.json' with { type: 'json' }
import type { SourceSnapshot } from './source.js'

export const DELIVERY_PLAN_SCHEMA = planSchema
export const DELIVERY_ENVELOPE_SCHEMA = envelopeSchema
export const DELIVERY_DECISIONS = [
  'delivery-plan',
  'research-plan',
  'research-sources',
  'frame-outcome',
  'approve-spec',
  'approve-scopes',
  'approve-build-plan',
  'acceptance',
  'learning-outcome',
  'ramp-assessment',
] as const
export interface DeliveryPolicy {
  endpoint: 'research-report' | 'local-handoff' | 'to-pr' | 'to-merge'
  intervention: 'supervised' | 'on-exception' | 'none'
  uncertainty:
    | 'investigate'
    | 'explicit-default'
    | 'least-scope'
    | 'complete-with-unknowns'
    | 'on-hold'
    | 'blocked'
  delegations: {
    id: (typeof DELIVERY_DECISIONS)[number]
    rubric: { ref: string; sha256: string }
    evidence: string[]
    fallback: DeliveryPolicy['uncertainty']
  }[]
}
export const DEFAULT_DELIVERY_BUDGETS = {
  wallTimeMs: 4 * 60 * 60 * 1000,
  attemptMs: 30 * 60 * 1000,
  builders: 2,
  buildersPerRepository: 1,
  evaluators: 4,
  restarts: 2,
  ciPushes: 2,
  integrationRepairs: 3,
  noProgress: 3,
  artifactBytes: 200 * 1024 * 1024,
}
export interface DeliveryRepository {
  id: string
  root: string
  target: string
  base: string
  remote?: { name: string; url: string }
}
export interface DeliveryBasis {
  source: string
  owner: string
  scope: { outcomes: { id: string; text: string }[]; exclusions: string[] }
  repositories: DeliveryRepository[]
  guidance: { slot: string; ref: string; sha256: string; repository?: string }[]
  policy: DeliveryPolicy
  budgets: typeof DEFAULT_DELIVERY_BUDGETS
  capabilities: {
    id: string
    client: string
    version: string
    host: string
    status: 'observed' | 'unavailable' | 'unverified'
    evidence: string
  }[]
}
export interface DeliveryEnvelope extends DeliveryBasis {
  schema: 'wholeloop/delivery-envelope@1'
  limits: { work: number; criteria: number; revisions: number }
}
export interface DeliveryCriterion extends Criterion {
  outcomes: string[]
  acceptance: 'machine' | 'human'
}
export interface DeliveryWork {
  id: string
  repository?: string
  subject?: string
  role: 'contract' | 'implementation' | 'research'
  criteria: string[]
  after: string[]
  consumes: string[]
  produces: { id: string; revision: string; sha256: string; description: string }[]
}
export interface DeliveryPlan extends DeliveryBasis {
  schema: 'wholeloop/delivery-plan@1'
  run: string
  revision: number
  previous?: string
  envelope?: string
  definition: { ready: boolean; missing: string[] }
  criteria: DeliveryCriterion[]
  work: DeliveryWork[]
  milestones: {
    id: string
    work: string[]
    criteria: string[]
    after: string[]
    procedure: string
  }[]
  /** Cross-invocation corrections, oldest first; each names the retained failure it repairs. */
  corrections?: DeliveryCorrection[]
}
/** ADR-0197: the owning unit is named, never guessed from failure text. */
export interface DeliveryCorrection {
  unit: string
  origin: 'integration' | 'acceptance'
  request: string
  stage: string
  failure: string
}
export class DeliveryPlanError extends Error {
  constructor(readonly problem: string) {
    super(`Delivery plan refused: ${problem}; contents omitted`)
  }
}

function unique(values: string[], category: string): void {
  if (new Set(values).size !== values.length) throw new DeliveryPlanError(category)
}
function references(values: string[], known: string[], category: string): void {
  unique(values, category)
  if (values.some((id) => !known.includes(id))) throw new DeliveryPlanError(category)
}

/** Proposals bind evidence descriptors; they do not certify caller-supplied capabilities. */
export function validateDeliveryShape(value: unknown, schema: Schema): void {
  if (validate(value, schema).length) throw new DeliveryPlanError('invalid-shape')
  const bound = (value: unknown, rule: Schema & { maxLength?: number; maxItems?: number }) => {
    if (typeof value === 'string') {
      if (
        value.length > Number(rule.maxLength ?? 4096) ||
        !value.trim() ||
        Buffer.from(value).toString('utf8') !== value
      )
        throw new DeliveryPlanError('invalid-text')
      if ([...value].some((char) => char.charCodeAt(0) < 32 && !'\n\r\t'.includes(char)))
        throw new DeliveryPlanError('invalid-text')
    } else if (Array.isArray(value)) {
      if (value.length > Number(rule.maxItems ?? 1000))
        throw new DeliveryPlanError('limit-exceeded')
      for (const entry of value) if (rule.items) bound(entry, rule.items)
    } else if (value !== null && typeof value === 'object') {
      for (const [key, entry] of Object.entries(value)) {
        const property = rule.properties?.[key]
        if (property) bound(entry, property)
      }
    }
  }
  bound(value, schema)
  try {
    safeSourceText(JSON.stringify(value), 8 * SOURCE_LIMIT)
  } catch {
    throw new DeliveryPlanError('unsafe-or-oversized-content')
  }
}

function basis(value: DeliveryBasis, source: SourceSnapshot): void {
  if (value.source !== source.id) throw new DeliveryPlanError('source-mismatch')
  unique(
    value.scope.outcomes.map((entry) => entry.id),
    'duplicate-outcome',
  )
  unique(
    value.repositories.map((entry) => entry.id),
    'duplicate-repository',
  )
  unique(
    value.repositories.map((entry) => entry.root),
    'duplicate-repository',
  )
  unique(
    value.guidance.map((entry) => `${entry.repository ?? '*'}:${entry.slot}`),
    'duplicate-guidance',
  )
  unique(
    value.capabilities.map((entry) => entry.id),
    'duplicate-capability',
  )
  unique(
    value.policy.delegations.map((entry) => entry.id),
    'duplicate-delegation',
  )
  for (const delegation of value.policy.delegations)
    unique(delegation.evidence, 'duplicate-decision-evidence')
  for (const entry of value.guidance) {
    if (!knownSlot(entry.slot)) throw new DeliveryPlanError('unknown-guidance-slot')
    if (entry.repository !== undefined)
      references(
        [entry.repository],
        value.repositories.map((repo) => repo.id),
        'unknown-guidance-repository',
      )
  }
  if (
    value.budgets.buildersPerRepository > value.budgets.builders ||
    value.budgets.attemptMs > value.budgets.wallTimeMs
  )
    throw new DeliveryPlanError('inconsistent-budget')
  if (value.policy.endpoint !== 'research-report' && !value.repositories.length)
    throw new DeliveryPlanError('missing-repository')
  for (const repo of value.repositories) {
    if (!isAbsolute(repo.root) || /[\r\n\0]/.test(repo.root) || repo.root !== resolve(repo.root))
      throw new DeliveryPlanError('noncanonical-repository')
    if (!/^refs\/(heads|remotes)\/.+/.test(repo.target) || /[\r\n\0]/.test(repo.target))
      throw new DeliveryPlanError('invalid-target')
    for (const other of value.repositories)
      if (repo !== other && inside(repo.root, other.root))
        throw new DeliveryPlanError('overlapping-repository')
    if (['to-pr', 'to-merge'].includes(value.policy.endpoint) && !repo.remote)
      throw new DeliveryPlanError('missing-publication-remote')
    if (repo.remote) {
      let url: URL
      try {
        url = new URL(repo.remote.url)
      } catch {
        throw new DeliveryPlanError('invalid-remote')
      }
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.port ||
        url.href !== repo.remote.url
      )
        throw new DeliveryPlanError('invalid-remote')
    }
  }
}

/** Only preparation checks the current base; historic plans remain readable after it advances. */
export function observePlanBases(repositories: DeliveryRepository[]): void {
  const common = new Set<string>()
  for (const repo of repositories) {
    try {
      const observed = repository(repo.root)
      if (observed.path !== repo.root || common.has(observed.commonDir)) throw new Error()
      common.add(observed.commonDir)
      if (repo.remote && codehostRepository(repo.root, repo.remote.name).url !== repo.remote.url)
        throw new Error()
      const base = namedBase(repo.root, repo.target)
      if (base.ref !== repo.target || base.sha !== repo.base) throw new Error()
    } catch {
      throw new DeliveryPlanError('stale-or-missing-base')
    }
  }
}

export function validateDeliveryEnvelope(value: unknown, source: SourceSnapshot): DeliveryEnvelope {
  validateDeliveryShape(value, envelopeSchema)
  const envelope = structuredClone(value) as DeliveryEnvelope
  basis(envelope, source)
  return envelope
}

export function validateDeliveryPlan(value: unknown, source: SourceSnapshot): DeliveryPlan {
  validateDeliveryShape(value, planSchema)
  const plan = structuredClone(value) as DeliveryPlan
  basis(plan, source)
  if ((plan.revision === 1) !== (plan.previous === undefined))
    throw new DeliveryPlanError('invalid-predecessor')
  if (plan.definition.ready === !!plan.definition.missing.length)
    throw new DeliveryPlanError('inconsistent-definition')
  if (lintCriteria(plan.criteria).length) throw new DeliveryPlanError('invalid-criteria')
  const criteria = plan.criteria.map((entry) => entry.id),
    outcomes = plan.scope.outcomes.map((entry) => entry.id)
  unique(criteria, 'duplicate-criterion')
  for (const criterion of plan.criteria) references(criterion.outcomes, outcomes, 'unknown-outcome')
  if (outcomes.some((id) => !plan.criteria.some((criterion) => criterion.outcomes.includes(id))))
    throw new DeliveryPlanError('uncovered-outcome')
  for (const mapped of source.mapping.filter((entry) => entry.role === 'criterion')) {
    const selected = source.body
      .split('\n')
      .slice(mapped.startLine - 1, mapped.endLine)
      .join('\n')
    if (
      !plan.criteria.some((criterion) => criterion.id === mapped.id && criterion.text === selected)
    )
      throw new DeliveryPlanError('changed-source-criterion')
  }
  const work = plan.work.map((entry) => entry.id),
    repos = plan.repositories.map((entry) => entry.id)
  unique(work, 'duplicate-work')
  unique(
    plan.work.flatMap((entry) => (entry.subject ? [entry.subject] : [])),
    'duplicate-subject',
  )
  const contracts = plan.work.flatMap((entry) => entry.produces.map((contract) => contract.id))
  unique(contracts, 'duplicate-contract')
  for (const unit of plan.work) {
    if (unit.subject !== undefined && !ITEM_ID.test(unit.subject))
      throw new DeliveryPlanError('invalid-subject')
    if (unit.repository !== undefined) references([unit.repository], repos, 'unknown-repository')
    else if (unit.role !== 'research') throw new DeliveryPlanError('missing-work-repository')
    references(unit.criteria, criteria, 'unknown-criterion')
    references(unit.after, work, 'unknown-dependency')
    references(unit.consumes, contracts, 'unknown-contract')
    if (
      plan.policy.endpoint === 'research-report' &&
      (unit.role !== 'research' || unit.produces.length)
    )
      throw new DeliveryPlanError('research-code-work')
    if (unit.produces.length && unit.role !== 'contract')
      throw new DeliveryPlanError('contract-owner-role')
    if (!unit.criteria.length && !unit.produces.length) throw new DeliveryPlanError('empty-work')
  }
  if (criteria.some((id) => plan.work.filter((unit) => unit.criteria.includes(id)).length !== 1))
    throw new DeliveryPlanError('criterion-ownership')
  const graph = new Map(plan.work.map((unit) => [unit.id, unit.after]))
  try {
    checkDependencies(graph)
  } catch {
    throw new DeliveryPlanError('dependency-cycle')
  }
  const closures = new Map<string, Set<string>>()
  const ancestors = (id: string): Set<string> => {
    const cached = closures.get(id)
    if (cached) return cached
    const result = new Set((graph.get(id) ?? []).flatMap((dep) => [dep, ...ancestors(dep)]))
    closures.set(id, result)
    return result
  }
  for (const unit of plan.work)
    for (const id of unit.consumes) {
      const producer = plan.work.find((entry) =>
        entry.produces.some((contract) => contract.id === id),
      )
      if (!producer || !ancestors(unit.id).has(producer.id))
        throw new DeliveryPlanError('contract-order')
    }
  unique(
    plan.milestones.map((entry) => entry.id),
    'duplicate-milestone',
  )
  const milestones = plan.milestones.map((entry) => entry.id)
  for (const milestone of plan.milestones) {
    references(milestone.work, work, 'unknown-milestone-work')
    references(milestone.criteria, criteria, 'unknown-milestone-criterion')
    references(milestone.after, milestones, 'unknown-milestone-dependency')
    if (
      milestone.criteria.some(
        (id) =>
          !plan.work.some((unit) => unit.criteria.includes(id) && milestone.work.includes(unit.id)),
      )
    )
      throw new DeliveryPlanError('milestone-ownership')
  }
  if (
    work.some((id) => !plan.milestones.some((entry) => entry.work.includes(id))) ||
    criteria.some((id) => !plan.milestones.some((entry) => entry.criteria.includes(id)))
  )
    throw new DeliveryPlanError('uncovered-milestone')
  try {
    checkDependencies(new Map(plan.milestones.map((entry) => [entry.id, entry.after])))
  } catch {
    throw new DeliveryPlanError('milestone-cycle')
  }
  const milestoneAncestors = (id: string): Set<string> => {
    const seen = new Set<string>(),
      pending = [...(plan.milestones.find((entry) => entry.id === id)?.after ?? [])]
    while (pending.length) {
      const next = pending.pop() ?? ''
      if (seen.has(next)) continue
      seen.add(next)
      pending.push(...(plan.milestones.find((entry) => entry.id === next)?.after ?? []))
    }
    return seen
  }
  for (const milestone of plan.milestones) {
    const earlier = milestoneAncestors(milestone.id)
    const available = new Set([
      ...milestone.work,
      ...plan.milestones.filter((entry) => earlier.has(entry.id)).flatMap((entry) => entry.work),
    ])
    if (
      milestone.work.some((id) =>
        [...ancestors(id)].some((dependency) => !available.has(dependency)),
      )
    )
      throw new DeliveryPlanError('milestone-order')
  }
  if (plan.corrections) {
    // A correction is always a revision of an executed plan and stays inside the
    // finite repair budget; its stage must be one this plan's route actually has.
    if (plan.revision === 1 || plan.policy.endpoint === 'research-report')
      throw new DeliveryPlanError('correction-basis')
    if (plan.corrections.length > plan.budgets.integrationRepairs)
      throw new DeliveryPlanError('correction-budget')
    unique(
      plan.corrections.map((entry) => entry.failure),
      'duplicate-correction',
    )
    for (const correction of plan.corrections) {
      const unit = plan.work.find((entry) => entry.id === correction.unit)
      if (!unit || unit.role === 'research') throw new DeliveryPlanError('correction-unit')
      if (
        correction.origin === 'acceptance'
          ? correction.stage !== 'acceptance'
          : !plan.milestones.some(
              (milestone) =>
                correction.stage === `integration:${milestone.id}` &&
                milestone.work.includes(correction.unit),
            )
      )
        throw new DeliveryPlanError('correction-stage')
    }
  }
  return plan
}

export function planWaves(plan: DeliveryPlan): string[][] {
  const done = new Set<string>(),
    waves: string[][] = []
  while (done.size < plan.work.length) {
    const wave = plan.work
      .filter((unit) => !done.has(unit.id) && unit.after.every((id) => done.has(id)))
      .map((unit) => unit.id)
      .sort()
    if (!wave.length) throw new DeliveryPlanError('dependency-cycle')
    waves.push(wave)
    for (const id of wave) done.add(id)
  }
  return waves
}

export function deliveryPlanRoute(plan: DeliveryPlan) {
  if (
    plan.policy.intervention === 'none' &&
    plan.criteria.some((entry) => entry.acceptance === 'human')
  )
    return { next: 'blocked', reason: 'human-only-acceptance' }
  if (!plan.definition.ready) {
    const required =
      plan.policy.endpoint === 'research-report'
        ? ['research-plan', 'research-sources']
        : ['frame-outcome', 'approve-spec', 'approve-scopes']
    const delegated = required.every((id) =>
      plan.policy.delegations.some((entry) => entry.id === id),
    )
    if (plan.policy.intervention === 'none' && !delegated)
      return { next: 'blocked', reason: 'undelegated-definition' }
    return {
      next: delegated
        ? plan.policy.endpoint === 'research-report'
          ? 'research'
          : 'define'
        : 'needs-input',
      reason: 'missing-definition',
    }
  }
  return {
    next: plan.policy.endpoint === 'research-report' ? 'research' : 'build',
    reason: 'explicit-criteria',
  }
}

/** Structural fit is necessary, never a substitute for independent semantic review/grant. */
export function checkPlanEnvelope(plan: DeliveryPlan, envelope: DeliveryEnvelope): void {
  if (
    plan.source !== envelope.source ||
    plan.owner !== envelope.owner ||
    contractDigest(plan.scope) !== contractDigest(envelope.scope) ||
    contractDigest(plan.repositories) !== contractDigest(envelope.repositories) ||
    contractDigest(plan.policy) !== contractDigest(envelope.policy) ||
    contractDigest(plan.guidance) !== contractDigest(envelope.guidance) ||
    contractDigest(plan.capabilities) !== contractDigest(envelope.capabilities) ||
    Object.entries(plan.budgets).some(
      ([key, value]) => value > envelope.budgets[key as keyof typeof envelope.budgets],
    ) ||
    plan.work.length > envelope.limits.work ||
    plan.criteria.length > envelope.limits.criteria ||
    plan.revision > envelope.limits.revisions
  )
    throw new DeliveryPlanError('outside-envelope')
}
