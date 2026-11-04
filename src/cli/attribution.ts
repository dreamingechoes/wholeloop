import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs'
import { resolve } from 'node:path'
import { RATIONALE_BYTES, validActor, validRationale } from '../state/attribution.js'
import { withPersonAttribution } from '../state/attribution-context.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT } from './io.js'

export const ATTRIBUTED_COMMANDS = new Set([
  'answer',
  'frame finalize',
  'build agree',
  'pr tested',
  'learn decide',
  'ramp decide',
  'delivery human-decide',
  'delivery pause',
  'delivery resume',
  'delivery stop',
])
export const ATTRIBUTION_OPTIONS = [
  '--channel <name>',
  '--rationale-stdin',
  '--rationale-file <path>',
]

/** Read at most the limit plus one byte; neither argv nor error messages carry the reason. */
function privateReason(file: string | undefined, root: string) {
  let fd: number | undefined
  try {
    fd =
      file === undefined
        ? 0
        : openSync(
            resolve(root, file),
            constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
          )
    if (file !== undefined && !fstatSync(fd).isFile()) throw new Error()
    const bytes = Buffer.alloc(RATIONALE_BYTES + 1)
    let size = 0
    while (size < bytes.length) {
      const count = readSync(fd, bytes, size, bytes.length - size, null)
      if (count === 0) break
      size += count
    }
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      bytes.subarray(0, size),
    )
    if (!validRationale({ kind: 'person' }, text, true)) throw new Error()
    return text
  } catch {
    throw new CliError(
      'Provide a nonblank UTF-8 rationale of at most 4096 bytes through stdin or a regular file; contents omitted',
      EXIT.input,
    )
  } finally {
    if (file !== undefined && fd !== undefined) closeSync(fd)
  }
}

export function withCommandAttribution<T>(
  command: string,
  { options, positional }: ReturnType<typeof parseArguments>,
  root: string,
  action: () => T,
): T {
  const channel = options['--channel'],
    stdin = options['--rationale-stdin'],
    file = options['--rationale-file']
  if (channel === undefined && stdin === undefined && file === undefined) return action()
  if (
    !ATTRIBUTED_COMMANDS.has(command) ||
    (command === 'answer' && !positional[0]?.startsWith('decision.')) ||
    (stdin !== undefined && file !== undefined)
  )
    throw new CliError(
      'Attribution requires one person decision and at most one rationale input',
      EXIT.input,
    )
  const actor = {
    kind: 'person' as const,
    name: String(options['--by'] ?? options['--operator'] ?? 'local'),
    ...(channel !== undefined ? { channel: String(channel) } : {}),
  }
  if (!validActor(actor, 'state')) throw new CliError('Provide a valid person channel', EXIT.input)
  // Check the caller before opening a private file or consuming stdin.
  return withPersonAttribution({ actor }, () => {
    const rationale =
      stdin !== undefined || typeof file === 'string'
        ? privateReason(typeof file === 'string' ? file : undefined, root)
        : undefined
    return withPersonAttribution(
      { actor, ...(rationale !== undefined ? { rationale } : {}) },
      action,
    )
  })
}
