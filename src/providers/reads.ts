// Read requests for provider data and the host that replays explicit client transcripts.
import { isObject } from '../config/schema.js'
import { measurementDigest } from '../launch/measurement.js'
import type { OperationCall, OperationResult, ProviderHost } from './operations.js'

export const readCallDigest = (call: OperationCall) =>
  measurementDigest({
    provider: call.provider,
    operation: call.operation,
    tool: call.tool,
    args: call.args,
  })
export async function planReadRequests(collect: (host: ProviderHost) => Promise<unknown>) {
  const requests: { fingerprint: string; call: OperationCall }[] = []
  await collect({
    invoke: async (call) => {
      if (!call.operation.startsWith('source.') && call.operation !== 'flags.read-state')
        throw new Error('Read planning cannot capture a write operation')
      const fingerprint = readCallDigest(call)
      if (!requests.some((entry) => entry.fingerprint === fingerprint))
        requests.push({ fingerprint, call })
      return { status: 'pending', ref: 'request-plan-only' }
    },
  })
  return requests
}
/** Explicit host transcripts are observations, not evidence that the core performed a remote read. */
export function normalizedReadHost(
  value: unknown,
  identity: Record<string, string | number>,
  requests: { fingerprint: string }[],
): ProviderHost {
  if (
    !isObject(value) ||
    Object.keys(value).some((key) => ![...Object.keys(identity), 'results'].includes(key)) ||
    Object.entries(identity).some(([key, expected]) => value[key] !== expected) ||
    !Array.isArray(value.results)
  )
    throw new Error('Read responses must match the exact request identity and timestamp')
  const results = new Map<string, { result?: OperationResult }>()
  for (const entry of value.results) {
    if (
      !isObject(entry) ||
      Object.keys(entry).some((key) => !['fingerprint', 'result', 'unavailable'].includes(key)) ||
      typeof entry.fingerprint !== 'string' ||
      !requests.some((request) => request.fingerprint === entry.fingerprint) ||
      results.has(entry.fingerprint) ||
      isObject(entry.result) === (typeof entry.unavailable === 'string')
    )
      throw new Error(
        'Supply one explicit normalized result or unavailable reason per exact read fingerprint',
      )
    results.set(
      entry.fingerprint,
      isObject(entry.result) ? { result: entry.result as unknown as OperationResult } : {},
    )
  }
  if (results.size !== requests.length)
    throw new Error('Read responses must cover every request; missing evidence cannot be inferred')
  return {
    invoke: async (call) => {
      const entry = results.get(readCallDigest(call))
      if (!entry?.result) throw new Error('Explicit unavailable read; no observed state')
      return entry.result
    },
  }
}
