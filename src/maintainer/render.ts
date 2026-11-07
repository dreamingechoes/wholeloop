import { createHash } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, posix, relative, sep } from 'node:path'
import { ADAPTERS } from '../adapters/generate.js'
import { checkBudgets } from '../harness/budgets.js'
import { checkFrontmatter } from '../harness/frontmatter.js'
import { installLocations } from '../installation/plan.js'
import { canonicalPath } from '../state/paths.js'

/**
 * The repository's own maintainer skills and agents (ADR-0246).
 *
 * They are authored once under maintainer/ in the canonical harness format
 * and rendered into every supported client's project directories, where they
 * are committed so a contributor gets them without running wl. Nothing here
 * is reachable from the CLI entry point, so the bundler never ships it.
 */
export const SOURCE = 'maintainer'
export const MANIFEST = 'maintainer/rendered.json'

const NOTICE = 'Generated from maintainer/ by npm run maintainer:render; edit the source instead.'
const digest = (content: string) => createHash('sha256').update(content).digest('hex')
const posixPath = (path: string) => path.split(sep).join('/')

/** Source files keyed by repository-relative path; only skills and agents are sources. */
export function readSources(root: string): Map<string, string> {
  const files = new Map<string, string>()
  const walk = (directory: string) => {
    if (!existsSync(directory)) return
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.isFile())
        files.set(posixPath(relative(root, path)), readFileSync(path, 'utf8'))
    }
  }
  walk(join(root, SOURCE, 'skills'))
  walk(join(root, SOURCE, 'agents'))
  return files
}

/** The harness budgets and front-matter rules apply unchanged to maintainer tools. */
export function sourceProblems(sources: ReadonlyMap<string, string>): string[] {
  const asHarness = new Map(
    [...sources].map(([path, content]) => [path.replace(/^maintainer\//, 'harness/'), content]),
  )
  const tree = { files: asHarness, read: (path: string) => asHarness.get(path) }
  const problems = [...checkBudgets(tree), ...checkFrontmatter(tree)].map(
    (finding) => `${finding.file.replace(/^harness\//, 'maintainer/')}: ${finding.message}`,
  )
  for (const path of sources.keys())
    if (
      !/^maintainer\/skills\/[a-z0-9-]+\/[^/]+$/.test(path) &&
      !/^maintainer\/agents\/[a-z0-9-]+\.md$/.test(path)
    )
      problems.push(`${path}: maintainer sources are skills/<name>/... or agents/<name>.md`)
  return problems
}

const marked = (path: string, content: string) => {
  if (path.endsWith('.toml')) return `# ${NOTICE}\n${content}`
  if (!path.endsWith('.md')) return content
  // After the front matter, so every client still parses its header first.
  const match = /^---\n[\s\S]*?\n---\n/.exec(content)
  const head = match?.[0] ?? ''
  return `${head}<!-- ${NOTICE} -->\n${content.slice(head.length)}`
}

export interface Rendered {
  files: Map<string, string>
  manifest: string
}

/**
 * Every rendered file, keyed by repository-relative path. Skills are copied as
 * written: the Agent Skills format is the same for every supported client.
 * Agents go through each client's adapter without the wholeloop runtime, so
 * their tool and read-only mapping is the shipped harness's own.
 */
export function renderMaintainer(root: string, sources: ReadonlyMap<string, string>): Rendered {
  const files = new Map<string, string>()
  const targets: Record<string, { readOnly: string; skills: string; agents: string }> = {}
  const place = (path: string, content: string) => {
    const existing = files.get(path)
    // Clients that share a directory (Codex and Antigravity) must agree on its bytes.
    if (existing !== undefined && existing !== content)
      throw new Error(`Two clients render different bytes at ${path}`)
    files.set(path, content)
  }
  // installLocations canonicalizes its root (on macOS /var is /private/var).
  const base = canonicalPath(root)
  for (const adapter of ADAPTERS) {
    const locations = installLocations(adapter.id, {
      scope: 'project',
      root,
      home: root,
      store: root,
      env: {},
    })
    const skills = posixPath(relative(base, locations.skills)),
      agents = posixPath(relative(base, locations.agents))
    targets[adapter.id] = { readOnly: adapter.capabilities().readOnly, skills, agents }
    for (const [path, content] of sources) {
      const skill = /^maintainer\/skills\/([^/]+)\/(.+)$/.exec(path)
      const agent = /^maintainer\/agents\/([^/]+)\.md$/.exec(path)
      if (skill?.[1] && skill[2]) {
        const target = posix.join(skills, skill[1], skill[2])
        place(target, marked(target, content))
      } else if (agent?.[1]) {
        const name = agent[1]
        const native = posix.basename(adapter.paths('agent', name))
        const file = native.replace(adapter.name('agent', name), name)
        const target = posix.join(agents, file)
        place(
          target,
          marked(target, adapter.renderAgent(name, content, { runtime: false }).content),
        )
      }
    }
  }
  const manifest = `${JSON.stringify(
    {
      schema: 'wholeloop/maintainer-rendered@1',
      notice: NOTICE,
      targets,
      files: [...files.keys()].sort().map((path) => ({
        path,
        sha256: digest(files.get(path) as string),
      })),
    },
    null,
    2,
  )}\n`
  return { files, manifest }
}

const recorded = (root: string): string[] => {
  try {
    const value = JSON.parse(readFileSync(join(root, MANIFEST), 'utf8')) as {
      files?: { path?: unknown }[]
    }
    return (value.files ?? []).flatMap((entry) =>
      typeof entry.path === 'string' ? [entry.path] : [],
    )
  } catch {
    return []
  }
}

/** Every way the committed files differ from a fresh render. */
export function maintainerDrift(root: string): string[] {
  const sources = readSources(root)
  const problems = sourceProblems(sources)
  if (problems.length) return problems
  const rendered = renderMaintainer(root, sources)
  const manifest = existsSync(join(root, MANIFEST))
    ? readFileSync(join(root, MANIFEST), 'utf8')
    : ''
  if (manifest !== rendered.manifest) problems.push(`${MANIFEST}: out of date`)
  for (const [path, content] of rendered.files) {
    const file = join(root, path)
    if (!existsSync(file) || !lstatSync(file).isFile()) problems.push(`${path}: missing`)
    else if (readFileSync(file, 'utf8') !== content) problems.push(`${path}: edited or stale`)
  }
  for (const path of recorded(root))
    if (!rendered.files.has(path) && existsSync(join(root, path)))
      problems.push(`${path}: no longer rendered from any source`)
  return problems
}

/** Write the render and remove files a previous render produced that no source produces now. */
export function writeMaintainer(root: string): { written: number; removed: number } {
  const sources = readSources(root)
  const problems = sourceProblems(sources)
  if (problems.length) throw new Error(problems.join('\n'))
  const rendered = renderMaintainer(root, sources)
  let written = 0,
    removed = 0
  for (const path of recorded(root))
    if (!rendered.files.has(path) && existsSync(join(root, path))) {
      rmSync(join(root, path))
      removed++
    }
  for (const [path, content] of rendered.files) {
    const file = join(root, path)
    // Identical bytes are not rewritten.
    if (existsSync(file) && readFileSync(file, 'utf8') === content) continue
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content)
    written++
  }
  if (
    !existsSync(join(root, MANIFEST)) ||
    readFileSync(join(root, MANIFEST), 'utf8') !== rendered.manifest
  )
    writeFileSync(join(root, MANIFEST), rendered.manifest)
  return { written, removed }
}
