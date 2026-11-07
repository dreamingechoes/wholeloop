// Turns a ramp decision into a flag change proposal; a person makes every actual change.
import { isObject } from '../config/schema.js'
import { measurementDigest } from '../launch/measurement.js'
import { safeEvidenceReference } from '../providers/numeric.js'
import { type ProviderHost, performOperation } from '../providers/operations.js'
import type { StateEvent } from '../state/events.js'
import { rampProposal, rampRuns } from './contracts.js'
import type { RampWorkflow } from './workflow.js'

export function rampProposals(events: readonly StateEvent[]) {
  const requests = new Map<
    string,
    {
      subject: string
      run: string
      stage: number
      basis: string
      provider: string
      digest: string
      result?: { status: 'succeeded' | 'pending'; ref: string }
    }
  >()
  for (const [index, event] of events.entries()) {
    if (event.type === 'ramp.proposal-planned') {
      const record = rampRuns(events.slice(0, index)).find((run) => run.run === event.data.run)
      if (
        !record ||
        record.subject !== event.subject ||
        record.stage !== event.data.stage ||
        !record.plan.flag ||
        requests.has(event.data.basis) ||
        measurementDigest(rampProposal(record)) !== event.data.digest
      )
        throw new Error('A flag proposal needs one intent for its exact approved stage decision')
      requests.set(event.data.basis, { subject: event.subject, ...event.data })
    }
    if (event.type === 'ramp.proposal-finished') {
      const request = requests.get(event.data.basis)
      if (
        !request ||
        request.subject !== event.subject ||
        request.run !== event.data.run ||
        request.stage !== event.data.stage ||
        request.result
      )
        throw new Error('A proposal receipt needs one matching intent')
      request.result = event.data.result
    }
  }
  return [...requests.values()]
}
/** Explicit conductor dispatch creates a proposal only; a person performs every actual change. */
export async function dispatchRampProposal(
  workflow: RampWorkflow,
  subject: string,
  host: ProviderHost,
) {
  const { engine, record, registry, flagsProvider } = workflow.context(subject)
  const proposal = rampProposal(record)
  const existing = rampProposals(engine.store.events()).find(
    (entry) => entry.basis === proposal.basis,
  )
  if (existing?.result) return { proposal, cached: true, result: existing.result }
  if (existing)
    throw new Error('Proposal outcome is ambiguous; inspect the retained intent before retrying')
  const provider = registry.providers.find(
    (entry) =>
      entry.manifest.id === flagsProvider && entry.manifest.operations['flags.propose-change'],
  )
  if (!proposal.flag || !provider)
    return { proposal, cached: true, result: { status: 'handoff', ref: 'local-proposal' } }
  engine.store.transaction((_events, append) =>
    append(subject, {
      type: 'ramp.proposal-planned',
      data: {
        run: record.run,
        stage: record.stage,
        basis: proposal.basis,
        provider: provider.manifest.id,
        digest: measurementDigest(proposal),
      },
    }),
  )
  try {
    const result = await performOperation(
      provider,
      'flags.propose-change',
      {
        flag: proposal.flag,
        environment: proposal.environment,
        desired: proposal.desired,
        basis: proposal.basis,
        apply: false,
        proposalOnly: true,
      },
      host,
    )
    if (!safeEvidenceReference(result.ref) || !result.body)
      throw new Error('Missing proposal observation')
    const body: unknown = JSON.parse(result.body)
    if (!isObject(body) || body.applied !== false)
      throw new Error('Proposal response must explicitly report applied=false')
    const receipt = { status: result.status, ref: result.ref }
    engine.store.transaction((_events, append) =>
      append(subject, {
        type: 'ramp.proposal-finished',
        data: {
          run: record.run,
          stage: record.stage,
          basis: proposal.basis,
          result: receipt,
        },
      }),
    )
    return { proposal, cached: false, result: receipt }
  } catch {
    throw new Error('Proposal outcome is ambiguous; inspect the retained intent before retrying')
  }
}
