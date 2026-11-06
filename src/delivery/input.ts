import { createHash } from 'node:crypto'
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
} from 'node:fs'
import { resolve } from 'node:path'
import { type Schema, validate } from '../config/schema.js'
import { inside } from '../state/paths.js'
import { inReadObservation, observedRead } from '../state/read-observation.js'
import requestSchema from './schemas/source-request-v1.json' with { type: 'json' }

// biome-ignore lint/suspicious/noControlCharactersInRegex: Source metadata deliberately refuses every C0 control and DEL; body fields retain their explicit exemption.
const FORBIDDEN_METADATA_CONTROL = /[\x00-\x1f\x7f]/

export const SOURCE_LIMIT = 1024 * 1024
export const SOURCE_REQUEST_SCHEMA = requestSchema
export type SourceKind = 'inline' | 'file' | 'item' | 'tracker' | 'document'
export interface SourceMapping {
  id: string
  role: 'criterion' | 'context'
  startLine: number
  endLine: number
}
export interface SourceAttachment {
  ref: string
  sha256: string
}
export interface SourceRequest {
  schema: 'wholeloop/delivery-source-request@1'
  kind: SourceKind
  ref: string
  mapping: SourceMapping[]
  body?: string
  provider?: string
  scope?: string
  observation?: SourceObservation
}
export interface SourceObservation {
  schema: 'wholeloop/delivery-source-observation@1'
  provider: string
  scope: string
  status: 'succeeded' | 'pending'
  ref: string
  complete: boolean
  body?: string
  revision?: string
  attachments: SourceAttachment[]
}
export type SourceProblem =
  | 'invalid-input'
  | 'unavailable'
  | 'incomplete-read'
  | 'scope-mismatch'
  | 'oversized'
  | 'unsafe-file'
  | 'credential-bearing'
  | 'ambiguous-mapping'

/** Never attach input bytes, provider errors or local paths to this error. */
export class SourceInputError extends Error {
  constructor(readonly problem: SourceProblem) {
    super(`Delivery source refused: ${problem}; contents omitted`)
  }
}
export function sourceHash(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

/** The config validator deliberately supports less vocabulary than these bounded inputs. */
export function validateSourceShape(value: unknown, schema: Schema): void {
  if (validate(value, schema).length) throw new SourceInputError('invalid-input')
  const bounds = (value: unknown, rule: Schema & { maxLength?: number; maxItems?: number }) => {
    if (typeof value === 'string' && value.length > (rule.maxLength ?? 4096))
      throw new SourceInputError('oversized')
    if (
      typeof value === 'string' &&
      rule.maxLength !== SOURCE_LIMIT &&
      FORBIDDEN_METADATA_CONTROL.test(value)
    )
      throw new SourceInputError('invalid-input')
    if (Array.isArray(value)) {
      if (value.length > (rule.maxItems ?? 1000)) throw new SourceInputError('oversized')
      for (const child of value) if (rule.items) bounds(child, rule.items)
    } else if (value !== null && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        const childRule = rule.properties?.[key]
        if (childRule) bounds(child, childRule)
      }
    }
  }
  bounds(value, schema)
}

/** Reject recognizable credentials before persistence; this is not a secret-free proof. */
export function safeSourceText(text: string, limit = SOURCE_LIMIT): void {
  if (Buffer.byteLength(text) > limit) throw new SourceInputError('oversized')
  // Node >= 20 checks unpaired surrogates directly, without encoding and
  // decoding a disposable buffer. Keep the prior binary-input refusal too.
  if (typeof text !== 'string' || !text.isWellFormed() || text.includes('\0'))
    throw new SourceInputError('invalid-input')
  rejectSourceCredentials(text)
}

/** Binary artifact capture reuses recognizable-text credential refusal without requiring UTF-8 data. */
export function rejectSourceCredentials(text: string): void {
  if (
    /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----|\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9_-]{40,}|AKIA[A-Z0-9]{16})\b|\b[a-z][a-z0-9+.-]*:\/\/[^\s/]+:[^\s/]+@/i.test(
      text,
    ) ||
    /(?:["']?(?:password|secret|api[-_]?key|access[-_]?token|authorization)["']?\s*[:=]\s*["']?)(?:Bearer\s+)?[^\s"'<>]{8,}/i.test(
      text,
    ) ||
    /\bBearer\s+[A-Za-z0-9._~+/-]{16,}/i.test(text)
  )
    throw new SourceInputError('credential-bearing')
}

