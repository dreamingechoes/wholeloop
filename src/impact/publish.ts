// Dispatches an impact digest as an unsent draft or a document comment, on the conductor's explicit
// request.
import { loadExtensionOptions } from '../config/load.js'
import { isObject } from '../config/schema.js'
import type { FlowEngine } from '../flow/engine.js'
import { measurementDigest } from '../launch/measurement.js'
import { loadProviders, resolveProvider } from '../providers/load.js'
import { safeEvidenceReference } from '../providers/numeric.js'
import { type ProviderHost, performOperation, updateDocument } from '../providers/operations.js'
import type { StateEvent } from '../state/events.js'
import { type DigestTarget, digestRequest, impactDigest } from './digest.js'

export function impactDeliveries(events: readonly StateEvent[]) {
  const entries = new Map<
    string,
    {
      subject: string
      digest: string
      key: string
      target: DigestTarget
      result?: { status: 'succeeded' | 'pending'; ref: string }
    }
  >()
  for (const [index, event] of events.entries()) {
    if (event.type === 'impact.dispatch-planned') {
      const digest = impactDigest(events.slice(0, index), event.data.subjects)
      digestRequest(digest, event.data.target)
      if (
        entries.has(event.data.key) ||
        event.subject !== digest.sources[0]?.subject ||
        digest.id !== event.data.digest ||
        measurementDigest({ digest: digest.id, target: event.data.target }) !== event.data.key
      )
        throw new Error('Digest dispatch needs one exact completed-report and destination intent')
      entries.set(event.data.key, {
        subject: event.subject,
        digest: event.data.digest,
        key: event.data.key,
        target: event.data.target,
      })
    }
    if (event.type === 'impact.dispatch-finished') {
      const entry = entries.get(event.data.key)
      if (!entry || entry.subject !== event.subject || entry.result)
        throw new Error('Digest receipt needs one matching intent')
      entry.result = event.data.result
    }
  }
  return [...entries.values()]
}
/** Explicit conductor-only publication; drafts stay unsent and document comments use same-read RMW. */
export async function dispatchImpactDigest(
  engine: FlowEngine,
  subjects: string[],
  target: DigestTarget,
  host: ProviderHost,
) {
  const digest = impactDigest(engine.store.events(), subjects)
  const request = digestRequest(digest, target)
  if (target.ref && !safeEvidenceReference(target.ref))
    throw new Error('Use a non-secret document reference')
  const key = measurementDigest({ digest: digest.id, target })
  const existing = impactDeliveries(engine.store.events()).find((entry) => entry.key === key)
  if (existing?.result) return { cached: true, result: existing.result }
  if (existing)
    throw new Error('Digest publication is ambiguous; inspect the retained intent before retrying')
  const registry = loadProviders(
    loadExtensionOptions({ root: engine.root, userFile: engine.userFile }),
  )
  if (registry.problems.length)
    throw new Error('Resolve provider registry problems before digest publication')
  const provider = resolveProvider(registry, request.operation, target.provider)
  if (provider.manifest.access.local)
    return { cached: true, result: { status: 'handoff', ref: 'local-digest' } }
  const subject = digest.sources[0]?.subject
  if (!subject) throw new Error('No scope anchors the digest')
  engine.store.transaction((_events, append) =>
    append(subject, {
      type: 'impact.dispatch-planned',
      data: { digest: digest.id, key, subjects, target },
    }),
  )
  try {
    const result =
      target.kind === 'draft'
        ? await performOperation(
            provider,
            'comms.draft',
            {
              body: request.body,
              draft: true,
              send: false,
              marker: request.marker,
            },
            host,
          )
        : (
            await updateDocument(
              provider,
              target.ref ?? '',
              ({ body }) => {
                const marker = `<!-- ${request.marker} -->`
                return body.includes(marker) ? body : `${body}\n\n${marker}\n${request.body}\n`
              },
              host,
            )
          ).result
    if (!safeEvidenceReference(result.ref)) throw new Error('Invalid digest receipt reference')
    if (target.kind === 'draft') {
      const observed: unknown = result.body ? JSON.parse(result.body) : undefined
      if (!isObject(observed) || observed.draft !== true || observed.sent !== false)
        throw new Error('No unsent draft observed')
    }
    const receipt = { status: result.status, ref: result.ref }
    engine.store.transaction((_events, append) =>
      append(subject, { type: 'impact.dispatch-finished', data: { key, result: receipt } }),
    )
    return { cached: false, result: receipt }
  } catch {
    throw new Error('Digest publication is ambiguous; inspect the retained intent before retrying')
  }
}
