import { stringify as toml } from 'smol-toml'
import { stringify as yaml } from 'yaml'
import { frontmatter } from '../harness/frontmatter.js'
import { claudeAdapter } from './claude.js'
import type { Adapter, AdapterCapabilities } from './contracts.js'

const strip = (content: string) => content.replace(/^---\n[\s\S]*?\n---\n/, '').trimStart()
const context =
  'The conductor supplies wholeloopRoot from the packaged adapter root command. For every canonical wl command invoke Node with wholeloopRoot/bin/wl.mjs. Read shared protocols under wholeloopRoot/resources/protocols/. If the root or required evidence is absent, return a question; do not guess PATH or manufacture coverage.\n\n'
function definition(content: string) {
  const metadata = frontmatter(content) ?? {}
  const canonical = (metadata.metadata ?? {}) as Record<string, string>
  return {
    metadata,
    capabilities: (canonical['wholeloop.capabilities'] ?? '').split(/\s+/),
    tier: canonical['wholeloop.tier'] ?? 'standard',
  }
}
export function portableManifest(version: string) {
  return {
    $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
    ...(claudeAdapter.manifest(version) as Record<string, unknown>),
  }
}
export function renderPortableSkill(content: string) {
  const metadata = frontmatter(content) ?? {}
  if (`wl-${String(metadata.name)}`.length > 64)
    throw new Error('Namespaced skill names must fit the 64-character skill budget')
  const preamble =
    'Use the exact directory of this loaded SKILL.md reported by the client. If unavailable, ask for it. Its scripts/wl.mjs launcher imports the packaged core, even through an installed directory symlink. First call that launcher with adapter root --json and pass the returned root to delegated agents. Canonical wl commands below mean this launcher, never an unrelated executable on PATH.\n\n'
  return {
    mode: 0o644 as const,
    content: `---\n${yaml({ ...metadata, name: `wl-${String(metadata.name)}` })}---\n${preamble}${strip(content)}`,
  }
}
function capabilities(
  readOnly: AdapterCapabilities['readOnly'],
  gitFallback = false,
): AdapterCapabilities {
  return {
    conformance: 'unverified',
    skills: 'rendered',
    agents: 'rendered',
    hooks: gitFallback ? 'git-fallback' : 'native-and-git-fallback',
    readOnly,
    engines: ['headless', 'sequential'],
  }
}
export const codexAdapter: Adapter = {
  id: 'codex',
  manifestPath: 'plugin.json',
  launchers: true,
  capabilities: () => capabilities('inherited-parent-and-checked-headless', true),
  name: (_kind, name) => `wl-${name}`,
  paths: (kind, name) =>
    kind === 'skill' ? `skills/wl-${name}/SKILL.md` : `.codex/agents/wl-${name}.toml`,
  manifest: (version, components) => ({
    ...portableManifest(version),
    ...(components?.skills.includes('wl-setup')
      ? { extensions: { 'com.openai': { onboardingSkill: './skills/wl-setup/SKILL.md' } } }
      : {}),
  }),
  renderSkill: (_name, content) => renderPortableSkill(content),
  renderAgent: (name, content, options = {}) => {
    const { metadata, capabilities, tier } = definition(content)
    const observer = !capabilities.includes('write')
    const instructions = `${options.runtime === false ? '' : context}Canonical model tier: ${tier}; inherit the current model unless the caller explicitly chooses an available model.\n${observer ? 'This role cannot obtain a separate native sandbox from its custom-agent file. Use a read-only parent or the checked headless gate transport for repository inspection; a prompt alone does not enforce read-only access. Never repair source or report inaccessible evidence as observed.\n' : ''}\n${strip(content)}`
    return {
      mode: 0o644,
      content: toml({
        name: options.runtime === false ? name : `wl-${name}`,
        description: String(metadata.description),
        developer_instructions: instructions,
        ...(observer
          ? {
              features: {
                shell_tool: false,
                apps: false,
                plugins: false,
                memories: false,
                request_permissions_tool: false,
              },
            }
          : {}),
      }),
    }
  },
}
export const opencodeAdapter: Adapter = {
  id: 'opencode',
  manifestPath: 'opencode.json',
  launchers: true,
  capabilities: () => capabilities('deny-shell-and-edit'),
  name: (_kind, name) => `wl-${name}`,
  paths: (kind, name) =>
    kind === 'skill' ? `.opencode/skills/wl-${name}/SKILL.md` : `.opencode/agents/wl-${name}.md`,
  manifest: () => ({ $schema: 'https://opencode.ai/config.json' }),
  renderSkill: (_name, content) => renderPortableSkill(content),
  renderAgent: (name, content, options = {}) => {
    const { metadata, capabilities, tier } = definition(content)
    const writable = capabilities.includes('write')
    const permission: Record<string, string> = {
      '*': 'deny',
      external_directory: writable ? 'ask' : 'allow',
      ...(capabilities.includes('read')
        ? { read: 'allow', glob: 'allow', grep: 'allow', skill: 'allow' }
        : {}),
      ...(writable ? { edit: 'allow' } : {}),
      ...(writable && capabilities.includes('shell') ? { bash: 'allow' } : {}),
      ...(capabilities.includes('web') ? { webfetch: 'allow', websearch: 'allow' } : {}),
    }
    return {
      mode: 0o644,
      content: `---\n${yaml({ description: metadata.description, mode: name === 'conductor' ? 'primary' : 'subagent', permission })}---\n${options.runtime === false ? '' : context}Canonical model tier: ${tier}; inherit the selected session model. Read-only roles receive no shell or edit permission; the conductor supplies observed command/provider results when needed.\n\n${strip(content)}`,
    }
  },
}
export const copilotAdapter: Adapter = {
  id: 'copilot',
  manifestPath: 'plugin.json',
  launchers: true,
  capabilities: () => capabilities('read-tool-allowlist'),
  name: (_kind, name) => `wl-${name}`,
  paths: (kind, name) =>
    kind === 'skill'
      ? `skills/wl-${name}/SKILL.md`
      : `com.github.copilot/agents/wl-${name}.agent.md`,
  manifest: (version) => portableManifest(version),
  renderSkill: (_name, content) => renderPortableSkill(content),
  renderAgent: (name, content, options = {}) => {
    const { metadata, capabilities, tier } = definition(content)
    const writable = capabilities.includes('write')
    const tools = [
      ...(capabilities.includes('read') ? ['view', 'glob', 'grep'] : []),
      ...(writable ? ['edit', 'create', 'apply_patch'] : []),
      ...(writable && capabilities.includes('shell') ? ['bash'] : []),
      ...(capabilities.includes('web') ? ['web_fetch'] : []),
    ]
    return {
      mode: 0o644,
      content: `---\n${yaml({ name: options.runtime === false ? name : `wl-${name}`, description: metadata.description, tools, 'include-custom-instructions': true, infer: false })}---\n${options.runtime === false ? '' : context}Canonical model tier: ${tier}; inherit the selected session model. Read-only roles receive no shell or write tool; the conductor supplies observed command/provider results when needed.\n\n${strip(content)}`,
    }
  },
}
