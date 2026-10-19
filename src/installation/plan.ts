import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { stringify } from 'yaml'
import type { RenderedFile } from '../adapters/contracts.js'
import { adapterFor, generateAdapter } from '../adapters/generate.js'
import { renderPortableSkill } from '../adapters/portable.js'
import { frontmatter } from '../harness/frontmatter.js'
import { canonicalPath } from '../state/paths.js'

export interface InstallContext {
  root: string
  home: string
  store: string
  scope: 'user' | 'project'
  env?: NodeJS.ProcessEnv
}
export interface InstalledFile extends RenderedFile {
  path: string
  component: string
}
export interface InstallPlan {
  target: string
  artifact: string
  files: InstalledFile[]
  exclusive: string[]
  locations: { skills: string; agents: string; hooks?: string }
  source: string
  core: string
  version: string
}
const absolute = (value: string | undefined, fallback: string, ignoreRelative = false) => {
  if (value && !isAbsolute(value) && !ignoreRelative)
    throw new Error('Native configuration directory overrides must be absolute')
  return canonicalPath(value && isAbsolute(value) ? value : fallback)
}
const modulePath = (from: string, to: string) => {
  let path = relative(from, to).split(sep).map(encodeURIComponent).join('/')
  if (!path.startsWith('.')) path = `./${path}`
  return path
}
const slash = (value: string) => value.split(sep).join('/')
const shell = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
export function installLocations(target: string, context: InstallContext) {
  const env = context.env ?? process.env
  const personal = context.scope === 'user'
  const root = canonicalPath(context.root)
  const home = canonicalPath(context.home)
  if (target === 'claude') {
    const base = personal
      ? absolute(env.CLAUDE_CONFIG_DIR, join(home, '.claude'))
      : join(root, '.claude')
    return { skills: join(base, 'skills'), agents: join(base, 'agents') }
  }
  if (target === 'codex')
    return {
      skills: personal ? join(home, '.agents/skills') : join(root, '.agents/skills'),
      agents: join(
        personal ? absolute(env.CODEX_HOME, join(home, '.codex')) : join(root, '.codex'),
        'agents',
      ),
    }
  if (target === 'opencode') {
    const base = personal
      ? absolute(
          env.OPENCODE_CONFIG_DIR,
          join(absolute(env.XDG_CONFIG_HOME, join(home, '.config'), true), 'opencode'),
        )
      : join(root, '.opencode')
    return {
      skills: join(base, 'skills'),
      agents: join(base, 'agents'),
      hooks: join(base, 'plugins'),
    }
  }
  if (target === 'copilot') {
    const base = personal
      ? absolute(env.COPILOT_HOME, join(home, '.copilot'))
      : join(root, '.github')
    return {
      skills: join(base, 'skills'),
      agents: join(base, 'agents'),
      hooks: join(base, 'hooks'),
    }
  }
  throw new Error('Choose an installed target: claude,codex,opencode,copilot')
}
/** Pure native overlay rendering. It never rewrites shared client settings or copies credential stores. */
export function installationPlan(
  target: string,
  context: InstallContext,
  artifact: string,
  canonical: ReadonlyMap<string, string>,
  core: string,
  version: string,
): InstallPlan {
  const generated = generateAdapter(target, canonical, core, version)
  const locations = installLocations(target, context)
  const files: InstalledFile[] = []
  const exclusive = [artifact]
  const add = (path: string, content: string, mode: 0o644 | 0o755 = 0o644) =>
    files.push({ path: resolve(path), content, mode, component: target })
  for (const [path, file] of generated.files) add(join(artifact, path), file.content, file.mode)
  const hookCommand =
    context.scope === 'project'
      ? `node "\${CLAUDE_PROJECT_DIR}/.wholeloop/distribution/${target}/hooks/run.mjs" claude`
      : `node ${shell(join(artifact, 'hooks/run.mjs'))} claude`
  const hooks = {
    PreToolUse: [
      { matcher: '.*', hooks: [{ type: 'command', command: hookCommand, timeout: 15 }] },
    ],
  }
  for (const [path, content] of canonical) {
    const skill = /^harness\/skills\/([^/]+)\/SKILL.md$/.exec(path)?.[1]
    const agent = /^harness\/agents\/([^/]+)\.md$/.exec(path)?.[1]
    if (skill) {
      const directory = join(locations.skills, `wl-${skill}`)
      exclusive.push(directory)
      let rendered = renderPortableSkill(content).content
      if (target === 'claude')
        rendered = `---\n${stringify({ ...frontmatter(rendered), hooks })}---\n${rendered.replace(/^---\n[\s\S]*?\n---\n/, '')}`
      add(join(directory, 'SKILL.md'), rendered)
      const launcher = join(directory, 'scripts/wl.mjs')
      const imported = modulePath(join(directory, 'scripts'), join(artifact, 'bin/wl.mjs'))
      add(
        launcher,
        `#!/usr/bin/env node\nawait import(new URL(${JSON.stringify(imported)},import.meta.url))\n`,
        0o755,
      )
    } else if (agent) {
      const source = generated.files.get(adapterFor(target).paths('agent', agent))
      if (!source) throw new Error('Generated native agent is missing')
      const extension = target === 'codex' ? '.toml' : target === 'copilot' ? '.agent.md' : '.md'
      let body = source.content.replace(
        "this plugin's absolute root.",
        'the checked packaged artifact root.',
      )
      if (target === 'claude')
        body = `---\n${stringify({ ...frontmatter(body), name: `wl-${agent}`, hooks })}---\n${body.replace(/^---\n[\s\S]*?\n---\n/, '')}`
      add(join(locations.agents, `wl-${agent}${extension}`), body)
    }
  }
  if (target === 'opencode' && locations.hooks) {
    const imported = modulePath(locations.hooks, join(artifact, 'hooks/check.mjs'))
    const plugin = generated.files.get('.opencode/plugins/wholeloop.js')?.content
    if (!plugin) throw new Error('Generated OpenCode guard plugin is missing')
    add(
      join(locations.hooks, 'wholeloop.js'),
      plugin.replace("'../../hooks/check.mjs'", JSON.stringify(imported)),
    )
  }
  if (target === 'copilot' && locations.hooks) {
    const project = context.scope === 'project'
    const executable = project
      ? slash(relative(context.root, join(artifact, 'hooks/run.mjs')))
      : join(artifact, 'hooks/run.mjs')
    add(
      join(locations.hooks, 'wholeloop.json'),
      `${JSON.stringify({ version: 1, hooks: { preToolUse: [{ type: 'command', exec: 'node', args: [executable, 'copilot'], ...(project ? { cwd: '.' } : {}), timeoutSec: 15 }] } }, null, 2)}\n`,
    )
  }
  return {
    target,
    artifact,
    files: files.sort((a, b) => a.path.localeCompare(b.path)),
    exclusive,
    locations,
    source: generated.manifest.source,
    core: generated.manifest.core,
    version,
  }
}
