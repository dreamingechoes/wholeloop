import { Document, isSeq } from 'yaml'
import { frontmatter } from '../harness/frontmatter.js'
import type { Adapter } from './contracts.js'
import { renderPortableSkill } from './portable.js'

// These names match Gemini 0.27.0's actual registry; current web docs also use a newer grep_search alias.
const readTools = ['read_file', 'read_many_files', 'list_directory', 'glob', 'search_file_content']
export const geminiAdapter: Adapter = {
  id: 'gemini',
  manifestPath: 'gemini-extension.json',
  launchers: true,
  capabilities: () => ({
    conformance: 'unverified',
    skills: 'rendered',
    agents: 'rendered',
    hooks: 'native-and-git-fallback',
    readOnly: 'read-tool-allowlist',
    engines: ['sequential', 'headless'],
  }),
  name: (_kind, name) => `wl-${name}`,
  paths: (kind, name) => (kind === 'skill' ? `skills/wl-${name}/SKILL.md` : `agents/wl-${name}.md`),
  manifest: (version) => ({
    name: 'wholeloop',
    version,
    description:
      'Independent evidence-backed development steps with an external journal and explicit human decisions.',
  }),
  renderSkill: (_name, content) => {
    const rendered = renderPortableSkill(content)
    return {
      ...rendered,
      content: `${rendered.content}\nWhen a structured ask tool is unavailable, show the exact questions/options in plain text and stop for explicit answers. Never manufacture an approval.\n`,
    }
  },
  renderAgent: (name, content) => {
    const metadata = frontmatter(content) ?? {}
    const canonical = (metadata.metadata ?? {}) as Record<string, string>
    const capabilities = (canonical['wholeloop.capabilities'] ?? '').split(/\s+/)
    const writable = capabilities.includes('write')
    const tools = [
      ...(capabilities.includes('read') ? readTools : []),
      ...(writable ? ['write_file', 'replace'] : []),
      ...(writable && capabilities.includes('shell') ? ['run_shell_command'] : []),
      ...(capabilities.includes('web') ? ['google_web_search', 'web_fetch'] : []),
    ]
    const native = { name: `wl-${name}`, description: metadata.description, kind: 'local', tools }
    const header = new Document(native)
    const allowed = header.get('tools', true)
    // Native metadata must fit alongside the canonical role within the sixty-line budget.
    if (isSeq(allowed)) allowed.flow = true
    const context = `The main session supplies wholeloopRoot from the checked packaged launcher. Read named protocols under wholeloopRoot/resources/protocols/; canonical wl commands mean Node with wholeloopRoot/bin/wl.mjs. If context is missing, return questions instead of guessing PATH. Canonical model tier: ${canonical['wholeloop.tier'] ?? 'standard'}; inherit the session model.\n\n`
    const boundaries = `${writable ? '' : 'This observer has no shell, write, memory or MCP tool. Ask the main session for observed command/provider evidence. '}Gemini subagents cannot nest delegation; return further role work to the main session for sequential execution. If structured questions are unavailable, return plain-text options and wait for answers.\n\n`
    return {
      mode: 0o644,
      content: `---\n${header.toString({ lineWidth: 0 })}---\n${context}${boundaries}${content.replace(/^---\n[\s\S]*?\n---\n/, '').trimStart()}`,
    }
  },
}
