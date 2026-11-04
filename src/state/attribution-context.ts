import { AsyncLocalStorage } from 'node:async_hooks'
import {
  type ClientIdentity,
  type EventMetadata,
  stateDecision,
  validActor,
  validRationale,
} from './attribution.js'

interface AttributionContext {
  client?: ClientIdentity
  person?: EventMetadata
}
const context = new AsyncLocalStorage<AttributionContext>()

/** The executing adapter declares its client; this never authenticates a native worker. */
export function withClientAttribution<T>(client: ClientIdentity | undefined, action: () => T): T {
  return context.run(client ? { client: structuredClone(client) } : {}, action)
}

export function currentPersonAttribution() {
  return structuredClone(context.getStore()?.person)
}

export function withPersonAttribution<T>(metadata: EventMetadata, action: () => T): T {
  if (context.getStore()?.client) throw new Error('An agent cannot supply person attribution')
  if (
    Object.keys(metadata).some((key) => !['actor', 'rationale'].includes(key)) ||
    metadata.actor?.kind !== 'person' ||
    !validActor(metadata.actor, 'state') ||
    !validRationale(metadata.actor, metadata.rationale, true)
  )
    throw new Error('Invalid person attribution; contents omitted')
  return context.run({ person: structuredClone(metadata) }, action)
}

/** Apply a reason only to decisions, even when one command appends several other events. */
export function eventAttribution(type: string, explicit: EventMetadata): EventMetadata {
  const scope = context.getStore()
  if (scope?.client) {
    if (explicit.actor || explicit.rationale !== undefined)
      throw new Error('An agent cannot replace its declared attribution')
    return { actor: { kind: 'agent', name: scope.client.client, client: scope.client } }
  }
  const person = scope?.person
  return {
    ...(person?.actor ? { actor: person.actor } : {}),
    ...(person?.rationale !== undefined && stateDecision(type)
      ? { rationale: person.rationale }
      : {}),
    ...explicit,
  }
}
