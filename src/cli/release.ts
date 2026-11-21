// `wl release`: preflight, notes and native delivery artifacts.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bundledCanonical } from '../adapters/canonical.js'
import { generateDistribution } from '../adapters/distribution.js'
import { writeOwnedArtifacts } from '../adapters/owned-output.js'
import { readRegularText } from '../fs/regular-file.js'
import { releaseHistory, releaseSource } from '../release/history.js'
import { isReleaseVersion, releaseNotes } from '../release/notes.js'
import { releasePreflight } from '../release/preflight.js'
import { VERSION } from '../version.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'
import { emitCommand } from './presentation.js'

export function releasePreflightCommand(
  { positional, options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
) {
  if (
    positional.length ||
    typeof options['--version'] !== 'string' ||
    typeof options['--context'] !== 'string'
  )
    throw new CliError('Use release preflight --version <version> --context <CI metadata JSON>')
  const read = (file: string, limit: number) => {
    try {
      const text = readRegularText(resolve(root, file), limit)
      if (text === undefined) throw new Error()
      return JSON.parse(text) as unknown
    } catch {
      throw new CliError(
        'Provide regular bounded release metadata JSON files; contents omitted',
        EXIT.precondition,
      )
    }
  }
  let source: ReturnType<typeof releaseSource>
  try {
    source = releaseSource(root)
  } catch {
    throw new CliError(
      'Cannot read bounded local release source; diagnostics omitted',
      EXIT.precondition,
    )
  }
  let result: ReturnType<typeof releasePreflight>
  try {
    result = releasePreflight({
      version: options['--version'],
      builtVersion: VERSION,
      package: read('package.json', 65536),
      lock: read('package-lock.json', 8 * 1024 * 1024),
      context: read(options['--context'], 65536),
      source,
    })
  } catch (error) {
    if (error instanceof CliError) throw error
    throw new CliError(error instanceof Error ? error.message : 'Invalid release metadata')
  }
  emitCommand('release preflight', result, io, json)
  return result.status === 'ready' ? EXIT.ok : EXIT.precondition
}

export function releaseNotesCommand(
  { positional, options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
) {
  const from = options['--from'],
    to = options['--to'],
    version = options['--version']
  if (
    positional.length ||
    (typeof from === 'string') === (options['--initial'] === true) ||
    (json && options['--markdown'] === true)
  )
    throw new CliError(
      'Use release notes (--from <ref> | --initial) [--to <ref>] [--version <version>] [--markdown | --json]',
    )
  try {
    const history = releaseHistory(
      root,
      typeof from === 'string' ? from : undefined,
      typeof to === 'string' ? to : 'HEAD',
    )
    // A version tag as the start of the range names the previous release, so the
    // version change can be checked against the range's impact (P7-07).
    const previous =
      typeof from === 'string' && /^v/.test(from) && isReleaseVersion(from.slice(1))
        ? from.slice(1)
        : undefined
    const notes = releaseNotes(
      history.commits,
      typeof version === 'string' ? version : VERSION,
      previous ? { previous } : {},
    )
    io.out(
      options['--markdown'] === true || !json
        ? notes.markdown
        : JSON.stringify(
            { ...notes, from: history.from, to: history.to },
            null,
            json ? undefined : 2,
          ),
    )
    if (notes.rejected.length) return EXIT.shape
    return notes.bump?.allowed === false ? EXIT.precondition : EXIT.ok
  } catch (error) {
    throw new CliError(
      error instanceof Error ? error.message : 'Release note generation failed',
      EXIT.precondition,
    )
  }
}

export function releaseArtifacts(
  { positional, options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
) {
  const output = options['--out']
  if (positional.length || typeof output !== 'string')
    throw new CliError('Use release artifacts --out <directory> [--dry-run]')
  try {
    const generated = generateDistribution(
      bundledCanonical(),
      readFileSync(fileURLToPath(import.meta.url), 'utf8'),
      VERSION,
    )
    const result = writeOwnedArtifacts(
      resolve(root, output),
      generated,
      options['--dry-run'] === true,
    )
    emitCommand(
      'release artifacts',
      { schema: 'wholeloop/distribution-build@1', ...result, manifest: generated.manifest },
      io,
      json,
    )
    return EXIT.ok
  } catch (error) {
    throw new CliError(
      error instanceof Error ? error.message : 'Distribution generation failed',
      EXIT.precondition,
    )
  }
}
