// Renders the harness for Claude Code as loose skills, agents and a plugin.
import { stringify } from 'yaml'
import { frontmatter } from '../harness/frontmatter.js'
import type { Adapter } from './contracts.js'
import { agentContext } from './roles.js'

const tools: Record<string, string[]> = {
  read: ['Read', 'Glob', 'Grep'],
  write: ['Write', 'Edit'],
  shell: ['Bash'],
  web: ['WebFetch', 'WebSearch'],
}
const tiers: Record<string, string> = { fast: 'haiku', standard: 'sonnet', deep: 'opus' }
function body(content: string) {
  return content.replace(/^---\n[\s\S]*?\n---\n/, '').trimStart()
}
/** Plugin skills expand this variable; subagents receive its resolved value from their conductor. */
export const claudeAdapter: Adapter = {
  id: 'claude',
  manifestPath: '.claude-plugin/plugin.json',
  capabilities: () => ({
    conformance: 'unverified',
    skills: 'rendered',
    agents: 'rendered',
    hooks: 'native-and-git-fallback',
    readOnly: 'tool-allowlist-and-plan-mode',
    engines: ['headless', 'sequential'],
  }),
  name: (_kind, name) => name,
  paths: (kind, name) => (kind === 'skill' ? `skills/${name}/SKILL.md` : `agents/${name}.md`),
  manifest: (version) => ({
    name: 'wholeloop',
    version,
    description:
      'Define, build, roll out and learn through independent evidence-backed development steps.',
    author: { name: 'Iván González Sáiz' },
    license: 'MIT',
    homepage: 'https://github.com/dreamingechoes/wholeloop',
    repository: 'https://github.com/dreamingechoes/wholeloop',
  }),
  renderSkill: (_name, content) => {
    const metadata = frontmatter(content)
    const context = `Use shared protocols under \${CLAUDE_PLUGIN_ROOT}/resources/protocols/. When delegating, pass wholeloopRoot=\${CLAUDE_PLUGIN_ROOT} explicitly to each agent. For execution only, replace the leading wl in command notation with node "\${CLAUDE_PLUGIN_ROOT}/bin/wl.mjs". Show short wl commands to the person. The bundled core owns state; never replace it with another executable found on PATH.\n\n`
    return { mode: 0o644, content: `---\n${stringify(metadata)}---\n${context}${body(content)}` }
  },
  renderAgent: (_name, content, options = {}) => {
    const metadata = frontmatter(content) ?? {}
    const canonical = (metadata.metadata ?? {}) as Record<string, string>
    const capabilities = (canonical['wholeloop.capabilities'] ?? '').split(/\s+/)
    const writable = capabilities.includes('write')
    // Plugin agents ignore permissionMode, so observers must not receive a command interface.
    const selected = [
      ...new Set(
        capabilities.flatMap((capability) =>
          capability === 'shell' && !writable ? [] : (tools[capability] ?? []),
        ),
      ),
    ]
    const native = {
      name: metadata.name,
      description: metadata.description,
      tools: selected.join(', '),
      model: tiers[canonical['wholeloop.tier'] ?? 'standard'],
      ...(!writable
        ? { permissionMode: 'plan', disallowedTools: 'Write, Edit, NotebookEdit, mcp__*' }
        : {}),
    }
    const context =
      options.runtime === false ? '' : agentContext(writable && capabilities.includes('shell'))
    return { mode: 0o644, content: `---\n${stringify(native)}---\n${context}${body(content)}` }
  },
}
