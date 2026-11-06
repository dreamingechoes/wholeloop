import { createHash } from 'node:crypto'

type EnvironmentEntry = [string, string | undefined]
const MAX_FIELDS = 512,
  MAX_UNITS = 64 * 1024
let previous: { values: Map<string, string | undefined>; digest: string } | undefined

function fingerprint(entries: EnvironmentEntry[]): string {
  entries.sort(([a], [b]) => a.localeCompare(b))
  const digest = createHash('sha256').update(JSON.stringify(entries)).digest('hex')
  let units = 0,
    eligible = entries.length <= MAX_FIELDS
  if (eligible)
    for (const [key, value] of entries) {
      if (value !== undefined && typeof value !== 'string') {
        eligible = false
        break
      }
      units += key.length + (value?.length ?? 0)
      if (units > MAX_UNITS) {
        eligible = false
        break
      }
    }
  // Bound retained fingerprint data, never reject or truncate a larger environment.
  previous = eligible ? { values: new Map(entries), digest } : undefined
  return digest
}

/** Compare every current key/value; object identity never proves an unchanged environment.
 * Keep all variables: executable lookup, config and credentials can depend on the full environment. */
export function gitEnvironmentIdentity(): string {
  const environment = process.env,
    prior = previous
  if (!prior) return fingerprint(Object.entries(environment))
  const keys = Object.keys(environment)
  if (keys.length !== prior.values.size)
    return fingerprint(keys.map((key) => [key, environment[key]]))
  let matched = 0
  for (const key of keys) {
    const value = environment[key],
      before = prior.values.get(key)
    if (before === value && (value !== undefined || prior.values.has(key))) {
      matched++
      continue
    }
    // The matched prefix was already read in this call. Reuse only those verified
    // values so a changed environment still reads each current value exactly once.
    return fingerprint(
      keys.map((name, index) => [
        name,
        index < matched ? prior.values.get(name) : index === matched ? value : environment[name],
      ]),
    )
  }
  return prior.digest
}
