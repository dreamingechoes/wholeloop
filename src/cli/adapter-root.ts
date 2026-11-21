// Finds the packaged adapter and client root from the core actually imported, even through a
// symlinked launcher.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bundledCanonical } from '../adapters/canonical.js'
import { adapterFor, artifactDigest } from '../adapters/generate.js'
import { canonicalRoles, roleInvocationName } from '../adapters/roles.js'
import { isObject } from '../config/schema.js'
import { readRegularText } from '../fs/regular-file.js'
import { canonicalPath } from '../state/paths.js'
import { VERSION } from '../version.js'
import type { AdapterContext } from './adapter-context.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'

/** Resolve from the actual imported core, including when a skill launcher was reached by symlink. */
export function adapterRoot(json: boolean, io: Io) {
  try {
    const { root, value } = packagedAdapter(fileURLToPath(import.meta.url))
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

/** An owned manifest declares a client; it provides no authenticated worker evidence. */
export function packagedAdapter(executable: string) {
  const root = canonicalPath(join(dirname(executable), '..'))
  const file = join(root, 'wholeloop-artifacts.json')
  const manifest = readRegularText(file, 1024 * 1024)
  if (manifest === undefined) throw new Error('No regular ownership manifest')
  const value: unknown = JSON.parse(manifest)
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
  return { root, value }
}

export function packagedClient(executable: string) {
  try {
    const { value } = packagedAdapter(executable)
    return { client: value.target as string, source: 'declared' as const }
  } catch {
    return undefined
  }
}

/** Package declarations locate resources and roles; they never prove native worker execution. */
export function packagedContext(
  executable: string,
  entrypoint = executable,
): AdapterContext | undefined {
  try {
    const { root, value } = packagedAdapter(executable)
    const adapter = adapterFor(String(value.target))
    const overlay =
      adapter.id === 'claude' && canonicalPath(entrypoint) !== join(root, 'bin/wl.mjs')
    // Malformed role declarations expose no roles, but never erase the checked client's identity.
    const agents =
      Array.isArray(value.agents) && value.agents.every((name) => typeof name === 'string')
        ? value.agents
        : []
    return {
      root,
      target: adapter.id,
      version: VERSION,
      source: String(value.source),
      roles: Object.fromEntries(
        canonicalRoles(bundledCanonical())
          .filter((role) => agents.includes(adapter.name('agent', role)))
          .map((role) => [
            role,
            roleInvocationName(adapter.id, role, adapter.name('agent', role), overlay),
          ]),
      ),
    }
  } catch {
    return undefined
  }
}
