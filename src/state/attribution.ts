import { isObject } from '../config/schema.js'

export interface ClientIdentity {
  client: string
  version?: string
  model?: string
  source: 'declared' | 'host-observed'
}
export type StateActor =
  | { kind: 'person'; name: string; channel?: string }
  | { kind: 'agent'; name: string; client?: ClientIdentity }
  | { kind: 'system'; name: string }
export type OperatorActor =
  | { kind: 'operator'; name: string; channel?: string }
  | { kind: 'controller'; name: string }
export interface EventMetadata {
  actor?: StateActor
  rationale?: string
}

export const RATIONALE_BYTES = 4096
const token = (value: unknown) => typeof value === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value)
const keys = (value: Record<string, unknown>, allowed: string[]) =>
  Object.keys(value).every((key) => allowed.includes(key))
// biome-ignore lint/suspicious/noControlCharactersInRegex: Client identity text refuses all C0 controls and DEL.
const INLINE_CONTROL = /[\x00-\x1f\x7f]/
// biome-ignore lint/suspicious/noControlCharactersInRegex: Rationale text allows tab/newlines but refuses the remaining C0 controls and DEL.
const MULTILINE_CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/

function bounded(value: unknown, bytes: number, multiline = false): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    Buffer.byteLength(value, 'utf8') <= bytes &&
    value.isWellFormed() &&
    !(multiline ? MULTILINE_CONTROL : INLINE_CONTROL).test(value)
  )
}

/** Attribution is descriptive, never an approval or an authenticated identity. */
export function validActor(value: unknown, scope: 'state' | 'delivery'): boolean {
  if (!isObject(value) || typeof value.name !== 'string' || !value.name.trim()) return false
  const person = scope === 'state' ? 'person' : 'operator'
  if (value.kind === person)
    return (
      keys(value, ['kind', 'name', 'channel']) &&
      (value.channel === undefined || token(value.channel))
    )
  if (scope === 'state' && value.kind === 'agent') {
    if (!keys(value, ['kind', 'name', 'client'])) return false
    const client = value.client
    return (
      client === undefined ||
      (isObject(client) &&
        keys(client, ['client', 'version', 'model', 'source']) &&
        token(client.client) &&
        typeof client.source === 'string' &&
        ['declared', 'host-observed'].includes(client.source) &&
        (client.version === undefined || bounded(client.version, 128)) &&
        (client.model === undefined || bounded(client.model, 256)))
    )
  }
  return (
    value.kind === (scope === 'state' ? 'system' : 'controller') && keys(value, ['kind', 'name'])
  )
}

/** A worker's supplied text cannot become a person's private decision reason. */
export function validRationale(
  actor: { kind: string },
  rationale: unknown,
  decision: boolean,
  delegated = false,
): boolean {
  return (
    rationale === undefined ||
    (decision &&
      bounded(rationale, RATIONALE_BYTES, true) &&
      (['person', 'operator'].includes(actor.kind) || (actor.kind === 'controller' && delegated)))
  )
}

export function stateDecision(type: string) {
  return (
    type === 'decision.recorded' ||
    type.endsWith('.decided') ||
    ['build.agreed', 'pr.tested', 'launch.approved'].includes(type)
  )
}

export function deliveryDecision(payload: { schema: string; [key: string]: unknown }) {
  const delegated =
    payload.schema === 'wholeloop/delivery-runner-event@1' &&
    payload.action === 'observed' &&
    typeof payload.stage === 'string' &&
    (['plan', 'acceptance'].includes(payload.stage) || /^build-plan:.+$/.test(payload.stage))
  return {
    decision: payload.schema === 'wholeloop/delivery-control-event@1' || delegated,
    delegated,
  }
}
