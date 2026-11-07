// Admits maintenance proposals into delivery once per proposal key.
import { existsSync, readdirSync } from 'node:fs'
import { readSourceFile } from '../delivery/input.js'
import { DeliverySources } from '../delivery/source.js'
import { StoreFiles } from '../state/files.js'
import {
  inspectRepository,
  MaintenanceError,
  type MaintenanceInspection,
  type MaintenanceProposal,
  MaintenanceProposals,
  type RecurringEnvelope,
  recurringAdmission,
  recurringFingerprint,
} from './maintenance.js'

/** Immutable: one admission per proposal key, never renewed or reused. */
export interface MaintenanceAdmission {
  schema: 'wholeloop/maintenance-admission@1'
  key: string
  run: string
  source: string
  envelope: string
  operator: string
  endpoint: RecurringEnvelope['endpoint']
  at: string
  grant: 'separate-exact-plan-grant-required'
}
export interface MaintenanceAdmissionResult {
  key: string
  admitted: boolean
  reasons: string[]
  run?: string
  source?: string
}

const ADMISSIONS = 'learning/admissions'
function admissions(files: StoreFiles): MaintenanceAdmission[] {
  const directory = files.path(ADMISSIONS)
  if (!existsSync(directory)) return []
  return readdirSync(directory)
    .filter((name) => /^[a-f0-9]{64}\.json$/.test(name))
    .sort()
    .map((name) => {
      const record = JSON.parse(
        readSourceFile(files.root, `${ADMISSIONS}/${name}`, 65536),
      ) as MaintenanceAdmission
      if (record.schema !== 'wholeloop/maintenance-admission@1' || `${record.key}.json` !== name)
        throw new MaintenanceError('Damaged maintenance admission; contents omitted')
      return record
    })
}

/**
 * The delivery request an admitted proposal becomes. Each criterion line is
 * mapped, so a later plan binds its criteria to source lines rather than to
 * a paraphrase; finding lines stay context.
 */
export function maintenanceSourceRequest(proposal: Readonly<MaintenanceProposal>) {
  const lines = [
    `# Maintenance proposal ${proposal.key.slice(0, 16)}`,
    '',
    `Behavior: ${proposal.behavior}`,
    `Repository: ${proposal.finding.repository} at ${proposal.finding.base}`,
    `Evidence: ${proposal.finding.evidence} from ${proposal.finding.inspection} (${proposal.finding.category})`,
    `Validation: ${proposal.validation}`,
    '',
    'Scope:',
    ...proposal.scope.map((path) => `- ${path}`),
    '',
    'Criteria:',
  ]
  const mapping: {
    id: string
    role: 'criterion' | 'context'
    startLine: number
    endLine: number
  }[] = []
  for (const criterion of proposal.criteria) {
    lines.push(`- ${criterion.id}: ${criterion.text} Test: ${criterion.test}`)
    mapping.push({
      id: criterion.id,
      role: 'criterion',
      startLine: lines.length,
      endLine: lines.length,
    })
  }
  lines.push('', 'Risks:', ...proposal.risks.map((risk) => `- ${risk}`), '', 'Finding:')
  const start = lines.length + 1
  lines.push(...proposal.finding.lines.map((line) => `    ${line}`))
  mapping.push({ id: 'finding', role: 'context', startLine: start, endLine: lines.length })
  return {
    schema: 'wholeloop/delivery-source-request@1' as const,
    kind: 'inline' as const,
    ref: `maintenance-${proposal.key.slice(0, 16)}`,
    body: `${lines.join('\n')}\n`,
    mapping,
  }
}

/**
 * Re-inspect every open proposal, admit the current ones within the envelope
 * and capture each admitted proposal as its own delivery source. Planning and
 * the exact-plan grant stay with the operator, so admission starts a run's
 * intake but never its execution.
 */
