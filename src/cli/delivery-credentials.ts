// `wl delivery credential-store|credential-check`: the operator's worker credentials in the
// operating system's secret store (ADR-0209). Values travel only through stdin; output never holds one.
import { readSync } from 'node:fs'
import {
  type NativeCredentialReference,
  resolveNativeCredential,
  type SecretStoreRunner,
  spawnSecretStore,
  storeNativeCredential,
  validNativeCredentialReference,
} from '../delivery/native-credentials.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'
import { emitCommand } from './presentation.js'

const LIMIT = 4097

/** Reads at most 4 KiB of the value from stdin; one trailing newline is not part of it. */
function stdinValue(read: (buffer: Buffer, offset: number) => number) {
  const bytes = Buffer.alloc(LIMIT)
  let size = 0
  while (size < bytes.length) {
    const count = read(bytes, size)
    if (count === 0) break
    size += count
  }
  if (size >= LIMIT)
    throw new CliError('The credential exceeds 4096 bytes; contents omitted', EXIT.input)
  return bytes
    .subarray(0, size)
    .toString('utf8')
    .replace(/\r?\n$/, '')
}

export async function deliveryCredentialCommand(
  command: string,
  { positional, options }: ReturnType<typeof parseArguments>,
  json: boolean,
  io: Io,
  dependencies: {
    run?: SecretStoreRunner
    platform?: NodeJS.Platform
    exists?: (path: string) => boolean
    read?: (buffer: Buffer, offset: number) => number
  } = {},
) {
  const target = options['--target'],
    reference = {
      store:
        options['--store'] ?? (process.platform === 'darwin' ? 'macos-keychain' : 'secret-service'),
      item: options['--item'],
      kind: options['--kind'],
    }
  if (
    positional.length ||
    typeof target !== 'string' ||
    !validNativeCredentialReference(reference, target)
  )
    throw new CliError(
      `Use ${command} --target <claude|codex> --kind <api-key|oauth-token> --item <name> [--store <macos-keychain|secret-service>]`,
      EXIT.input,
    )
  const credential: NativeCredentialReference = reference,
    run = dependencies.run ?? spawnSecretStore,
    platform = dependencies.platform ?? process.platform
  const out = (body: Record<string, unknown>) =>
    emitCommand(command, { ...body, reference: credential }, io, json)
  if (command === 'delivery credential-store') {
    const value = stdinValue(
      dependencies.read ??
        ((buffer, offset) => readSync(0, buffer, offset, buffer.length - offset, null)),
    )
    const stored = await storeNativeCredential(
      credential,
      target,
      value,
      run,
      platform,
      dependencies.exists,
    )
    if (!stored.stored)
      throw new CliError(
        stored.reason === 'credential-invalid'
          ? 'Provide one token of 8 to 4096 characters (letters, digits and ._~+/=-) on stdin; contents omitted'
          : `The credential was not stored: ${stored.reason}`,
        stored.reason === 'credential-invalid' ? EXIT.input : EXIT.precondition,
      )
    out({ schema: 'wholeloop/delivery-credential@1', stored: true })
    return EXIT.ok
  }
  // A check proves the item resolves; it never prints, hashes or measures the value.
  const resolved = await resolveNativeCredential(
    credential,
    target,
    run,
    platform,
    dependencies.exists,
  )
  out({
    schema: 'wholeloop/delivery-credential@1',
    resolved: resolved.resolved,
    ...(resolved.resolved ? { variable: resolved.variable } : { reason: resolved.reason }),
  })
  return resolved.resolved ? EXIT.ok : EXIT.precondition
}
