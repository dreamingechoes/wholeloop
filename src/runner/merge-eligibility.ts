import { contractDigest } from '../contracts/compatibility.js'
import { type CiObservation, type CiPolicy, ciVerdict } from './ci-observations.js'

/** Maximum observation age before a merge request; any relevant change also invalidates. */
export const MERGE_OBSERVATION_MAX_AGE_MS = 60000
export type MergeMethod = 'merge' | 'squash' | 'rebase'
/** Operator-owned policy; a worker can neither edit the denylist nor approve an exception. */
export interface MergePolicy {
  method: MergeMethod
  checks: CiPolicy
  denylist: string[]
  exceptions: string[]
}
export interface MergeEligibilityInput {
  now: string
  policy: MergePolicy
  grant: {
    active: boolean
    endpoint: string
    effects: string[]
    repository: string
    target: string
    methods: MergeMethod[]
    expiresAt: string
  }
  /** A separate runtime policy must allow this exact effect too. */
  runtime: { allowsMerge: boolean }
  candidate: { repository: string; head: string; target: string }
  evidence: {
    acceptance: 'current' | 'stale' | 'missing'
    verify: 'passed' | 'failed' | 'missing'
    review: 'passed' | 'failed' | 'missing'
    refutation: 'passed' | 'failed' | 'missing'
    integration: 'passed' | 'failed' | 'missing'
    humanObservations: 'satisfied' | 'unsatisfied' | 'not-required'
  }
  pr: {
    codeHost: string
    url: string
    state: 'open' | 'closed' | 'merged'
    draft: boolean
    head: string
    base: string
    mergeable: boolean | 'unknown'
    files: string[] | 'unknown'
    unresolvedDiscussions: number | 'unknown'
    allowedMethods: MergeMethod[] | 'unknown'
  }
  ci: CiObservation
  base: { observedAt: string; current: boolean | 'unknown' }
  dependencies: { repository: string; delivered: boolean | 'unknown' }[]
  /** Requests a caller must never make: they make the candidate ineligible outright. */
  requested: { adminBypass: boolean; force: boolean; protectionChange: boolean; autoMerge: boolean }
}
export interface MergeEligibility {
  schema: 'wholeloop/merge-eligibility@1'
  status: 'eligible' | 'ineligible' | 'unknown'
  reasons: string[]
  evidence: string
  expiresAt: string
}

const SEGMENT = /^[A-Za-z0-9._@+-]*$/
/** `**` spans directories, `*` stays within one segment; nothing else is special. */
export function pathMatches(pattern: string, path: string): boolean {
  const parts = pattern.split('/'),
    segments = path.split('/')
  const match = (p: number, s: number): boolean => {
    if (p === parts.length) return s === segments.length
    const part = parts[p] ?? ''
    if (part === '**') {
      for (let next = s; next <= segments.length; next++) if (match(p + 1, next)) return true
      return false
    }
    if (s === segments.length) return false
    const pieces = part.split('*')
    if (!pieces.every((piece) => SEGMENT.test(piece))) return false
    const expression = new RegExp(
      `^${pieces.map((piece) => piece.replace(/[.+@]/g, (c) => `\\${c}`)).join('[^/]*')}$`,
    )
    return expression.test(segments[s] ?? '') && match(p + 1, s + 1)
  }
  return match(0, 0)
}

/**
 * Pure. Eligible only when every required proof is current and observed; any
 * refusal is ineligible and any gap is unknown. Green tests, unattended policy or
 * an autopilot setting never stand in for merge authority.
 */
