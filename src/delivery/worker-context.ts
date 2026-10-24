import { contractDigest } from '../contracts/compatibility.js'
import { workspaceSnapshot } from '../gates/snapshot.js'
import { canonicalPath } from '../state/paths.js'
import { repository } from '../worktrees/git.js'
import { findBudget } from './budget-events.js'
import { currentBudgetReservation } from './budget-policy.js'
import { readSourceBytes } from './input.js'
import { checkPlanEnvelope } from './plan.js'
import type { DeliveryQueue, QueueAssignment } from './queue.js'
import { deliveryQueue } from './queue-events.js'
import { deliveryAttempts } from './reducer.js'
import {
  createWorkerAssignment,
  validateWorkerAssignment,
  type WorkerAssignment,
  type WorkerContext,
  WorkerProtocolError,
  workerResumePack,
} from './worker-protocol.js'

/** Journal replay alone cannot establish a live private grant or the exact started backend worker. */
export function currentWorkerAssignment(
  queue: DeliveryQueue,
  assignment: WorkerAssignment,
  runtime: { backend: string; instance: string; worker: string },
): boolean {
  try {
    validateWorkerAssignment(assignment)
    const identity = assignment.identity
    if (!identity.unit || ['planner', 'challenger'].includes(identity.role)) return false
    const state = queue.lifecycle.journal.get(identity.run)
    const authority = state.grant ? queue.lifecycle.authority.inspect(state.grant.id) : undefined
    const attempt = deliveryAttempts(state).records.find((item) => item.id === identity.attempt)
    if (
      authority?.status !== 'active' ||
      authority.digest !== assignment.grantDigest ||
      state.grant?.digest !== authority.digest ||
      attempt?.cell !== identity.cell ||
      contractDigest(attempt?.runtime ?? null) !== contractDigest(runtime)
    )
      return false
    return queue.current({
      grant: authority.grant.id,
      run: identity.run,
      revision: identity.revision,
      plan: identity.plan,
      unit: identity.unit,
      attempt: identity.attempt,
      generation: identity.generation,
      role: identity.role as QueueAssignment['role'],
      runtime: runtime.instance,
      criteria: assignment.criteria,
      findings: assignment.findings,
      contracts: assignment.contracts,
    })
  } catch {
    return false
  }
}

