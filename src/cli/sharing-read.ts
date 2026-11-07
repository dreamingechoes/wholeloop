// Reads a labelled shared-document import, an observation rather than proof of an authenticated
// call.
import { readFileSync } from 'node:fs'
import { isObject } from '../config/schema.js'
import type { OperationResult } from '../providers/operations.js'
import { canonicalSharedUrl } from '../sharing/contracts.js'

/** Imports are labelled observations, never evidence that this process authenticated a tool. */
export function sharedRead(
  file: string,
  ref: string,
  provider: string,
  kind: string,
): OperationResult {
  let value: unknown
  try {
    const raw = readFileSync(file, 'utf8')
    if (Buffer.byteLength(raw) > 2 * 1024 * 1024) throw new Error()
    value = JSON.parse(raw)
  } catch {
    throw new Error('Cannot read bounded shared-read observation; contents omitted')
  }
  if (
    !isObject(value) ||
    Object.keys(value).some(
      (key) => !['schema', 'ref', 'provider', 'kind', 'result'].includes(key),
    ) ||
    value.schema !== 'wholeloop/shared-read@1' ||
    value.provider !== provider ||
    value.kind !== kind ||
    typeof value.ref !== 'string' ||
    canonicalSharedUrl(value.ref) !== canonicalSharedUrl(ref) ||
    !isObject(value.result)
  )
    throw new Error(
      'Use wholeloop/shared-read@1 with the exact provider/kind/ref and normalized result',
    )
  const result = value.result
  if (
    !['succeeded', 'pending'].includes(String(result.status)) ||
    typeof result.ref !== 'string' ||
    (result.body !== undefined && typeof result.body !== 'string') ||
    (result.revision !== undefined && typeof result.revision !== 'string') ||
    (result.complete !== undefined && typeof result.complete !== 'boolean')
  )
    throw new Error('Invalid shared-read result; contents omitted')
  return result as unknown as OperationResult
}
