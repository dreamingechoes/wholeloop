// Builds and caches the repository capability map that discovery returns.
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { RegularFileError, readRegularFileStrict } from '../fs/regular-file.js'
import type { StoreFiles } from '../state/files.js'
import { canonicalPath, inside } from '../state/paths.js'
import { inReadObservation, observedRead } from '../state/read-observation.js'
import { guidanceClient, personalFolders } from './clients.js'
import { fileKind, isGeneratedDistribution, scan } from './scan.js'
import type { CapabilityMap } from './types.js'

const IGNORE = new Set([
  '.git',
  'node_modules',
  'vendor',
  '.venv',
  'venv',
  'dist',
  'build',
  'target',
  'coverage',
  '.next',
  '.cache',
  '.tmp',
  '.tox',
  '.yarn',
])

export function readInventory(
  root: string,
  starts: readonly string[] = ['.'],
  options: { personal?: boolean; seen?: Set<string> } = {},
): { files: Map<string, string>; warnings: string[] } {
  const files = new Map<string, string>()
  const warnings: string[] = []
  const seen = options.seen ?? new Set<string>()
  const boundary = canonicalPath(root)
  function walk(directory: string): void {
    if (isGeneratedDistribution(relative(root, directory).split(sep).join('/'))) return
    if (!existsSync(directory)) return
    const actual = realpathSync(directory)
    if (isGeneratedDistribution(relative(boundary, actual).split(sep).join('/'))) return
    if (!inside(boundary, actual)) {
      warnings.push(`Skipped external symlink: ${relative(root, directory)}`)
      return
    }
    if (seen.has(actual)) return
    seen.add(actual)
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (IGNORE.has(entry.name)) continue
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        walk(path)
        continue
      }
      if (entry.isSymbolicLink()) {
        if (!existsSync(path)) {
          warnings.push(`Skipped broken symlink: ${relative(root, path)}`)
          continue
        }
        if (!inside(boundary, realpathSync(path))) {
          warnings.push(`Skipped external symlink: ${relative(root, path)}`)
          continue
        }
        if (statSync(path).isDirectory()) {
          walk(path)
          continue
        }
      }
      const name = relative(root, path).split(sep).join('/')
      if (options.personal ? entry.name !== 'SKILL.md' : !fileKind(name)) continue
      // Links inside the boundary were followed above and still are; type and size come from
      // the descriptor that is read, so a file swapped after the walk cannot slip through.
      try {
        files.set(
          name,
          readRegularFileStrict(path, 1024 * 1024, { follow: true }).bytes.toString('utf8'),
        )
      } catch (error) {
        if (!(error instanceof RegularFileError)) throw error
        if (error.reason === 'too-large') warnings.push(`Skipped file larger than 1 MiB: ${name}`)
        else if (error.reason === 'unreadable') throw error
      }
    }
  }
  for (const start of starts) walk(join(root, start))
  return { files, warnings }
}

const hash = (value: string) => createHash('sha256').update(value).digest('hex')

function discoveryInput(
  root: string,
  home: string,
  client: string | undefined,
  includeOtherClients: boolean,
  env: NodeJS.ProcessEnv,
) {
  const repo = readInventory(root)
  const selection = personalFolders(home, client, includeOtherClients, env)
  const user = { files: new Map<string, string>(), warnings: [] as string[] }
  const personalSeen = new Set<string>()
  for (const folder of selection.starts) {
    const inventory = readInventory(folder, ['.'], { personal: true, seen: personalSeen })
    for (const [path, content] of inventory.files)
      user.files.set(join(folder, path).split(sep).join('/'), content)
    user.warnings.push(...inventory.warnings)
  }
  const bytes = Buffer.from(
    JSON.stringify({
      // Client-scoped, content-aware rules must invalidate inventories produced by the old matcher.
      v: 3,
      client: client ?? null,
      selection,
      repo: [...repo.files],
      user: [...user.files],
      warnings: [...repo.warnings, ...user.warnings],
    }),
  )
  return { repo, user, selection, bytes, fingerprint: hash(bytes.toString()) }
}

function scanInventory(input: ReturnType<typeof discoveryInput>) {
  const user = scan(input.user.files, { personal: true })
  for (const asset of user.assets)
    asset.access = input.selection.current.some((folder) =>
      asset.path.startsWith(`${folder.split(sep).join('/')}/`),
    )
      ? 'current-client'
      : 'configured-for-another-client'
  return {
    repo: scan(input.repo.files),
    otherClients: input.selection.otherClients,
    user,
    fingerprint: input.fingerprint,
    cached: false,
    warnings: [...input.repo.warnings, ...input.user.warnings],
  }
}

export function discover(
  root: string,
  store: StoreFiles,
  home = homedir(),
  options: {
    persist?: boolean
    client?: string
    includeOtherClients?: boolean
    env?: NodeJS.ProcessEnv
  } = {},
) {
  const client = options.client ?? guidanceClient()
  const includeOtherClients = options.includeOtherClients === true
  const env = options.env ?? (home === homedir() ? process.env : {})
  const configuration = JSON.stringify([
    env.CODEX_HOME,
    env.CLAUDE_CONFIG_DIR,
    env.OPENCODE_CONFIG_DIR,
    env.XDG_CONFIG_HOME,
    env.COPILOT_HOME,
    env.GEMINI_CLI_HOME,
  ])
  const identity = `${configuration}\n${canonicalPath(root)}\n${canonicalPath(home)}\n${client ?? ''}\n${includeOtherClients}`
  if (inReadObservation())
    return structuredClone(
      observedRead(`discovery:${identity}`, () => {
        const input = discoveryInput(root, home, client, includeOtherClients, env)
        return { bytes: input.bytes, value: scanInventory(input) }
      }),
    )
  const input = discoveryInput(root, home, client, includeOtherClients, env),
    { repo, user, fingerprint } = input
  const file = `cache/discovery/${hash(identity)}.json`
  const readCached = () => {
    const content = store.read(file)
    if (content) {
      try {
        const cached = JSON.parse(content) as {
          fingerprint: string
          repo: CapabilityMap
          user: CapabilityMap
          checksum: string
        }
        if (
          cached.fingerprint === fingerprint &&
          cached.checksum === hash(JSON.stringify([cached.repo, cached.user]))
        ) {
          return {
            repo: cached.repo,
            user: cached.user,
            fingerprint,
            cached: true,
            otherClients: input.selection.otherClients,
            warnings: [...repo.warnings, ...user.warnings],
          }
        }
      } catch {
        /* A cache is disposable; never treat it as source of truth. */
      }
    }
    return undefined
  }
  const cached = readCached()
  if (cached) return cached
  const result = scanInventory(input)
  if (options.persist === false) return result
  return store.locked(() => {
    // Another writer may have populated the disposable cache while this
    // inventory was scanned. A cache hit never needs a writer lock itself.
    const current = readCached()
    if (current) return current
    const repoMap = result.repo,
      userMap = result.user
    store.atomic(
      file,
      `${JSON.stringify({ fingerprint, repo: repoMap, user: userMap, checksum: hash(JSON.stringify([repoMap, userMap])) })}\n`,
    )
    return {
      repo: repoMap,
      user: userMap,
      fingerprint,
      cached: false,
      otherClients: input.selection.otherClients,
      warnings: [...repo.warnings, ...user.warnings],
    }
  })
}
