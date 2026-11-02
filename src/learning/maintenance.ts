import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { readSourceFile } from '../delivery/input.js'
import { pathMatches } from '../runner/merge-eligibility.js'
import type { StoreFiles } from '../state/files.js'

/** Fixed messages only; a rejected operator value never appears in the text. */
export class MaintenanceError extends Error {}
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const CATEGORIES = [
  'stale-docs',
  'failing-regression',
  'repeated-error',
  'dependency-risk',
  'policy-drift',
] as const
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/
const text = (value: unknown, limit = 4096): value is string =>
  typeof value === 'string' && !!value.trim() && value.length <= limit
const texts = (value: unknown, max: number, limit = 4096): value is string[] =>
  Array.isArray(value) && value.length <= max && value.every((entry) => text(entry, limit))
const exact = (value: unknown, keys: string[]): value is Record<string, unknown> =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join(',') === [...keys].sort().join(',')
const count = (value: unknown, max: number): value is number =>
  Number.isInteger(value) && (value as number) >= 1 && (value as number) <= max
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

/**
 * Operator files arrive through the CLI, so each shape is closed and bounded
 * before anything runs. Errors name the field family, never the rejected value.
 */
export function maintenanceInspection(value: unknown): MaintenanceInspection {
  if (
    !exact(value, ['id', 'category', 'repository', 'root', 'command', 'rule']) ||
    typeof value.id !== 'string' ||
    !ID.test(value.id) ||
    !CATEGORIES.includes(value.category as (typeof CATEGORIES)[number]) ||
    !text(value.repository, 128) ||
    !text(value.root) ||
    !isAbsolute(value.root) ||
    !texts(value.command, 64) ||
    !value.command.length ||
    !text(value.rule)
  )
    throw new MaintenanceError('Invalid maintenance inspection; contents omitted')
  return structuredClone(value) as unknown as MaintenanceInspection
}
export function maintenanceInspections(value: unknown): MaintenanceInspection[] {
  if (!Array.isArray(value) || !value.length || value.length > 64)
    throw new MaintenanceError('Provide 1 to 64 pinned inspections; contents omitted')
  const inspections = value.map(maintenanceInspection)
  if (new Set(inspections.map((entry) => entry.id)).size !== inspections.length)
    throw new MaintenanceError('Duplicate maintenance inspection identity; contents omitted')
  return inspections
}
/** The proposal half an operator or agent supplies; the finding always comes from a fresh run. */
export function maintenanceProposalInput(value: unknown) {
  if (
    !exact(value, ['behavior', 'scope', 'criteria', 'validation', 'risks']) ||
    !text(value.behavior) ||
    !texts(value.scope, 64, 1024) ||
    !Array.isArray(value.criteria) ||
    value.criteria.length > 32 ||
    value.criteria.some(
      (entry) =>
        !exact(entry, ['id', 'text', 'test']) ||
        typeof entry.id !== 'string' ||
        !ID.test(entry.id) ||
        !text(entry.text) ||
        !text(entry.test),
    ) ||
    new Set(value.criteria.map((entry: { id: string }) => entry.id)).size !==
      value.criteria.length ||
    !text(value.validation) ||
    !texts(value.risks, 32)
  )
    throw new MaintenanceError('Invalid maintenance proposal input; contents omitted')
  return structuredClone(value) as Parameters<typeof maintenanceProposal>[1]
}
export function recurringEnvelope(value: unknown): RecurringEnvelope {
  if (
    !exact(value, [
      'operator',
      'categories',
      'repositories',
      'protectedPaths',
      'perRun',
      'aggregate',
      'endpoint',
    ]) ||
    !text(value.operator, 256) ||
    !Array.isArray(value.categories) ||
    !value.categories.length ||
    value.categories.some((entry) => !CATEGORIES.includes(entry)) ||
    !texts(value.repositories, 64, 128) ||
    !value.repositories.length ||
    !texts(value.protectedPaths, 64, 1024) ||
    !exact(value.perRun, ['maxScope', 'maxCriteria']) ||
    !count(value.perRun.maxScope, 64) ||
    !count(value.perRun.maxCriteria, 32) ||
    !exact(value.aggregate, ['maxRuns', 'windowMs']) ||
    !count(value.aggregate.maxRuns, 100) ||
    !count(value.aggregate.windowMs, 366 * 86400000) ||
    // Merge is never admitted from a proposal; ADR-0195 keeps it out of envelopes.
    !['local-handoff', 'to-pr'].includes(value.endpoint as string)
  )
    throw new MaintenanceError('Invalid recurring envelope; contents omitted')
  return structuredClone(value) as unknown as RecurringEnvelope
}