/** The host supplies observations and selected files; worker JSON cannot select its own context. */
export function workerContextForClaim(
  queue: DeliveryQueue,
  lease: QueueAssignment,
  input: {
    environment: WorkerAssignment['environment']
    workspace?: string
    contextRoot: string
    context: WorkerContext[]
    criteria?: string[]
    findings?: string[]
    planAccepted?: (grant: string, plan: string) => boolean
  },
) {
  return queue.lifecycle.journal.files.locked(() => {
    const state = queue.lifecycle.journal.get(lease.run)
    if (contractDigest(queue.assigned(lease.run, lease.attempt)) !== contractDigest(lease))
      throw new WorkerProtocolError('stale-lease')
    const attempt = deliveryAttempts(state).records.find((item) => item.id === lease.attempt)
    const record = deliveryQueue(state).records.find((item) => item.attempt === lease.attempt)
    if (
      attempt?.state !== 'claimed' ||
      record?.status !== 'claimed' ||
      !['queued', 'running'].includes(state.state)
    )
      throw new WorkerProtocolError('attempt-not-ready')
    const authority = queue.lifecycle.authority.inspect(lease.grant)
    const prepared = queue.lifecycle.authority.planning.getPlan(lease.run, lease.revision)
    if (
      authority.status !== 'active' ||
      authority.digest !== state.grant?.digest ||
      prepared.digest !== lease.plan
    )
      throw new WorkerProtocolError('inactive-basis')
    if (authority.grant.basis.kind === 'envelope') {
      if (
        prepared.plan.envelope !== authority.grant.basis.digest ||
        !authority.grant.decisions.includes('delivery-plan') ||
        !input.planAccepted?.(authority.digest, prepared.digest)
      )
        throw new WorkerProtocolError('unaccepted-plan')
      checkPlanEnvelope(
        prepared.plan,
        queue.lifecycle.authority.planning.getEnvelope(authority.grant.basis.digest).envelope,
      )
    } else if (authority.grant.basis.digest !== prepared.digest)
      throw new WorkerProtocolError('grant-plan')
    const unit = prepared.plan.work.find((item) => item.id === lease.unit)
    if (!unit) throw new WorkerProtocolError('unit')
    const criteria = input.criteria ?? unit.criteria
    if (criteria.some((id) => !unit.criteria.includes(id)))
      throw new WorkerProtocolError('criteria-scope')
    const context = structuredClone(input.context)
    if (
      prepared.plan.guidance.some(
        (item) =>
          !context.some(
            (entry) => entry.kind === 'guidance' && entry.artifact.sha256 === item.sha256,
          ),
      )
    )
      throw new WorkerProtocolError('missing-guidance')
    const consumed = prepared.plan.work
      .flatMap((item) => item.produces)
      .filter((item) => unit.consumes.includes(item.id))
    if (
      consumed.some(
        (item) =>
          !context.some(
            (entry) => entry.kind === 'contract' && entry.artifact.sha256 === item.sha256,
          ),
      )
    )
      throw new WorkerProtocolError('missing-contract')
    const budget = findBudget(state)
    const reservation = budget?.reservations.find((item) => item.id === lease.attempt)
    if (
      !budget?.limits ||
      !reservation ||
      !currentBudgetReservation(state, lease.attempt, queue.budgetClock())
    )
      throw new WorkerProtocolError('expired-attempt')
    const candidates: WorkerAssignment['candidates'] = []
    if (unit.repository) {
      const repo = prepared.plan.repositories.find((item) => item.id === unit.repository)
      if (
        !repo ||
        !input.workspace ||
        repository(input.workspace).commonDir !== repository(repo.root).commonDir
      )
        throw new WorkerProtocolError('workspace-repository')
      const snapshot = workspaceSnapshot(input.workspace)
      if (lease.role === 'builder') {
        const scope = authority.grant.repositories.find((item) => item.repository === repo.id)
        if (
          canonicalPath(input.workspace) === canonicalPath(repo.root) ||
          !scope ||
          !snapshot.branch.startsWith(scope.topicPrefix)
        )
          throw new WorkerProtocolError('unallocated-builder-workspace')
      }
      candidates.push({ repository: repo.id, head: snapshot.head, snapshot: snapshot.digest })
    } else if (input.workspace) throw new WorkerProtocolError('unexpected-workspace')
    const source = queue.lifecycle.authority.planning.sources.get(state.source)
    const assignment = createWorkerAssignment({
      identity: {
        run: lease.run,
        plan: lease.plan,
        revision: lease.revision,
        unit: lease.unit,
        role: lease.role,
        attempt: lease.attempt,
        generation: lease.generation,
        ...(lease.cell !== undefined ? { cell: lease.cell } : {}),
      },
      grantDigest: authority.digest,
      source: state.source,
      brief: JSON.stringify({
        source: source.body,
        unit,
        criteria: prepared.plan.criteria.filter((item) => criteria.includes(item.id)),
        guidance: prepared.plan.guidance,
      }),
      endpoint: prepared.plan.policy.endpoint,
      intervention: prepared.plan.policy.intervention,
      environment: input.environment,
      candidates,
      criteria,
      findings: input.findings ?? [],
      contracts: [...unit.consumes, ...unit.produces.map((item) => item.id)],
      context,
      deadline: reservation.deadline,
      limits: budget.limits,
    })
    const resume = workerResumePack(assignment, (artifact) =>
      readSourceBytes(input.contextRoot, artifact.ref, 1024 * 1024),
    )
    // Reads can consume the remaining allowance; do not return an executable context after it expires.
    if (!currentBudgetReservation(state, lease.attempt, queue.budgetClock()))
      throw new WorkerProtocolError('expired-attempt')
    return {
      assignment,
      resume,
      execution: 'not-started' as const,
      authority: 'not-granted' as const,
    }
  })
}
