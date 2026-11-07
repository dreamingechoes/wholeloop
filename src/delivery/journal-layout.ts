// The segmented layout of the delivery journal and its verification.
import { DeliveryJournalError } from './journal-error.js'

export const JOURNAL_FILE_BYTES = 8 * 1024 * 1024
export const JOURNAL_FILE_EVENTS = 1000
export interface JournalFile {
  name: string
  first: number
  last?: number
  digest?: string
  witnesses?: JournalFile[]
}
export function journalFile(name: string): JournalFile | undefined {
  const match = /^(\d{16})(?:-(\d{16})-([a-f0-9]{64}))?\.ndjson$/.exec(name)
  if (!match) {
    if (name.endsWith('.ndjson')) throw new DeliveryJournalError('unknown-journal-segment')
    return undefined
  }
  const first = Number(match[1]),
    last = match[2] === undefined ? undefined : Number(match[2])
  if (
    !Number.isSafeInteger(first) ||
    first < 1 ||
    (last !== undefined &&
      (!Number.isSafeInteger(last) || last < first || last - first + 1 > JOURNAL_FILE_EVENTS))
  )
    throw new DeliveryJournalError('segment-sequence')
  return { name, first, ...(last === undefined ? {} : { last, digest: match[3] }) }
}

/** A published outer range replaces its retained immutable input files atomically. */
export function journalLayout(names: readonly string[]): JournalFile[] {
  const files: JournalFile[] = []
  for (const name of names) {
    const file = journalFile(name)
    if (file) files.push(file)
  }
  files.sort(
    (a, b) =>
      a.first - b.first ||
      (b.last ?? b.first) - (a.last ?? a.first) ||
      Number(b.digest !== undefined) - Number(a.digest !== undefined) ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  )
  const selected: JournalFile[] = []
  for (const file of files) {
    const previous = selected.at(-1)
    if (previous?.last !== undefined && file.first <= previous.last) {
      // A legacy basename declares no tail or digest. Its complete current body
      // remains authoritative; no new range may silently retire that evidence.
      if (file.last === undefined) throw new DeliveryJournalError('legacy-journal-range-overlap')
      if ((file.last ?? file.first) > previous.last)
        throw new DeliveryJournalError('overlapping-journal-segments')
      previous.witnesses ??= []
      previous.witnesses.push(file)
      continue
    }
    if (previous?.first === file.first)
      throw new DeliveryJournalError('overlapping-journal-segments')
    selected.push(file)
  }
  return selected
}

/** Retained names witness prior immutable hash-chain prefixes without reopening their backup bodies. */
export function verifyJournalFile(
  file: JournalFile,
  events: readonly { sequence: number; digest: string }[],
) {
  const first = events[0],
    last = events.at(-1)
  if (
    !first ||
    !last ||
    first.sequence !== file.first ||
    (file.last !== undefined &&
      (last.sequence !== file.last || events.length !== file.last - file.first + 1))
  )
    throw new DeliveryJournalError('segment-sequence')
  if (file.digest !== undefined && last.digest !== file.digest)
    throw new DeliveryJournalError('segment-digest')
  if (!file.witnesses) return
  for (const witness of file.witnesses) {
    const event = witness.last === undefined ? undefined : events[witness.last - file.first]
    if (!event || event.sequence !== witness.last || event.digest !== witness.digest)
      throw new DeliveryJournalError('changed-packed-history')
  }
}
export function journalMembership(files: readonly JournalFile[]) {
  const names: string[] = []
  for (const file of files) {
    names.push(file.name)
    if (file.witnesses) for (const witness of file.witnesses) names.push(witness.name)
  }
  return names
}

export interface JournalExtent {
  first: number
  last: number
  bytes: number
  events: number
  digest: string
  kind: 'legacy' | 'bounded'
}
function validExtent(value: JournalExtent) {
  return (
    Number.isSafeInteger(value.first) &&
    value.first >= 1 &&
    Number.isSafeInteger(value.last) &&
    value.last >= value.first &&
    Number.isSafeInteger(value.bytes) &&
    value.bytes > 0 &&
    value.bytes <= JOURNAL_FILE_BYTES &&
    Number.isSafeInteger(value.events) &&
    value.events >= 1 &&
    value.events <= JOURNAL_FILE_EVENTS &&
    value.last - value.first + 1 === value.events &&
    /^[a-f0-9]{64}$/.test(value.digest) &&
    (value.kind === 'legacy' || value.kind === 'bounded')
  )
}

/** Size classes keep gently decreasing leaf sizes from accumulating one descriptor per commit. */
export function journalWrite(earlier: readonly JournalExtent[], added: JournalExtent) {
  if (!validExtent(added) || added.kind !== 'bounded')
    throw new DeliveryJournalError('invalid-pack-selection')
  let from = earlier.length
  const result = { ...added }
  while (from > 0) {
    const previous = earlier[from - 1]
    if (!previous || !validExtent(previous) || previous.last + 1 !== result.first)
      throw new DeliveryJournalError('invalid-pack-selection')
    if (
      previous.kind === 'legacy' ||
      Math.floor(Math.log2(previous.bytes)) > Math.floor(Math.log2(result.bytes)) ||
      previous.bytes + result.bytes > JOURNAL_FILE_BYTES ||
      previous.events + result.events > JOURNAL_FILE_EVENTS
    )
      break
    result.first = previous.first
    result.bytes += previous.bytes
    result.events += previous.events
    from--
  }
  const first = String(result.first).padStart(16, '0'),
    last = String(result.last).padStart(16, '0')
  return {
    ...result,
    from,
    name: `${first}-${last}-${result.digest}.ndjson`,
  }
}
