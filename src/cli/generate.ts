// `wl build --target` and `wl adapter build-native`: generate a client's artifacts from the canonical harness.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bundledCanonical } from '../adapters/canonical.js'
import { generateAdapter } from '../adapters/generate.js'
import { openCodeMajor } from '../adapters/opencode-version.js'
import { writeAdapter } from '../adapters/write.js'
import { VERSION } from '../version.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'

export function generateCommand(
  { positional, options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
  native = false,
) {
  try {
    const target = options['--target']
    const output = options['--out']
    const pin = options['--pin']
    if (native) {
      if (target !== 'opencode' || typeof pin !== 'string')
        throw new Error(
          'Use adapter build-native --target opencode --pin <exact-version> --out <directory>',
        )
      openCodeMajor(pin)
    }
    if (positional.length || typeof target !== 'string' || typeof output !== 'string')
      throw new Error(
        'Use build --target claude|codex|opencode|copilot|gemini|antigravity|cursor --out <directory>',
      )
    const generated = generateAdapter(
      target,
      bundledCanonical(),
      readFileSync(fileURLToPath(import.meta.url), 'utf8'),
      VERSION,
      native && typeof pin === 'string' ? pin : undefined,
    )
    const result = writeAdapter(resolve(root, output), generated, options['--dry-run'] === true)
    io.out(
      JSON.stringify(
        { schema: 'wholeloop/adapter-build@1', ...result, manifest: generated.manifest },
        null,
        json ? undefined : 2,
      ),
    )
    return EXIT.ok
  } catch (error) {
    throw new CliError(
      error instanceof Error ? error.message : 'Adapter generation failed',
      EXIT.precondition,
    )
  }
}