export function mergeEligibility(input: Readonly<MergeEligibilityInput>): MergeEligibility {
  const ineligible: string[] = [],
    unknown: string[] = [],
    now = Date.parse(input.now),
    fail = (condition: boolean, reason: string) => {
      if (condition) ineligible.push(reason)
    },
    gap = (condition: boolean, reason: string) => {
      if (condition) unknown.push(reason)
    }
  // 1. Exact current authority and a separate runtime allowance.
  fail(!input.grant.active, 'inactive-grant')
  fail(input.grant.endpoint !== 'to-merge', 'endpoint-not-to-merge')
  fail(!input.grant.effects.includes('pr.merge'), 'merge-not-granted')
  fail(!input.grant.effects.includes('pr.ready'), 'ready-not-granted')
  fail(!(Date.parse(input.grant.expiresAt) > now), 'grant-expired')
  fail(input.grant.repository !== input.candidate.repository, 'grant-repository')
  fail(input.grant.target !== input.candidate.target, 'grant-target')
  fail(!input.grant.methods.includes(input.policy.method), 'method-not-granted')
  fail(!input.runtime.allowsMerge, 'runtime-policy-denies-merge')
  // 2. Complete current evidence for the final candidate.
  fail(input.evidence.acceptance !== 'current', `acceptance-${input.evidence.acceptance}`)
  for (const gate of ['verify', 'review', 'refutation', 'integration'] as const)
    fail(input.evidence[gate] !== 'passed', `${gate}-${input.evidence[gate]}`)
  fail(input.evidence.humanObservations === 'unsatisfied', 'human-observations-unsatisfied')
  // 3. One open ready PR at the exact candidate and target, within scope.
  fail(input.pr.codeHost !== 'github', 'unsupported-merge-host')
  fail(input.pr.state !== 'open', `pull-request-${input.pr.state}`)
  fail(input.pr.draft, 'pull-request-draft')
  fail(input.pr.head !== input.candidate.head, 'pull-request-head-changed')
  fail(`refs/heads/${input.pr.base}` !== input.candidate.target, 'pull-request-base-changed')
  if (input.pr.files === 'unknown') unknown.push('changed-files-unknown')
  else {
    const exceptions = new Set(input.policy.exceptions)
    fail(
      input.pr.files.some(
        (file) =>
          !exceptions.has(file) &&
          input.policy.denylist.some((pattern) => pathMatches(pattern, file)),
      ),
      'sensitive-path',
    )
  }
  // 4. Required checks from trusted issuers and observed reviews and discussions.
  const verdict = ciVerdict(input.ci, input.policy.checks)
  fail(input.ci.candidate !== input.candidate.head, 'ci-candidate-mismatch')
  fail(input.ci.pr !== input.pr.url, 'ci-pull-request-mismatch')
  fail(verdict.status === 'failed', 'required-check-failed')
  gap(verdict.status === 'pending', 'required-check-pending')
  if (verdict.status === 'unknown') unknown.push(...verdict.reasons.map((r) => `ci-${r}`))
  if (verdict.status === 'unknown' && !verdict.reasons.length)
    for (const check of verdict.checks.filter((c) => c.state !== 'success'))
      unknown.push(`check-${check.state}:${check.name}`)
  fail(verdict.reviews === 'unsatisfied', 'required-review-missing')
  gap(verdict.reviews === 'unknown', 'reviews-unknown')
  if (input.pr.unresolvedDiscussions === 'unknown') unknown.push('discussions-unknown')
  else fail(input.pr.unresolvedDiscussions > 0, 'unresolved-discussion')
  // 5. No conflicts, missing dependency delivery or stale base.
  if (input.pr.mergeable === 'unknown') unknown.push('mergeability-unknown')
  else fail(!input.pr.mergeable, 'merge-conflict')
  for (const dependency of input.dependencies)
    if (dependency.delivered === 'unknown')
      unknown.push(`dependency-unknown:${dependency.repository}`)
    else fail(!dependency.delivered, `dependency-undelivered:${dependency.repository}`)
  if (input.base.current === 'unknown') unknown.push('base-currency-unknown')
  else fail(!input.base.current, 'stale-base')
  // 6. The server must enforce head matching and current-base validation.
  if (input.ci.protection.status === 'observed')
    fail(input.ci.protection.strict !== true, 'no-server-current-base-check')
  // 7. Allowed method and no bypass, force, protection change or armed auto-merge.
  if (input.pr.allowedMethods === 'unknown') unknown.push('merge-methods-unknown')
  else fail(!input.pr.allowedMethods.includes(input.policy.method), 'method-not-allowed')
  fail(input.requested.adminBypass, 'admin-bypass-requested')
  fail(input.requested.force, 'force-requested')
  fail(input.requested.protectionChange, 'protection-change-requested')
  fail(input.requested.autoMerge, 'auto-merge-requested')
  // Freshness: every observation is at most 60 seconds old.
  const oldest = Math.min(Date.parse(input.ci.observedAt), Date.parse(input.base.observedAt))
  fail(!Number.isFinite(oldest) || now - oldest > MERGE_OBSERVATION_MAX_AGE_MS, 'stale-observation')
  fail(!Number.isFinite(oldest) || oldest > now, 'future-observation')
  const expires = Math.min(
    Number.isFinite(oldest) ? oldest + MERGE_OBSERVATION_MAX_AGE_MS : now,
    Date.parse(input.grant.expiresAt) || now,
  )
  const reasons = [...new Set([...ineligible, ...unknown])].sort()
  return {
    schema: 'wholeloop/merge-eligibility@1',
    status: ineligible.length ? 'ineligible' : unknown.length ? 'unknown' : 'eligible',
    reasons,
    evidence: contractDigest(input),
    expiresAt: new Date(Math.max(now, expires)).toISOString(),
  }
}
