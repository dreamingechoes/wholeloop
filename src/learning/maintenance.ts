import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { pathMatches } from '../runner/merge-eligibility.js'
import type { StoreFiles } from '../state/files.js'

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
/** Operator-pinned: the exact command and rule; an agent cannot change either. */
export interface MaintenanceInspection {
  id: string
  category:
    | 'stale-docs'
    | 'failing-regression'
    | 'repeated-error'
    | 'dependency-risk'
    | 'policy-drift'
  repository: string
  root: string
  command: string[]
  rule: string
}
export interface MaintenanceFinding {
  inspection: string
  category: MaintenanceInspection['category']
  repository: string
  base: string
  evidence: string
  lines: string[]
}
/** Paths whose change would edit policy, guidance, budgets or evaluation standards. */
export const PROTECTED_PATHS = Object.freeze([
  'enforcement.yml',
  'AGENTS.md',
  'CLAUDE.md',
  'harness/**',
  '.github/**',
  '**/rubric*',
  '**/*rubric*.json',
  '**/budgets*',
  'test/evals/**',
  'test/fixtures/contracts/**',
])

/** Run the pinned command read-only at the current base; nothing is edited or published. */
export function inspectRepository(
  inspection: Readonly<MaintenanceInspection>,
): MaintenanceFinding | undefined {
  const [binary, ...args] = inspection.command
  if (!binary || !/^[a-z][a-z0-9-]*$/.test(binary)) throw new Error('Pin one local command')
  const base = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: inspection.root, encoding: 'utf8' })
  if (base.status !== 0) throw new Error('The inspected repository has no readable base')
  const run = spawnSync(binary, args, {
    cwd: inspection.root,
    encoding: 'utf8',
    shell: false,
    timeout: 60000,
    maxBuffer: 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  })
  if (run.error || run.signal) throw new Error('The pinned inspection did not complete')
  const lines = run.stdout
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(0, 200)
  if (!lines.length) return undefined
  return {
    inspection: inspection.id,
    category: inspection.category,
    repository: inspection.repository,
    base: base.stdout.trim(),
    evidence: digest({ rule: inspection.rule, command: inspection.command, lines }),
    lines,
  }
}

export interface MaintenanceProposal {
  schema: 'wholeloop/maintenance-proposal@1'
  key: string
  finding: MaintenanceFinding
  behavior: string
  scope: string[]
  criteria: { id: string; text: string; test: string }[]
  validation: string
  risks: string[]
  protected: string[]
  effects: { code: 'not-changed'; tracker: 'not-written' }
}
/**
 * A proposal, never a change: it names its evidence, base, scope, criteria and
 * validation. Its deduplication key ignores the base, so a recurring finding
 * maps to one current proposal while its evidence is unchanged.
 */
export function maintenanceProposal(
  finding: Readonly<MaintenanceFinding>,
  input: {
    behavior: string
    scope: string[]
    criteria: { id: string; text: string; test: string }[]
    validation: string
    risks: string[]
  },
): MaintenanceProposal {
  if (
    !input.behavior.trim() ||
    !input.scope.length ||
    !input.criteria.length ||
    input.criteria.some((criterion) => !criterion.text.trim() || !criterion.test.trim()) ||
    !input.validation.trim()
  )
    throw new Error('A proposal needs behavior, scope, testable criteria and validation')
  return {
    schema: 'wholeloop/maintenance-proposal@1',
    key: digest({
      inspection: finding.inspection,
      repository: finding.repository,
      lines: finding.lines,
    }),
    finding: structuredClone(finding),
    behavior: input.behavior,
    scope: [...input.scope].sort(),
    criteria: structuredClone(input.criteria),
    validation: input.validation,
    risks: [...input.risks],
    protected: input.scope.filter((path) =>
      PROTECTED_PATHS.some((pattern) => pathMatches(pattern, path)),
    ),
    effects: { code: 'not-changed', tracker: 'not-written' },
  }
}

