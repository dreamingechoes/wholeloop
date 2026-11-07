import { isAbsolute, resolve } from 'node:path'
import { isObject, type Schema, validate } from '../config/schema.js'
import { contractDigest } from '../contracts/compatibility.js'
import { type Criterion, lintCriteria } from '../definition/criteria.js'
import { knownSlot } from '../discovery/rules.js'
import { codehostRepository } from '../pull-requests/codehost.js'
import { checkDependencies } from '../slices/contract.js'
import { ITEM_ID } from '../state/events.js'
import { inside } from '../state/paths.js'
import { DecisionMemo, inReadObservation } from '../state/read-observation.js'
import { repositoryBase } from '../worktrees/git.js'
import { SOURCE_LIMIT, safeSourceText } from './input.js'
import envelopeSchema from './schemas/envelope-v1.json' with { type: 'json' }
import planSchema from './schemas/plan-v1.json' with { type: 'json' }
import planV2Schema from './schemas/plan-v2.json' with { type: 'json' }
import type { SourceSnapshot } from './source.js'

// Preserve multiline C0 exceptions without allocating one entry per code point.
// biome-ignore lint/suspicious/noControlCharactersInRegex: This refusal deliberately matches forbidden C0 controls.
const FORBIDDEN_TEXT_CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f]/

