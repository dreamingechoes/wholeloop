import { isObject } from '../config/schema.js'
import { measurementDigest } from '../launch/measurement.js'
import type { OperationCall, OperationResult, ProviderHost } from '../providers/operations.js'
import { collectRampEvidence, flagEvidence, observationTime } from './evidence.js'
import type { RampWorkflow } from './workflow.js'

export const rampCallDigest = (call: OperationCall) =>
  measurementDigest({
    provider: call.provider,
    operation: call.operation,
    tool: call.tool,
    args: call.args,
  })
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
  const requests: { fingerprint: string; call: OperationCall }[] = []
  const recorder: ProviderHost = {
    invoke: async (call) => {
      const fingerprint = rampCallDigest(call)
      if (!requests.some((request) => request.fingerprint === fingerprint))
        requests.push({ fingerprint, call })
      return { status: 'pending', ref: 'request-plan-only' }
    },
  }
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
  if (
    !isObject(value) ||
    Object.keys(value).some(
      (key) => !['schema', 'run', 'stage', 'at', 'mode', 'results'].includes(key),
    ) ||
    value.schema !== 'wholeloop/ramp-read-responses@1' ||
    value.run !== requests.run ||
    value.stage !== requests.stage ||
    value.at !== requests.at ||
    value.mode !== requests.mode ||
    !Array.isArray(value.results)
  )
    throw new Error(
      'Read responses must match the exact ramp request run, stage, timestamp and mode',
    )
  const results = new Map<string, { result?: OperationResult; unavailable?: string }>()
  for (const entry of value.results) {
    if (
      !isObject(entry) ||
      Object.keys(entry).some((key) => !['fingerprint', 'result', 'unavailable'].includes(key)) ||
      typeof entry.fingerprint !== 'string' ||
      !requests.requests.some((request) => request.fingerprint === entry.fingerprint) ||
      results.has(entry.fingerprint) ||
      isObject(entry.result) === (typeof entry.unavailable === 'string')
    )
      throw new Error(
        'Supply one explicit normalized result or unavailable reason per exact read fingerprint',
      )
    results.set(entry.fingerprint, {
      ...(isObject(entry.result) ? { result: entry.result as unknown as OperationResult } : {}),
      ...(typeof entry.unavailable === 'string' ? { unavailable: entry.unavailable } : {}),
    })
  }
  if (results.size !== requests.requests.length)
    throw new Error('Read responses must cover every request; missing evidence cannot be inferred')
  return {
    invoke: async (call) => {
      const entry = results.get(rampCallDigest(call))
      if (!entry?.result) throw new Error('Explicit unavailable read; no observed state')
      return entry.result
    },
  }
}
