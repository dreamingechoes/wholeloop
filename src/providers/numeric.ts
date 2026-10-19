import { createHash } from 'node:crypto'
import { isObject } from '../config/schema.js'
import type { LoadedProvider } from './load.js'
import type { ProviderHost } from './operations.js'
import { querySource, type SourceQuery } from './sources.js'

export type NumericEvidence =
  | { status: 'observed'; unit: string; value: number; ref: string; bodyDigest: string }
  | { status: 'unknown'; unit: string; missing: string }

export function safeEvidenceReference(ref: string): boolean {
  if (!ref.trim() || /(?:password|token|api[-_]?key)=/i.test(ref)) return false
  try {
    const url = new URL(ref)
    return !url.username && !url.password
  } catch {
    return !/[\r\n\0]/.test(ref)
  }
}
/** Persist only normalized scalar evidence and a raw-content hash, not service logs. */
export async function numericEvidence(
  provider: LoadedProvider | undefined,
  request: SourceQuery,
  unit: string,
  host: ProviderHost,
): Promise<NumericEvidence> {
  const unknown = (missing: string): NumericEvidence => ({ status: 'unknown', unit, missing })
  if (!provider)
    return unknown('The named source provider is unavailable; confirm its configuration and access')
  const source = await querySource(provider, request, host)
  if (source.status !== 'observed' || !source.evidence)
    return unknown(source.question?.missing ?? 'No complete source observation')
  const { content, ref } = source.evidence
  if (content.length > 1024 * 1024)
    return unknown('Scalar source output exceeds 1 MiB; request a bounded aggregate')
  let value: unknown
  try {
    value = JSON.parse(content)
  } catch {
    return unknown('The source did not return normalized numeric JSON')
  }
  if (
    !isObject(value) ||
    typeof value.value !== 'number' ||
    !Number.isFinite(value.value) ||
    value.unit !== unit ||
    !safeEvidenceReference(ref)
  )
    return unknown(
      'The source scalar, unit or evidence reference is missing/incompatible; no value was inferred',
    )
  return {
    status: 'observed',
    unit,
    value: value.value,
    ref,
    bodyDigest: createHash('sha256').update(content).digest('hex'),
  }
}