/** Run the pinned command read-only at the current base; nothing is edited or published. */
export function inspectRepository(
  inspection: Readonly<MaintenanceInspection>,
): MaintenanceFinding | undefined {
  const [binary, ...args] = inspection.command
  if (!binary || !/^[a-z][a-z0-9-]*$/.test(binary))
    throw new MaintenanceError('Pin one local command')
  const base = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: inspection.root, encoding: 'utf8' })
  if (base.status !== 0) throw new MaintenanceError('The inspected repository has no readable base')
  const run = spawnSync(binary, args, {
    cwd: inspection.root,
    encoding: 'utf8',
    shell: false,
    timeout: 60000,
    maxBuffer: 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  })
  if (run.error || run.signal) throw new MaintenanceError('The pinned inspection did not complete')
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
    throw new MaintenanceError('A proposal needs behavior, scope, testable criteria and validation')
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
    if (!/^[a-f0-9]{64}$/.test(key)) throw new MaintenanceError('Invalid proposal key')
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
      throw new MaintenanceError('A dismissal needs an operator and reason')
    if (!existsSync(this.files.path(this.path(key)))) throw new MaintenanceError('Unknown proposal')
    this.files.locked(() => {
      if (existsSync(this.files.path(this.path(key, '.dismissed'))))
        throw new MaintenanceError('Proposal is already dismissed')
      this.files.atomic(
        this.path(key, '.dismissed'),
        `${JSON.stringify({ key, operator, reason })}\n`,
      )
    })
  }
  get(key: string): MaintenanceProposal {
    const proposal = JSON.parse(
      readSourceFile(this.files.root, this.path(key), 1024 * 1024),
    ) as MaintenanceProposal
    if (proposal.schema !== 'wholeloop/maintenance-proposal@1' || proposal.key !== key)
      throw new MaintenanceError('Damaged maintenance proposal; contents omitted')
    return proposal
  }
  dismissal(key: string): { key: string; operator: string; reason: string } | undefined {
    const path = this.path(key, '.dismissed')
    if (!existsSync(this.files.path(path))) return undefined
    return JSON.parse(readSourceFile(this.files.root, path, 65536))
  }
  /** Keys come from file names, so every record is reopened and checked against its own key. */
  list() {
    const directory = this.files.path('learning/proposals')
    if (!existsSync(directory)) return []
    return readdirSync(directory)
      .filter((name) => /^[a-f0-9]{64}\.json$/.test(name))
      .sort()
      .map((name) => {
        const key = name.slice(0, 64),
          dismissal = this.dismissal(key)
        return {
          proposal: this.get(key),
          status: dismissal ? ('dismissed' as const) : ('open' as const),
          ...(dismissal ? { dismissal } : {}),
        }
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
/** Binds admissions to the exact operator limits that admitted them. */
export function recurringFingerprint(envelope: Readonly<RecurringEnvelope>): string {
  return digest(envelope)
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
  if (!envelope.operator.trim())
    throw new MaintenanceError('A recurring envelope needs its operator')
  const since = Date.parse(input.now) - envelope.aggregate.windowMs
  let used = input.admitted.filter((entry) => Date.parse(entry.at) > since).length
  const fingerprint = recurringFingerprint(envelope)
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
