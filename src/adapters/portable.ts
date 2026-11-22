// The portable skill format and the Codex, OpenCode and Copilot renderers that use it.
import { stringify as toml } from 'smol-toml'
import { stringify as yaml } from 'yaml'
import { frontmatter } from '../harness/frontmatter.js'
import { claudeAdapter } from './claude.js'
import type { Adapter, AdapterCapabilities } from './contracts.js'
import { agentContext, mappedModel, tierSentence } from './roles.js'

const strip = (content: string) => content.replace(/^---\n[\s\S]*?\n---\n/, '').trimStart()
/**
 * OpenCode's own read default asks before .env files; a bare read allow placed after it
 * overrides that ask (observed on 2.2.5). Deny them outright, as the headless inspector does.
 */
export const OPENCODE_READ = {
  '*': 'allow',
  '*.env': 'deny',
  '*.env.*': 'deny',
  '*.env.example': 'allow',
} as const
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
    'Use the exact directory of this loaded SKILL.md reported by the client. Its scripts/wl.mjs launcher imports the packaged core, including through an installed symlink. Invoke the first normal command directly with --with-context before the command and --json: context.root locates resources/protocols/, context.roles names installed roles, and result is the unchanged command payload. Later calls use the same launcher without --with-context. If the skill directory is unavailable, ask; never guess PATH. Supply workers only their assignment and required protocol text, never conversation history.\n\n'
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
  // Codex 0.166 gives a custom agent every MCP server in the user's configuration, and the
  // agent file cannot remove servers it cannot name, so a native launcher could reach a sending
  // tool. prepare-launch drafts on Codex through `wl launch draft --engine headless` instead.
  omitAgents: ['launcher'],
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
    const model = mappedModel(options.model)
    const instructions = `${options.runtime === false ? '' : agentContext(!observer && capabilities.includes('shell'))}${tierSentence(tier, model, `Canonical model tier: ${tier}; inherit the current model unless the caller explicitly chooses an available model.`)}\n${observer ? 'This role cannot obtain a separate native sandbox from its custom-agent file. Use a read-only parent or the checked headless gate transport for repository inspection; a prompt alone does not enforce read-only access. Never repair source or report inaccessible evidence as observed.\n' : ''}\n${strip(content)}`
    return {
      mode: 0o644,
      content: toml({
        name: options.runtime === false ? name : `wl-${name}`,
        description: String(metadata.description),
        developer_instructions: instructions,
        ...(model ? { model } : {}),
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
    const model = mappedModel(options.model)
    const permission: Record<string, string | typeof OPENCODE_READ> = {
      '*': 'deny',
      external_directory: writable ? 'ask' : 'allow',
      ...(capabilities.includes('read')
        ? { read: OPENCODE_READ, glob: 'allow', grep: 'allow', skill: 'allow' }
        : {}),
      ...(writable ? { edit: 'allow' } : {}),
      ...(writable && capabilities.includes('shell') ? { bash: 'allow' } : {}),
      ...(capabilities.includes('web') ? { webfetch: 'allow', websearch: 'allow' } : {}),
    }
    return {
      mode: 0o644,
      content: `---\n${yaml({ description: metadata.description, mode: name === 'conductor' ? 'primary' : 'subagent', ...(model ? { model } : {}), permission })}---\n${options.runtime === false ? '' : agentContext(writable && capabilities.includes('shell'))}${tierSentence(tier, model, `Canonical model tier: ${tier}; inherit the selected session model.`)} Read-only roles receive no shell or edit permission; the conductor supplies observed command/provider results when needed.\n\n${strip(content)}`,
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
    const model = mappedModel(options.model)
    const tools = [
      ...(capabilities.includes('read') ? ['view', 'glob', 'grep'] : []),
      ...(writable ? ['edit', 'create', 'apply_patch'] : []),
      ...(writable && capabilities.includes('shell') ? ['bash'] : []),
      ...(capabilities.includes('web') ? ['web_fetch'] : []),
    ]
    return {
      mode: 0o644,
      content: `---\n${yaml({ name: options.runtime === false ? name : `wl-${name}`, description: metadata.description, tools, ...(model ? { model } : {}), 'include-custom-instructions': true, infer: false })}---\n${options.runtime === false ? '' : agentContext(writable && capabilities.includes('shell'))}${tierSentence(tier, model, `Canonical model tier: ${tier}; inherit the selected session model.`)} Read-only roles receive no shell or write tool; the conductor supplies observed command/provider results when needed.\n\n${strip(content)}`,
    }
  },
}
