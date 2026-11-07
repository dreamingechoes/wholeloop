// Reads client-supplied flag observations for a ramp without querying a remote.
import type { ProviderHost } from '../providers/operations.js'
import { normalizedReadHost, planReadRequests, readCallDigest } from '../providers/reads.js'
import { collectRampEvidence, flagEvidence, observationTime } from './evidence.js'
import type { RampWorkflow } from './workflow.js'

export const rampCallDigest = readCallDigest
export async function rampReadRequests(
  workflow: RampWorkflow,
  subject: string,
  mode: 'observe' | 'confirm',
  at?: string,
) {
  const { engine, record, registry, flagsProvider, owner } = workflow.context(subject)
  const anchor = observationTime(at)
  if (mode === 'confirm' && (!record.decision || record.decision.outcome === 'hold'))
    throw new Error('Confirmation requests need an explicit go/rollback decision')
  if (mode === 'confirm') {
    const decision = engine.store.events().find((event) => event.id === record.decision?.event)
    if (!decision || Date.parse(anchor) < Date.parse(decision.ts))
      throw new Error('Collect a fresh flag read after the decision before confirmation')
  }
  const requests = await planReadRequests(async (recorder) => {
    if (mode === 'confirm') await flagEvidence(record.plan, registry, flagsProvider, recorder)
    else
      await collectRampEvidence(
        record.run,
        record.plan,
        record.stage,
        registry,
        flagsProvider,
        owner,
        recorder,
        anchor,
        record.exposureSince,
      )
  })
  return {
    schema: 'wholeloop/ramp-read-requests@1',
    subject,
    run: record.run,
    stage: record.stage,
    at: anchor,
    mode,
    requests,
    performed: false,
  }
}

/** Client-normalized read results are supplied explicitly; this adapter never queries a remote. */
export function rampResponseHost(
  value: unknown,
  requests: Awaited<ReturnType<typeof rampReadRequests>>,
): ProviderHost {
  return normalizedReadHost(
    value,
    {
      schema: 'wholeloop/ramp-read-responses@1',
      run: requests.run,
      stage: requests.stage,
      at: requests.at,
      mode: requests.mode,
    },
    requests.requests,
  )
}