/** Immutable proposal records with retained dismissals in the external store. */
export class MaintenanceProposals {
  constructor(readonly files: StoreFiles) {}
  private path(key: string, suffix = '') {
    if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Invalid proposal key')
    return `learning/proposals/${key}${suffix}.json`
  }
  record(proposal: Readonly<MaintenanceProposal>) {
    return this.files.locked(() => {
      if (existsSync(this.files.path(this.path(proposal.key, '.dismissed'))))
        return { status: 'dismissed' as const, key: proposal.key }
      if (existsSync(this.files.path(this.path(proposal.key))))
        return { status: 'duplicate' as const, key: proposal.key }
      this.files.atomic(this.path(proposal.key), `${JSON.stringify(proposal)}\n`)
      return { status: 'recorded' as const, key: proposal.key }
    })
  }
  dismiss(key: string, operator: string, reason: string) {
    if (!operator.trim() || !reason.trim())
      throw new Error('A dismissal needs an operator and reason')
    if (!existsSync(this.files.path(this.path(key)))) throw new Error('Unknown proposal')
    this.files.locked(() => {
      if (existsSync(this.files.path(this.path(key, '.dismissed'))))
        throw new Error('Proposal is already dismissed')
      this.files.atomic(
        this.path(key, '.dismissed'),
        `${JSON.stringify({ key, operator, reason })}\n`,
      )
    })
  }
  /** A proposal is current only while a fresh inspection still yields its evidence. */
  current(
    proposal: Readonly<MaintenanceProposal>,
    latest: Readonly<MaintenanceFinding> | undefined,
  ) {
    return (
      !!latest &&
      latest.inspection === proposal.finding.inspection &&
      latest.evidence === proposal.finding.evidence &&
      !existsSync(this.files.path(this.path(proposal.key, '.dismissed')))
    )
  }
}

/** Separately operator-authorized; a proposal can neither create nor change it. */
export interface RecurringEnvelope {
  operator: string
  categories: MaintenanceInspection['category'][]
  repositories: string[]
  protectedPaths: string[]
  perRun: { maxScope: number; maxCriteria: number }
  aggregate: { maxRuns: number; windowMs: number }
  endpoint: 'local-handoff' | 'to-pr'
}
/**
 * Admit current proposals within the envelope. Each admission gets its own run
 * identity; protected paths, other categories or repositories, oversized scope
 * and the aggregate limit refuse it. Merge endpoints are never admitted here.
 */
export function recurringAdmission(input: {
  envelope: Readonly<RecurringEnvelope>
  proposals: readonly Readonly<MaintenanceProposal>[]
  admitted: readonly { at: string }[]
  now: string
}) {
  const envelope = input.envelope
  if (!envelope.operator.trim()) throw new Error('A recurring envelope needs its operator')
  const since = Date.parse(input.now) - envelope.aggregate.windowMs
  let used = input.admitted.filter((entry) => Date.parse(entry.at) > since).length
  const fingerprint = digest(envelope)
  return input.proposals.map((proposal) => {
    const reasons: string[] = []
    if (!envelope.categories.includes(proposal.finding.category)) reasons.push('category')
    if (!envelope.repositories.includes(proposal.finding.repository)) reasons.push('repository')
    const protectedPaths = [...PROTECTED_PATHS, ...envelope.protectedPaths]
    if (
      proposal.protected.length ||
      proposal.scope.some((path) => protectedPaths.some((pattern) => pathMatches(pattern, path)))
    )
      reasons.push('protected-path')
    if (proposal.scope.length > envelope.perRun.maxScope) reasons.push('per-run-scope')
    if (proposal.criteria.length > envelope.perRun.maxCriteria) reasons.push('per-run-criteria')
    if (!reasons.length && used >= envelope.aggregate.maxRuns) reasons.push('aggregate-limit')
    if (reasons.length) return { key: proposal.key, admitted: false as const, reasons }
    used += 1
    return {
      key: proposal.key,
      admitted: true as const,
      run: `delivery-${digest({ proposal: proposal.key, envelope: fingerprint, sequence: used }).slice(0, 16)}`,
      endpoint: envelope.endpoint,
      grant: 'separate-exact-plan-grant-required' as const,
      reasons,
    }
  })
}
