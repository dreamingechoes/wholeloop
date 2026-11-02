import { resolve } from 'node:path'
import { readSourceFile } from '../delivery/input.js'
import {
  inspectRepository,
  MaintenanceError,
  MaintenanceProposals,
  maintenanceInspection,
  maintenanceInspections,
  maintenanceProposal,
  maintenanceProposalInput,
  recurringEnvelope,
} from '../learning/maintenance.js'
import { admitMaintenanceProposals } from '../learning/maintenance-intake.js'
import { StoreFiles } from '../state/files.js'
import { storePath } from '../state/paths.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'

const EFFECTS = { code: 'not-changed', tracker: 'not-written' } as const

/** Operator-invoked: every finding comes from a fresh pinned run, never from a supplied file. */
export function maintenanceCommand(
  command: string,
  { options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
): number {
  const emit = (value: unknown) => io.out(JSON.stringify(value, null, json ? undefined : 2)),
    text = (name: string, hint: string) => {
      const value = options[name]
      if (typeof value !== 'string' || !value.trim())
        throw new CliError(`Provide ${name} <${hint}>`, EXIT.input)
      return value
    },
    file = (name: string, hint: string): unknown => {
      const path = text(name, hint)
      try {
        return JSON.parse(readSourceFile(root, path, 1024 * 1024))
      } catch {
        throw new CliError(`Provide a readable JSON file for ${name}`, EXIT.input)
      }
    }
  try {
    if (command === 'maintenance inspect') {
      // Read-only against the pinned repository: no store is opened or created.
      const inspection = maintenanceInspection(file('--file', 'inspection.json'))
      emit({
        schema: 'wholeloop/maintenance-inspection@1',
        inspection: inspection.id,
        finding: inspectRepository(inspection) ?? null,
        effects: EFFECTS,
      })
      return EXIT.ok
    }
    const store = options['--store'],
      files = new StoreFiles(typeof store === 'string' ? resolve(root, store) : storePath()),
      proposals = new MaintenanceProposals(files)
    if (command === 'maintenance propose') {
      const inspection = maintenanceInspection(file('--inspection', 'inspection.json')),
        input = maintenanceProposalInput(file('--file', 'proposal.json')),
        finding = inspectRepository(inspection)
      if (!finding)
        emit({ schema: 'wholeloop/maintenance-propose@1', status: 'no-finding', key: null })
      else {
        const proposal = maintenanceProposal(finding, input),
          recorded = proposals.record(proposal)
        emit({
          schema: 'wholeloop/maintenance-propose@1',
          status: recorded.status,
          key: recorded.key,
          protected: proposal.protected,
          effects: EFFECTS,
        })
      }
    } else if (command === 'maintenance proposals')
      emit({
        schema: 'wholeloop/maintenance-proposals@1',
        proposals: proposals.list().map((entry) => ({
          key: entry.proposal.key,
          inspection: entry.proposal.finding.inspection,
          category: entry.proposal.finding.category,
          repository: entry.proposal.finding.repository,
          base: entry.proposal.finding.base,
          behavior: entry.proposal.behavior,
          protected: entry.proposal.protected,
          status: entry.status,
          ...(entry.dismissal
            ? { dismissal: { operator: entry.dismissal.operator, reason: entry.dismissal.reason } }
            : {}),
        })),
        currency: 'not-inspected',
      })
    else if (command === 'maintenance dismiss') {
      const key = text('--key', 'sha256')
      if (!/^[a-f0-9]{64}$/.test(key)) throw new CliError('Provide --key <sha256>', EXIT.input)
      const operator = text('--operator', 'name'),
        reason = text('--reason', 'text')
      proposals.dismiss(key, operator, reason)
      emit({ schema: 'wholeloop/maintenance-dismissal@1', key, status: 'dismissed', operator })
    } else {
      const at = typeof options['--at'] === 'string' ? options['--at'] : new Date().toISOString()
      if (!Number.isFinite(Date.parse(at)))
        throw new CliError('Provide --at <iso-time>', EXIT.input)
      const now = new Date(Date.parse(at)).toISOString(),
        result = admitMaintenanceProposals({
          store: files.root,
          envelope: recurringEnvelope(file('--envelope', 'envelope.json')),
          inspections: maintenanceInspections(file('--inspections', 'inspections.json')),
          now,
        })
      emit({
        schema: 'wholeloop/maintenance-admit@1',
        at: now,
        envelope: result.envelope,
        results: result.results,
        grant: 'separate-exact-plan-grant-required',
        execution: 'not-started',
        // Each admitted run is planned against its own source and needs its own grant.
        next: result.results.some((entry) => entry.admitted)
          ? [
              'wl delivery plan --file <plan-proposal.json>',
              'wl delivery authorize --file <operator-request.json>',
            ]
          : [],
      })
    }
    return EXIT.ok
  } catch (error) {
    if (error instanceof CliError) throw error
    if (error instanceof MaintenanceError) throw new CliError(error.message, EXIT.precondition)
    throw new CliError(
      'Maintenance command failed; preserve the external store; contents omitted',
      EXIT.precondition,
    )
  }
}
