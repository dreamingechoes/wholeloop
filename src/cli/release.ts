import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bundledCanonical } from '../adapters/canonical.js'
import { generateDistribution } from '../adapters/distribution.js'
import { writeOwnedArtifacts } from '../adapters/owned-output.js'
import { VERSION } from '../version.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'

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
    io.out(
      JSON.stringify(
        { schema: 'wholeloop/distribution-build@1', ...result, manifest: generated.manifest },
        null,
        json ? undefined : 2,
      ),
    )
    return EXIT.ok
  } catch (error) {
    throw new CliError(
      error instanceof Error ? error.message : 'Distribution generation failed',
      EXIT.precondition,
    )
  }
}
