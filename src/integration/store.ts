import { existsSync } from 'node:fs'
import { acceptanceShape } from '../acceptance/contracts.js'
import { contractDigest } from '../contracts/compatibility.js'
import { readSourceFile } from '../delivery/input.js'
import { DeliveryJournalError } from '../delivery/journal-error.js'
import { DeliveryLifecycle } from '../delivery/lifecycle.js'
import { DeliveryPlanning } from '../delivery/planning-store.js'
import {
  INTEGRATION_REQUEST_SCHEMA,
  IntegrationError,
  type IntegrationRequest,
} from './contracts.js'
import { type IntegrationCandidate, observeIntegration } from './observe.js'
import candidateSchema from './schemas/candidate-v1.json' with { type: 'json' }
import recordSchema from './schemas/record-v1.json' with { type: 'json' }

export const INTEGRATION_CANDIDATE_SCHEMA = candidateSchema
export const INTEGRATION_RECORD_SCHEMA = recordSchema
export interface IntegrationRecord {
  schema: 'wholeloop/integration-candidate-record@1'
  digest: string
  candidate: IntegrationCandidate
}
function requestFrom(candidate: IntegrationCandidate): IntegrationRequest {
  return {
    schema: 'wholeloop/integration-candidate-request@1',
    run: candidate.run,
    revision: candidate.revision,
    plan: candidate.plan,
    milestone: candidate.milestone,
    strategy: candidate.strategy,
    parts: candidate.parts.map(({ snapshot: _snapshot, ...part }) => part),
    assemblies: candidate.assemblies.map(
      ({ snapshot: _snapshot, parents: _parents, ...assembly }) => assembly,
    ),
    contracts: candidate.contracts,
    inputs: candidate.inputs.map(({ bytes: _bytes, ...input }) => input),
    repairOwners: candidate.repairOwners,
  }
}
/** Immutable preparation and current inspection, never assembly execution or a grant. */
export class IntegrationCandidates {
  readonly planning: DeliveryPlanning
  readonly lifecycle: DeliveryLifecycle
  constructor(store?: string) {
    this.planning = new DeliveryPlanning(store)
    this.lifecycle = new DeliveryLifecycle(this.planning.sources.files.root)
  }
  private current(run: string, plan: string, source: string) {
    try {
      const state = this.lifecycle.journal.view(run)
      if (
        state.basis.digest !== plan ||
        state.source !== source ||
        state.plans.at(-1)?.digest !== plan
      )
        throw new IntegrationError('delivery-basis-changed')
    } catch (error) {
      if (!(error instanceof DeliveryJournalError && error.problem === 'unknown-run')) throw error
    }
  }
  prepare(value: unknown) {
    acceptanceShape(value, INTEGRATION_REQUEST_SCHEMA)
    const input = value as IntegrationRequest
    // The closed request validator runs before these identifiers reach store paths.
    const { run, revision } = input ?? {}
    const prepared = this.planning.getPlan(run, revision)
    this.current(run, prepared.digest, prepared.plan.source)
    const candidate = observeIntegration(
      this.planning.sources.files,
      value,
      prepared.plan,
      prepared.digest,
    )
    acceptanceShape(candidate, candidateSchema)
    const digest = contractDigest(candidate),
      record: IntegrationRecord = {
        schema: 'wholeloop/integration-candidate-record@1',
        digest,
        candidate,
      }
    acceptanceShape(record, recordSchema)
    this.planning.sources.files.locked(() => {
      const path = this.path(digest)
      if (existsSync(this.planning.sources.files.path(path))) {
        if (this.get(digest).digest !== digest)
          throw new IntegrationError('changed-candidate-index')
        return
      }
      this.planning.sources.files.atomic(path, `${JSON.stringify(record)}\n`)
    })
    return record
  }
  get(digest: string): IntegrationRecord {
    const record = JSON.parse(
      readSourceFile(this.planning.sources.files.root, this.path(digest), 8 * 1024 * 1024),
    ) as IntegrationRecord
    acceptanceShape(record, recordSchema)
    if (record.digest !== digest || contractDigest(record.candidate) !== digest)
      throw new IntegrationError('changed-candidate-bytes')
    const plan = this.planning.getPlan(record.candidate.run, record.candidate.revision)
    if (record.candidate.plan !== plan.digest || record.candidate.source !== plan.plan.source)
      throw new IntegrationError('candidate-plan-binding')
    return record
  }
  inspect(digest: string) {
    const record = this.get(digest)
    let status: 'current' | 'stale' = 'stale',
      reason = 'changed-candidate-inputs'
    try {
      const plan = this.planning.getPlan(record.candidate.run, record.candidate.revision)
      this.current(record.candidate.run, plan.digest, plan.plan.source)
      const current = observeIntegration(
        this.planning.sources.files,
        requestFrom(record.candidate),
        plan.plan,
        plan.digest,
      )
      status = contractDigest(current) === digest ? 'current' : 'stale'
      reason =
        status === 'current'
          ? 'complete-observed-input-vector-matches'
          : 'changed-observed-input-vector'
    } catch (error) {
      reason = error instanceof IntegrationError ? error.problem : 'inputs-changed-or-unavailable'
    }
    return { ...record, status, reason, authority: 'not-granted' as const }
  }
  compare(before: string, after: string) {
    const left = this.get(before),
      right = this.get(after)
    if (
      left.candidate.run !== right.candidate.run ||
      left.candidate.milestone !== right.candidate.milestone
    )
      throw new IntegrationError('unrelated-candidates')
    return {
      sameInputs: left.candidate.inputIdentity === right.candidate.inputIdentity,
      reason:
        left.candidate.inputIdentity === right.candidate.inputIdentity
          ? 'complete-input-vector-matches'
          : 'changed-or-unknown-inputs-invalidate-dependent-evidence',
      executionReuse: 'not-authorized' as const,
    }
  }
  private path(digest: string) {
    if (!/^[a-f0-9]{64}$/.test(digest)) throw new IntegrationError('invalid-candidate-id')
    return `delivery/integration-candidates/${digest}.json`
  }
}
