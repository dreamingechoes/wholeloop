import { lstatSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { adapterFor, artifactDigest } from '../adapters/generate.js'
import { isObject } from '../config/schema.js'
import { canonicalPath } from '../state/paths.js'
import { VERSION } from '../version.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'

/** Resolve from the actual imported core, including when a skill launcher was reached by symlink. */
export function adapterRoot(json: boolean, io: Io) {
  try {
    const executable = fileURLToPath(import.meta.url)
    const root = canonicalPath(join(dirname(executable), '..'))
    const file = join(root, 'wholeloop-artifacts.json')
    const stat = lstatSync(file)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024)
      throw new Error('No regular ownership manifest')
    const value: unknown = JSON.parse(readFileSync(file, 'utf8'))
    if (
      !isObject(value) ||
      value.schema !== 'wholeloop/adapter-artifacts@1' ||
      value.version !== VERSION ||
      typeof value.target !== 'string' ||
      typeof value.source !== 'string' ||
      !/^[a-f0-9]{64}$/.test(value.source) ||
      canonicalPath(executable) !== canonicalPath(join(root, 'bin/wl.mjs')) ||
      !Array.isArray(value.files) ||
      !value.files.some(
        (entry) => isObject(entry) && entry.path === 'bin/wl.mjs' && entry.sha256 === value.core,
      ) ||
      value.core !== artifactDigest(readFileSync(executable, 'utf8'))
    )
      throw new Error('No matching packaged core manifest')
    adapterFor(value.target)
    io.out(
      JSON.stringify(
        {
          schema: 'wholeloop/adapter-root@1',
          root,
          target: value.target,
          version: VERSION,
          source: value.source,
        },
        null,
        json ? undefined : 2,
      ),
    )
    return EXIT.ok
  } catch {
    throw new CliError(
      'Run adapter root through an unchanged packaged skill launcher/core with a matching ownership manifest',
      EXIT.precondition,
    )
  }
}
