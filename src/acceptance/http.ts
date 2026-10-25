import type { BehaviorRequestObservation } from './assertions.js'
import { BEHAVIOR_RESPONSE_HEADERS, type BehaviorStep, ownedRequestUrl } from './behavior-input.js'
import { AcceptanceError } from './contracts.js'

/** Read the whole bounded response. A status line or a partial JSON prefix is not an observation. */
export async function observeHttp(
  origin: string,
  step: BehaviorStep,
  signal: AbortSignal,
  limit: number,
): Promise<BehaviorRequestObservation> {
  const url = ownedRequestUrl(origin, step.path ?? '')
  const response = await fetch(url, {
    method: step.method ?? 'GET',
    headers: { ...step.headers, 'accept-encoding': 'identity' },
    ...(step.body !== undefined ? { body: step.body } : {}),
    redirect: 'manual',
    signal,
  })
  try {
    if (response.url !== url || response.redirected)
      throw new AcceptanceError('wrong-response-origin')
    const location = response.headers.get('location')
    if (location && new URL(location, url).origin !== origin)
      throw new AcceptanceError('foreign-response-location')
    if (![null, 'identity'].includes(response.headers.get('content-encoding')))
      throw new AcceptanceError('encoded-response-unavailable')
    const chunks: Uint8Array[] = []
    let bytes = 0
    if (response.body) {
      const reader = response.body.getReader()
      try {
        for (;;) {
          const part = await reader.read()
          if (part.done) break
          bytes += part.value.length
          if (bytes > limit) throw new AcceptanceError('response-byte-limit')
          chunks.push(part.value)
        }
      } finally {
        await reader.cancel().catch(() => {})
        reader.releaseLock()
      }
    }
    const length = response.headers.get('content-length')
    if (
      step.method !== 'HEAD' &&
      ![204, 304].includes(response.status) &&
      length !== null &&
      (!/^\d+$/.test(length) || Number(length) !== bytes)
    )
      throw new AcceptanceError('incomplete-response')
    const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))
    const headers: Record<string, string> = {}
    // Cookies and authentication material have no place in a portable acceptance receipt.
    for (const name of BEHAVIOR_RESPONSE_HEADERS) {
      const value = response.headers.get(name)
      if (value !== null) headers[name] = value
    }
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      return { id: step.id, status: response.status, headers, text, jsonError: true }
    }
    return { id: step.id, status: response.status, headers, text, json }
  } finally {
    await response.body?.cancel().catch(() => {})
  }
}
