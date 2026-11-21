// `wl release verify`: checks a prepared release bundle's bytes against its retained digest.
import { lstatSync, readdirSync, realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readRegularFile } from '../fs/regular-file.js'
import { RELEASE_FILES, releaseDigest, verifyReleaseBundle } from '../release/bundle.js'
import { releaseSource } from '../release/history.js'
import { releasePreflight } from '../release/preflight.js'
import { VERSION } from '../version.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'
import { emitCommand } from './presentation.js'

function boundedFile(path: string, limit: number) {
  const file = readRegularFile(path, limit)
  if (!file) throw new Error()
  return file.bytes
}

export function releaseVerifyCommand(
  { positional, options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
) {
  if (
    positional.length !== 1 ||
    typeof options['--context'] !== 'string' ||
    typeof options['--sha256'] !== 'string' ||
    !/^[a-f0-9]{64}$/.test(options['--sha256'])
  )
    throw new CliError('Use release verify <directory> --context <file> --sha256 <manifest digest>')
  try {
    const directory = resolve(root, positional[0] ?? '')
    if (lstatSync(directory).isSymbolicLink() || !lstatSync(directory).isDirectory())
      throw new Error()
    // Accept system path aliases, but never a linked payload or unknown/nested entry.
    const bundleRoot = realpathSync(directory)
    if (
      JSON.stringify(readdirSync(bundleRoot).sort()) !==
      JSON.stringify(['bundle.json', ...RELEASE_FILES].sort())
    )
      throw new Error()
    const raw = boundedFile(join(bundleRoot, 'bundle.json'), 65536)
    if (releaseDigest(raw) !== options['--sha256']) throw new Error()
    const manifest = JSON.parse(raw.toString('utf8'))
    const files = new Map(
      RELEASE_FILES.map((file) => [file, boundedFile(join(bundleRoot, file), 128 * 1024 * 1024)]),
    )
    // This selected core must be the same executable reviewed in the prepared artifact.
    if (
      releaseDigest(files.get('wl.mjs') ?? new Uint8Array()) !==
      releaseDigest(boundedFile(fileURLToPath(import.meta.url), 128 * 1024 * 1024))
    )
      throw new Error()
    const preflight = releasePreflight({
      version: manifest.version,
      builtVersion: VERSION,
      package: JSON.parse(boundedFile(join(root, 'package.json'), 65536).toString('utf8')),
      lock: JSON.parse(
        boundedFile(join(root, 'package-lock.json'), 8 * 1024 * 1024).toString('utf8'),
      ),
      context: JSON.parse(boundedFile(resolve(root, options['--context']), 65536).toString('utf8')),
      source: releaseSource(root),
    })
    const result = verifyReleaseBundle(manifest, files, preflight)
    emitCommand('release verify', result, io, json)
    return EXIT.ok
  } catch {
    throw new CliError(
      'Release bundle verification failed; require exact source, context, digest and payloads; contents omitted',
      EXIT.precondition,
    )
  }
}
