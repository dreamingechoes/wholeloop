import { createHash } from 'node:crypto'
import { posix } from 'node:path'
import { validate } from '../config/schema.js'
import { markEntrypoint } from '../harness/entrypoints.js'
import { antigravityAdapter } from './antigravity.js'
import { canonicalDigest, validateCanonical } from './canonical.js'
import { claudeAdapter } from './claude.js'
import type { Adapter, RenderedFile } from './contracts.js'
import { cursorAdapter } from './cursor.js'
import { geminiAdapter } from './gemini.js'
import { hookArtifacts } from './hooks.js'
import { codexAdapter, copilotAdapter, opencodeAdapter } from './portable.js'
import artifactSchema from './schemas/artifacts-v1.json' with { type: 'json' }

export const artifactDigest = (content: string) =>
  createHash('sha256').update(content).digest('hex')
export const ADAPTERS: readonly Adapter[] = [
  claudeAdapter,
  codexAdapter,
  opencodeAdapter,
  copilotAdapter,
  geminiAdapter,
  antigravityAdapter,
  cursorAdapter,
]
export function adapterFor(id: string): Adapter {
  const found = ADAPTERS.find((adapter) => adapter.id === id)
  if (found) return found
  throw new Error('Choose --target claude|codex|opencode|copilot|gemini|antigravity|cursor')
}
/** A pure render tree lets generation, installation and golden tests share one contract. */
export function generateAdapter(
  id: string,
  canonical: ReadonlyMap<string, string>,
  core: string,
  version: string,
  nativeVersion?: string,
) {
  validateCanonical(canonical)
  if (
    !core.startsWith('#!/usr/bin/env node\n') ||
    !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version)
  )
    throw new Error('Bundle a built executable core and a valid package version')
  const adapter = adapterFor(id)
  const files = new Map<string, RenderedFile>()
  const skills: string[] = []
  const agents: string[] = []
  for (const [path, content] of [...canonical].sort(([a], [b]) => a.localeCompare(b))) {
    const skill = /^harness\/skills\/([^/]+)\/SKILL.md$/.exec(path)?.[1]
    const agent = /^harness\/agents\/([^/]+)\.md$/.exec(path)?.[1]
    if (skill) {
      skills.push(adapter.name('skill', skill))
      const path = adapter.paths('skill', skill)
      const rendered = adapter.renderSkill(skill, content)
      files.set(path, { ...rendered, content: markEntrypoint(rendered.content) })
      if (adapter.launchers) {
        const launcher = posix.join(posix.dirname(path), 'scripts/wl.mjs')
        const relative = posix.relative(posix.dirname(launcher), 'bin/wl.mjs')
        files.set(launcher, {
          mode: 0o755,
          content: `#!/usr/bin/env node\nawait import(new URL(${JSON.stringify(relative)}, import.meta.url))\n`,
        })
      }
    } else if (agent) {
      agents.push(adapter.name('agent', agent))
      const path = adapter.paths('agent', agent)
      const rendered = adapter.renderAgent(agent, content)
      files.set(path, {
        ...rendered,
        content: markEntrypoint(rendered.content, path.endsWith('.toml') ? 'toml' : 'md'),
      })
    } else files.set(path.replace(/^harness\//, 'resources/'), { mode: 0o644, content })
  }
  files.set(adapter.manifestPath, {
    mode: 0o644,
    content: `${JSON.stringify(adapter.manifest(version, { skills, agents }), null, 2)}\n`,
  })
  for (const [path, file] of adapter.artifacts?.(version) ?? []) {
    if (files.has(path))
      throw new Error('Adapter artifacts must not replace a generated entrypoint')
    files.set(path, file)
  }
  for (const [path, file] of hookArtifacts(id, artifactDigest(core), nativeVersion))
    files.set(path, file)
  files.set('bin/wl.mjs', { mode: 0o755, content: core })
  const manifest = {
    schema: 'wholeloop/adapter-artifacts@1',
    target: id,
    version,
    source: canonicalDigest(canonical),
    core: artifactDigest(core),
    capabilities: adapter.capabilities(),
    skills,
    agents,
    files: [...files].map(([path, file]) => ({
      path,
      mode: file.mode,
      sha256: artifactDigest(file.content),
    })),
  }
  if (validate(manifest, artifactSchema).length)
    throw new Error('Generated adapter manifest violates its versioned contract')
  files.set('wholeloop-artifacts.json', {
    mode: 0o644,
    content: `${JSON.stringify(manifest, null, 2)}\n`,
  })
  return { files, manifest }
}