export function sourceRequest(value: unknown): SourceRequest {
  // Schema errors include rejected values; only the fixed category may escape intake.
  validateSourceShape(value, requestSchema)
  const request = structuredClone(value) as SourceRequest
  safeSourceText(JSON.stringify(request), SOURCE_LIMIT * 8)
  const remote = request.kind === 'tracker' || request.kind === 'document'
  if (
    !request.ref.trim() ||
    request.ref.length > 4096 ||
    (request.kind === 'inline') !== (request.body !== undefined) ||
    remote !== (request.provider !== undefined && request.scope !== undefined) ||
    (!remote &&
      (request.provider !== undefined ||
        request.scope !== undefined ||
        request.observation !== undefined)) ||
    (remote &&
      (!request.provider?.trim() || !request.scope?.trim() || request.scope.length > 4096)) ||
    request.mapping.length > 1000
  )
    throw new SourceInputError('invalid-input')
  return request
}

/** Open the selected descriptor without following a final symlink or blocking on a FIFO. */
export function readSourceFile(root: string, file: string, limit = SOURCE_LIMIT): string {
  try {
    const content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      readSourceBytes(root, file, limit),
    )
    safeSourceText(content, limit)
    return content
  } catch (error) {
    if (error instanceof SourceInputError) throw error
    throw new SourceInputError('unsafe-file')
  }
}

/** Checkpoint binary inputs use the same stable descriptor boundary without decoding/copying them. */
export function readSourceBytes(root: string, file: string, limit = SOURCE_LIMIT): Buffer {
  if (!inReadObservation()) return readPhysicalSourceBytes(root, file, limit)
  if (!Number.isSafeInteger(limit) || limit < 0) throw new SourceInputError('unsafe-file')
  const path = resolve(root),
    selection = resolve(path, file)
  const value = observedRead(
    JSON.stringify(['source', path, selection]),
    () => {
      try {
        const boundary = realpathSync(path),
          selected = realpathSync(resolve(boundary, file)),
          value = readPhysicalSourceBytes(path, file, limit)
        return { bytes: Buffer.concat([Buffer.from(`${boundary}\0${selected}\0`), value]), value }
      } catch (error) {
        if (error instanceof SourceInputError) throw error
        throw new SourceInputError('unsafe-file')
      }
    },
    `filesystem:${selection}`,
  )
  // A smaller caller allowance is still enforced even when another reader
  // already captured this same file with a larger bound.
  if (value.length > limit) throw new SourceInputError('oversized')
  return Buffer.from(value)
}

function readPhysicalSourceBytes(root: string, file: string, limit: number): Buffer {
  let fd: number | undefined
  try {
    if (!Number.isSafeInteger(limit) || limit < 0) throw new SourceInputError('unsafe-file')
    const boundary = realpathSync(root)
    const selected = resolve(boundary, file)
    // An absolute selection may use an OS alias such as /var for /private/var.
    // Judge its real destination while still opening the selected leaf with O_NOFOLLOW.
    if (!inside(boundary, realpathSync(selected))) throw new SourceInputError('unsafe-file')
    fd = openSync(selected, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    const before = fstatSync(fd, { bigint: true })
    if (!before.isFile() || before.size < 0n) throw new SourceInputError('unsafe-file')
    const maximum = BigInt(limit)
    if (before.size > maximum) throw new SourceInputError('oversized')
    // Virtual regular files can advertise zero or incomplete extents. Keep
    // one extra byte and explicit EOF proof instead of trusting their size.
    const bytes = Buffer.alloc(Number(before.size) + 1)
    let length = 0
    while (length < bytes.length) {
      const read = readSync(fd, bytes, length, bytes.length - length, null)
      if (!read) break
      length += read
    }
    if (length > limit) throw new SourceInputError('oversized')
    const after = fstatSync(fd, { bigint: true })
    if (after.size > maximum) throw new SourceInputError('oversized')
    // lstat must not follow a replacement alias to the old descriptor. Exact
    // inode/timestamp integers also keep distinct observations from rounding equal.
    const current = lstatSync(selected, { bigint: true })
    if (
      BigInt(length) !== before.size ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs ||
      !inside(boundary, realpathSync(selected)) ||
      !current.isFile() ||
      current.dev !== after.dev ||
      current.ino !== after.ino ||
      current.size !== after.size ||
      current.mtimeNs !== after.mtimeNs ||
      current.ctimeNs !== after.ctimeNs
    )
      throw new SourceInputError('unsafe-file')
    return bytes.subarray(0, length)
  } catch (error) {
    if (error instanceof SourceInputError) throw error
    throw new SourceInputError('unsafe-file')
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

/** The mapping selects verbatim line ranges; it never guesses requirements from prose. */
export function validateSourceMapping(body: string, mapping: SourceMapping[]): void {
  const lines = body.split('\n')
  const ordered = [...mapping].sort((a, b) => a.startLine - b.startLine)
  const ids = new Set<string>()
  let end = 0
  for (const entry of ordered) {
    if (
      ids.has(entry.id) ||
      entry.startLine <= end ||
      entry.endLine > lines.length ||
      entry.endLine < entry.startLine ||
      !lines
        .slice(entry.startLine - 1, entry.endLine)
        .join('\n')
        .trim()
    )
      throw new SourceInputError('ambiguous-mapping')
    ids.add(entry.id)
    end = entry.endLine
  }
}
