import { Document, isSeq, stringify } from 'yaml'
import { frontmatter } from '../harness/frontmatter.js'
import type { Adapter } from './contracts.js'
import { renderPortableSkill } from './portable.js'

/** .agents/skills is shared with Codex; a native namespace keeps both owned overlays usable. */
export const antigravityAdapter: Adapter = {
  id: 'antigravity',
  manifestPath: 'plugin.json',
  launchers: true,
  capabilities: () => ({
    conformance: 'unverified',
    skills: 'rendered',
    agents: 'rendered',
    hooks: 'native-and-git-fallback',
    readOnly: 'read-tool-allowlist',
    engines: ['sequential', 'headless'],
  }),
  name: (_kind, name) => `wl-agy-${name}`,
  paths: (kind, name) =>
    kind === 'skill' ? `skills/wl-agy-${name}/SKILL.md` : `agents/wl-agy-${name}.md`,
  // The native manifest is closed; package version/integrity live in wholeloop-artifacts.json.
  manifest: () => ({
    name: 'wholeloop',
    description:
      'Independent development steps with an external journal, owned artifacts and explicit human decisions.',
  }),
  renderSkill: (name, content) => {
    const nativeName = `wl-agy-${name}`
    if (nativeName.length > 64)
      throw new Error('Namespaced skill names must fit the 64-character skill budget')
    const rendered = renderPortableSkill(content)
    const metadata = frontmatter(rendered.content)
    return {
      ...rendered,
      content: `---\n${stringify({ ...metadata, name: nativeName })}---\n${rendered.content.replace(/^---\n[\s\S]*?\n---\n/, '')}\nNative wholeloop skills use the wl-agy- prefix. If structured questions are unavailable, return exact plain-text options and wait for explicit answers.\n`,
    }
  },
  renderAgent: (name, content) => {
    const metadata = frontmatter(content) ?? {}
    const canonical = (metadata.metadata ?? {}) as Record<string, string>
    const capabilities = (canonical['wholeloop.capabilities'] ?? '').split(/\s+/)
    const writable = capabilities.includes('write')
    const tools = [
      ...(capabilities.includes('read') ? ['view_file', 'grep_search'] : []),
      ...(writable ? ['write_to_file', 'replace_file_content', 'multi_replace_file_content'] : []),
      ...(writable && capabilities.includes('shell') ? ['run_command'] : []),
      ...(capabilities.includes('web') ? ['search_web', 'read_url_content'] : []),
    ]
    const header = new Document({
      name: `wl-agy-${name}`,
      description: metadata.description,
      tools,
      mainAgent: false,
      subagent: true,
      model: 'inherit',
      commandExecutionPolicy: writable ? 'sandbox' : 'off',
    })
    const allowed = header.get('tools', true)
    if (isSeq(allowed)) allowed.flow = true
    const context = `The main session supplies wholeloopRoot from the checked packaged launcher. Read protocols under wholeloopRoot/resources/protocols/ and run canonical wl commands with Node and wholeloopRoot/bin/wl.mjs. Missing context returns a question, never a PATH guess. Canonical tier: ${canonical['wholeloop.tier'] ?? 'standard'}; inherit the selected model.\n\n`
    const boundary = `${writable ? '' : 'This observer has no shell, write, memory, MCP or delegation tool. Request observed command/provider evidence from the main session. '}Return additional role work for sequential main-session handoff. If structured questions are unavailable, return plain-text options and wait.\n\n`
    return {
      mode: 0o644,
      content: `---\n${header.toString({ lineWidth: 0 })}---\n${context}${boundary}${content.replace(/^---\n[\s\S]*?\n---\n/, '').trimStart()}`,
    }
  },
}