export const DELIVERY_PLAN_SCHEMA = planSchema
export const DELIVERY_PLAN_V2_SCHEMA = planV2Schema
/** Explicit new identity; the frozen version-one declaration is never widened. */
export function deliveryPlanSchema(value: unknown) {
  return isObject(value) && value.schema === 'wholeloop/delivery-plan@2' ? planV2Schema : planSchema
}
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
  endpoint: 'research-report' | 'learning-observation' | 'local-handoff' | 'to-pr' | 'to-merge'
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
  /**
   * ADR-0199: the operator's merge policy, required for `to-merge` and refused
   * elsewhere. It is part of the policy every grant binds, so no worker can edit
   * the method, required checks, denylist or exceptions.
   */
  merge?: {
    method: 'merge' | 'squash' | 'rebase'
    checks: { required: { name: string; issuer: string }[] }
    denylist: string[]
    exceptions: string[]
  }
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
  schema: 'wholeloop/delivery-plan@1' | 'wholeloop/delivery-plan@2'
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
  /** ADR-0200: the one scheduled observation a `learning-observation` plan executes. */
  observation?: { key: string; subject: string; checkpoint: string }
  /** Cross-invocation corrections, oldest first; each names the retained failure it repairs. */
  corrections?: DeliveryCorrection[]
}
/** ADR-0197: the owning unit is named, never guessed from failure text. */
export interface DeliveryCorrection {
  unit: string
  origin: 'integration' | 'acceptance' | 'ci'
  /** Version two binds production to one revision; older entries stay historical. */
  revision?: number
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
function referenceIndex(values: string[]): string[] | ReadonlySet<string> {
  return values.length > 1 ? new Set(values) : values
}
function references(
  values: string[],
  known: string[] | ReadonlySet<string>,
  category: string,
): void {
  unique(values, category)
  if (values.some((id) => !(Array.isArray(known) ? known.includes(id) : known.has(id))))
    throw new DeliveryPlanError(category)
}

/** Proposals bind evidence descriptors; they do not certify caller-supplied capabilities. */
export function validateDeliveryShape(value: unknown, schema: Schema): void {
  if (validate(value, schema).length) throw new DeliveryPlanError('invalid-shape')
  const bound = (value: unknown, rule: Schema & { maxLength?: number; maxItems?: number }) => {
    if (typeof value === 'string') {
      if (value.length > Number(rule.maxLength ?? 4096) || !value.trim() || !value.isWellFormed())
        throw new DeliveryPlanError('invalid-text')
      if (FORBIDDEN_TEXT_CONTROL.test(value)) throw new DeliveryPlanError('invalid-text')
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
  if ((value.policy.endpoint === 'to-merge') !== (value.policy.merge !== undefined))
    throw new DeliveryPlanError('merge-policy')
  if (value.policy.merge) {
    unique(
      value.policy.merge.checks.required.map((entry) => entry.name),
      'duplicate-merge-check',
    )
    // An exception is only meaningful for a path the denylist would refuse.
    unique(value.policy.merge.exceptions, 'duplicate-merge-exception')
  }
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
  if (
    !['research-report', 'learning-observation'].includes(value.policy.endpoint) &&
    !value.repositories.length
  )
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
// One successful base observation per synchronous decision (ADR-0243); sealed
// read observations keep their own revalidated reads.
const observedBases = new DecisionMemo<true>(8)

export function observePlanBases(repositories: DeliveryRepository[]): void {
  if (inReadObservation()) {
    observeBases(repositories)
    return
  }
  const key = JSON.stringify(
    repositories.map((repo) => [repo.root, repo.target, repo.base, repo.remote ?? null]),
  )
  observedBases.get(key, () => {
    observeBases(repositories)
    return true
  })
}
function observeBases(repositories: DeliveryRepository[]): void {
  const common = new Set<string>()
  for (const repo of repositories) {
    try {
      // Every failure below is the same refusal, so one joined identity/commit
      // query preserves exactly the accepted set of the former five queries.
      const observed = repositoryBase(repo.root, repo.target)
      if (observed.path !== repo.root || common.has(observed.commonDir)) throw new Error()
      common.add(observed.commonDir)
      if (repo.remote && codehostRepository(repo.root, repo.remote.name).url !== repo.remote.url)
        throw new Error()
      if (observed.ref !== repo.target || observed.sha !== repo.base) throw new Error()
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
  validateDeliveryShape(value, deliveryPlanSchema(value))
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
  const outcomeIds = referenceIndex(outcomes),
    coveredOutcomes = new Set<string>()
  for (const criterion of plan.criteria) {
    references(criterion.outcomes, outcomeIds, 'unknown-outcome')
    for (const id of criterion.outcomes) coveredOutcomes.add(id)
  }
  if (outcomes.some((id) => !coveredOutcomes.has(id)))
    throw new DeliveryPlanError('uncovered-outcome')
  const mappedCriteria = source.mapping.filter((entry) => entry.role === 'criterion')
  if (mappedCriteria.length) {
    const lines = source.body.split('\n'),
      index =
        mappedCriteria.length > 1 ? new Map<string, DeliveryPlan['criteria'][number]>() : undefined
    let scanned = 0
    for (const mapped of mappedCriteria) {
      const selected = lines.slice(mapped.startLine - 1, mapped.endLine).join('\n')
      if (index) {
        let criterion = index.get(mapped.id)
        // Index only the declaration prefix needed so far, using the ids already
        // validated above. A few mapped ids must not force a scan of an unrelated tail.
        while (!criterion && scanned < criteria.length) {
          const id = criteria[scanned],
            entry = plan.criteria[scanned]
          scanned++
          if (id !== undefined && entry) {
            index.set(id, entry)
            if (id === mapped.id) criterion = entry
          }
        }
        if (criterion?.text !== selected) throw new DeliveryPlanError('changed-source-criterion')
      } else if (
        !plan.criteria.some(
          (criterion) => criterion.id === mapped.id && criterion.text === selected,
        )
      )
        throw new DeliveryPlanError('changed-source-criterion')
    }
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
  const workIds = referenceIndex(work),
    criterionIds = referenceIndex(criteria),
    repositoryIds = referenceIndex(repos),
    contractIds = referenceIndex(contracts),
    criterionOwners = new Map<string, string>()
  let duplicateOwner = false,
    consumptions = 0
  for (const unit of plan.work) {
    if (unit.subject !== undefined && !ITEM_ID.test(unit.subject))
      throw new DeliveryPlanError('invalid-subject')
    if (unit.repository !== undefined)
      references([unit.repository], repositoryIds, 'unknown-repository')
    else if (unit.role !== 'research') throw new DeliveryPlanError('missing-work-repository')
    references(unit.criteria, criterionIds, 'unknown-criterion')
    references(unit.after, workIds, 'unknown-dependency')
    references(unit.consumes, contractIds, 'unknown-contract')
    if (
      ['research-report', 'learning-observation'].includes(plan.policy.endpoint) &&
      (unit.role !== 'research' || unit.produces.length)
    )
      throw new DeliveryPlanError('research-code-work')
    if (unit.produces.length && unit.role !== 'contract')
      throw new DeliveryPlanError('contract-owner-role')
    if (!unit.criteria.length && !unit.produces.length) throw new DeliveryPlanError('empty-work')
    consumptions += unit.consumes.length
    for (const id of unit.criteria) {
      if (criterionOwners.has(id)) duplicateOwner = true
      else criterionOwners.set(id, unit.id)
    }
  }
  // References and per-unit uniqueness are already checked. Delay cross-unit
  // ownership refusal until all work checks finish, preserving error precedence.
  if (duplicateOwner || criterionOwners.size !== criteria.length)
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
  const producerIndex = consumptions > 1 ? new Map<string, string>() : undefined
  let producerUnit = 0,
    producerContract = 0
  for (const unit of plan.work)
    for (const id of unit.consumes) {
      let producer: string | undefined
      if (producerIndex) {
        producer = producerIndex.get(id)
        // Advance only as far as requested. One early consumer must not index
        // the unused tail, including other contracts from the same producer.
        while (producer === undefined && producerUnit < plan.work.length) {
          const entry = plan.work[producerUnit]
          if (!entry) break
          const contract = entry.produces[producerContract++]
          if (!contract) {
            producerUnit++
            producerContract = 0
            continue
          }
          producerIndex.set(contract.id, entry.id)
          if (contract.id === id) producer = entry.id
        }
      } else
        producer = plan.work.find((entry) =>
          entry.produces.some((contract) => contract.id === id),
        )?.id
      if (producer === undefined || !ancestors(unit.id).has(producer))
        throw new DeliveryPlanError('contract-order')
    }
  unique(
    plan.milestones.map((entry) => entry.id),
    'duplicate-milestone',
  )
  const milestones = plan.milestones.map((entry) => entry.id),
    milestoneIds = referenceIndex(milestones),
    milestoneWork = new Set<string>(),
    milestoneCriteria = new Set<string>()
  for (const milestone of plan.milestones) {
    references(milestone.work, workIds, 'unknown-milestone-work')
    references(milestone.criteria, criterionIds, 'unknown-milestone-criterion')
    references(milestone.after, milestoneIds, 'unknown-milestone-dependency')
    const owned = new Set(milestone.work)
    if (
      milestone.criteria.some((id) => {
        const owner = criterionOwners.get(id)
        return owner === undefined || !owned.has(owner)
      })
    )
      throw new DeliveryPlanError('milestone-ownership')
    for (const id of owned) milestoneWork.add(id)
    for (const id of milestone.criteria) milestoneCriteria.add(id)
  }
  if (milestoneWork.size !== work.length || milestoneCriteria.size !== criteria.length)
    throw new DeliveryPlanError('uncovered-milestone')
  const milestoneGraph = new Map(plan.milestones.map((entry) => [entry.id, entry.after]))
  try {
    checkDependencies(milestoneGraph)
  } catch {
    throw new DeliveryPlanError('milestone-cycle')
  }
  const milestoneAncestors = (id: string): Set<string> => {
    const seen = new Set<string>(),
      pending = [...(milestoneGraph.get(id) ?? [])]
    while (pending.length) {
      const next = pending.pop() ?? ''
      if (seen.has(next)) continue
      seen.add(next)
      pending.push(...(milestoneGraph.get(next) ?? []))
    }
    return seen
  }
  for (const milestone of plan.milestones) {
    // Unique known work references and both cycle checks are already proven.
    // Complete coverage cannot omit an ancestor, so no closure is needed.
    if (milestone.work.length === work.length) continue
    const earlier = milestoneAncestors(milestone.id)
    const available = new Set([
      ...milestone.work,
      ...plan.milestones.filter((entry) => earlier.has(entry.id)).flatMap((entry) => entry.work),
    ])
    if (available.size === work.length) continue
    if (
      milestone.work.some((id) =>
        [...ancestors(id)].some((dependency) => !available.has(dependency)),
      )
    )
      throw new DeliveryPlanError('milestone-order')
  }
  // ADR-0200: an observation plan executes exactly one scheduled observation and is
  // defined up front; nothing else may carry the link.
  if ((plan.policy.endpoint === 'learning-observation') !== (plan.observation !== undefined))
    throw new DeliveryPlanError('observation-link')
  if (plan.observation && !plan.definition.ready)
    throw new DeliveryPlanError('observation-definition')
  if (
    plan.schema === 'wholeloop/delivery-plan@2' &&
    !plan.corrections?.some((entry) => entry.origin === 'ci')
  )
    throw new DeliveryPlanError('ci-version-requires-original-correction')
  if (plan.corrections) {
    if (plan.schema === 'wholeloop/delivery-plan@2') {
      let last = 1,
        versioned = false
      for (const entry of plan.corrections) {
        if (entry.revision === undefined) {
          if (entry.origin === 'ci' || versioned)
            throw new DeliveryPlanError('correction-producer-revision')
        } else {
          if (entry.revision <= last || entry.revision > plan.revision)
            throw new DeliveryPlanError('correction-producer-revision')
          last = entry.revision
          versioned = true
        }
      }
    }
    // A correction is always a revision of an executed plan and stays inside the
    // finite repair budget; its stage must be one this plan's route actually has.
    if (
      plan.revision === 1 ||
      ['research-report', 'learning-observation'].includes(plan.policy.endpoint)
    )
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
        correction.origin === 'ci'
          ? plan.schema !== 'wholeloop/delivery-plan@2' ||
            plan.policy.endpoint !== 'to-merge' ||
            correction.stage !== 'ci' ||
            // A CI continuation rebuilds every code unit from the product root;
            // refusing only the selected owner would admit an unsupported seed later.
            plan.work.some((work) => work.role !== 'research' && work.after.length > 0)
          : correction.origin === 'acceptance'
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
    next: ['research-report', 'learning-observation'].includes(plan.policy.endpoint)
      ? 'research'
      : 'build',
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
