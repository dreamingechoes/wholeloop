import { createHash } from 'node:crypto'
import type { LoadedProvider } from './load.js'
import { type ProviderHost, performOperation } from './operations.js'

export interface SourceQuery {
  operation: string
  query: string
  owner: string
  window: { start: string; end: string; timezone: string }
}

/** The host returns observations, never inferred claims; missing observations stay explicit. */
export async function querySource(
  provider: LoadedProvider,
  request: SourceQuery,
  host: ProviderHost,
) {
  if (
    !request.operation.startsWith('source.') ||
    !request.operation.endsWith('.query') ||
    !provider.manifest.operations[request.operation] ||
    provider.manifest.degrade[request.operation] !== 'open-question'
  )
    throw new Error('Select a read-only source query with open-question degradation')
  const { start, end, timezone } = request.window
  if (
    !request.query.trim() ||
    !request.owner.trim() ||
    !/^\d{4}-\d\d-\d\dT.+(?:Z|[+-]\d\d:\d\d)$/.test(start) ||
    !/^\d{4}-\d\d-\d\dT.+(?:Z|[+-]\d\d:\d\d)$/.test(end) ||
    !Number.isFinite(Date.parse(start)) ||
    !Number.isFinite(Date.parse(end)) ||
    Date.parse(start) >= Date.parse(end)
  )
    throw new Error('A source query needs query, owner and an explicit increasing timestamp window')
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone })
  } catch {
    throw new Error('Provide a valid source window timezone')
  }
  const pinned = {
    provider: provider.manifest.id,
    ...structuredClone(request),
    sha256: createHash('sha256').update(request.query).digest('hex'),
  }
  const unavailable = (missing: string) => ({
    schema: 'wholeloop/source-evidence@1',
    status: 'open-question' as const,
    pinned,
    evidence: null,
    question: {
      question: `What evidence does ${provider.manifest.name} provide for this query?`,
      missing,
      who: pinned.owner,
    },
  })
  try {
    const result = await performOperation(
      provider,
      request.operation,
      { query: request.query, window: request.window },
      host,
    )
    if (result.status !== 'succeeded' || result.complete !== true || !result.body?.trim())
      return unavailable(
        'The source did not return complete observed evidence; confirm access and query completion',
      )
    return {
      schema: 'wholeloop/source-evidence@1',
      status: 'observed' as const,
      pinned,
      evidence: { ref: result.ref, content: result.body },
      question: null,
    }
  } catch {
    // Tool errors can contain credentials or private payloads. Keep the action owner,
    // not raw error text, in the durable evidence handed to later steps.
    return unavailable(
      'Source request failed; verify permissions, query schema and availability in the host',
    )
  }
}
