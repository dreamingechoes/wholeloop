// Plans native overlay files per client and scope without touching shared client settings.
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { stringify } from 'yaml'
import { antigravityHook } from '../adapters/antigravity-hook.js'
import type { RenderedFile } from '../adapters/contracts.js'
import { cursorHook } from '../adapters/cursor-hook.js'
import { adapterFor, generateAdapter } from '../adapters/generate.js'
import { renderPortableSkill } from '../adapters/portable.js'
import { markEntrypoint } from '../harness/entrypoints.js'
import { frontmatter } from '../harness/frontmatter.js'
import { canonicalPath } from '../state/paths.js'

export interface InstallContext {
  root: string
  home: string
  store: string
  scope: 'user' | 'project'
  env?: NodeJS.ProcessEnv
  opencodeVersion?: string
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
  locations: { skills: string; agents: string; hooks?: string; plugin?: string; rules?: string }
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
export const installedName = (target: string, kind: 'skill' | 'agent', name: string) =>
  target === 'claude' ? `wl-${name}` : adapterFor(target).name(kind, name)
export function installLocations(
  target: string,
  context: InstallContext,
): InstallPlan['locations'] {
  const env = context.env ?? process.env
  const personal = context.scope === 'user'
  const root = canonicalPath(context.root)
  const home = canonicalPath(context.home)
  if (target === 'cursor') {
    const base = join(personal ? home : root, '.cursor')
    return {
      skills: join(base, 'skills'),
      agents: join(base, 'agents'),
      hooks: base,
      rules: join(base, 'rules'),
    }
  }
  if (target === 'antigravity') {
    const base = personal
      ? join(home, '.gemini/antigravity-cli/plugins/wholeloop')
      : join(root, '.agents')
    return {
      skills: join(base, 'skills'),
      agents: join(base, 'agents'),
      hooks: base,
      ...(personal ? { plugin: base } : {}),
    }
  }
  if (target === 'gemini') {
    const base = personal
      ? join(absolute(env.GEMINI_CLI_HOME, home), '.gemini')
      : join(root, '.gemini')
    return { skills: join(base, 'skills'), agents: join(base, 'agents') }
  }
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
  throw new Error(
    'Choose an installed target: claude,codex,opencode,copilot,gemini,antigravity,cursor',
  )
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
  const generated = generateAdapter(
    target,
    canonical,
    core,
    version,
    target === 'opencode' ? context.opencodeVersion : undefined,
  )
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
      const directory = join(locations.skills, installedName(target, 'skill', skill))
      exclusive.push(directory)
      const source = generated.files.get(adapterFor(target).paths('skill', skill))
      if (!source) throw new Error('Generated native skill is missing')
      let rendered = target === 'claude' ? renderPortableSkill(content).content : source.content
      if (target === 'claude')
        rendered = `---\n${stringify({ ...frontmatter(rendered), hooks })}---\n${rendered.replace(/^---\n[\s\S]*?\n---\n/, '')}`
      add(join(directory, 'SKILL.md'), markEntrypoint(rendered))
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
      add(join(locations.agents, `${installedName(target, 'agent', agent)}${extension}`), body)
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
  if (target === 'cursor' && locations.hooks && locations.rules) {
    add(
      join(locations.hooks, 'hooks.json'),
      `${JSON.stringify(cursorHook(generated.manifest.core, context.scope === 'user' ? { kind: 'user', root: artifact } : { kind: 'project' }), null, 2)}\n`,
    )
    const rule = generated.files.get('rules/wholeloop.mdc')
    if (!rule) throw new Error('Generated Cursor rule is missing')
    add(join(locations.rules, 'wl-wholeloop.mdc'), rule.content)
  }
  if (target === 'antigravity' && locations.hooks) {
    add(
      join(locations.hooks, 'hooks.json'),
      `${JSON.stringify(antigravityHook(generated.manifest.core, context.scope === 'user' ? artifact : undefined), null, 2)}\n`,
    )
    if (locations.plugin) {
      exclusive.push(locations.plugin)
      const marker = generated.files.get('plugin.json')
      if (!marker) throw new Error('Generated Antigravity plugin marker is missing')
      add(join(locations.plugin, 'plugin.json'), marker.content)
    }
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