export function admitMaintenanceProposals(input: {
  store: string
  envelope: Readonly<RecurringEnvelope>
  inspections: readonly Readonly<MaintenanceInspection>[]
  now: string
}): { envelope: string; results: MaintenanceAdmissionResult[] } {
  const files = new StoreFiles(input.store),
    proposals = new MaintenanceProposals(files),
    before = admissions(files),
    admitted = new Map(before.map((record) => [record.key, record])),
    results = new Map<string, MaintenanceAdmissionResult>(),
    candidates: { proposal: MaintenanceProposal; inspection: MaintenanceInspection }[] = []
  for (const entry of proposals.list()) {
    const proposal = entry.proposal,
      prior = admitted.get(proposal.key)
    if (prior) {
      results.set(proposal.key, {
        key: proposal.key,
        admitted: false,
        reasons: ['already-admitted'],
        run: prior.run,
        source: prior.source,
      })
      continue
    }
    if (entry.status === 'dismissed') {
      results.set(proposal.key, { key: proposal.key, admitted: false, reasons: ['dismissed'] })
      continue
    }
    const inspection = input.inspections.find(
      (item) =>
        item.id === proposal.finding.inspection && item.repository === proposal.finding.repository,
    )
    if (!inspection) {
      results.set(proposal.key, {
        key: proposal.key,
        admitted: false,
        reasons: ['inspection-not-pinned'],
      })
      continue
    }
    let latest: ReturnType<typeof inspectRepository>
    try {
      latest = inspectRepository(inspection)
    } catch {
      results.set(proposal.key, {
        key: proposal.key,
        admitted: false,
        reasons: ['inspection-failed'],
      })
      continue
    }
    if (!proposals.current(proposal, latest)) {
      results.set(proposal.key, { key: proposal.key, admitted: false, reasons: ['stale-evidence'] })
      continue
    }
    candidates.push({ proposal, inspection })
  }
  const decisions = recurringAdmission({
      envelope: input.envelope,
      proposals: candidates.map((entry) => entry.proposal),
      admitted: before,
      now: input.now,
    }),
    fingerprint = recurringFingerprint(input.envelope),
    records: MaintenanceAdmission[] = [],
    sources = new DeliverySources(files.root)
  for (const decision of decisions) {
    const candidate = candidates.find((entry) => entry.proposal.key === decision.key)
    if (!decision.admitted || !candidate) {
      results.set(decision.key, {
        key: decision.key,
        admitted: false,
        reasons: decision.reasons,
      })
      continue
    }
    let source: string
    try {
      // Content-addressed and inert: an unused snapshot grants nothing.
      source = sources.capture(
        maintenanceSourceRequest(candidate.proposal),
        candidate.inspection.root,
        input.now,
      ).id
    } catch {
      results.set(decision.key, { key: decision.key, admitted: false, reasons: ['unsafe-source'] })
      continue
    }
    records.push({
      schema: 'wholeloop/maintenance-admission@1',
      key: decision.key,
      run: decision.run,
      source,
      envelope: fingerprint,
      operator: input.envelope.operator,
      endpoint: decision.endpoint,
      at: input.now,
      grant: 'separate-exact-plan-grant-required',
    })
    results.set(decision.key, {
      key: decision.key,
      admitted: true,
      reasons: [],
      run: decision.run,
      source,
    })
  }
  if (records.length)
    files.locked(() => {
      // Run identities and the aggregate count were derived from `before`. Any
      // admission recorded since then invalidates both, so nothing is written.
      const now = admissions(files).map((record) => record.key)
      if (now.join(',') !== before.map((record) => record.key).join(','))
        throw new MaintenanceError(
          'Concurrent maintenance admission; rerun to re-evaluate the limits',
        )
      for (const record of records)
        files.atomic(`${ADMISSIONS}/${record.key}.json`, `${JSON.stringify(record)}\n`)
    })
  return {
    envelope: fingerprint,
    results: [...results.values()].sort((a, b) => a.key.localeCompare(b.key)),
  }
}
