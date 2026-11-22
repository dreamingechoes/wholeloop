// Renders the harness for Cursor: a native manifest with roles, rules and hooks, and a portable
// skills manifest.
import { Document } from 'yaml'
import { markEntrypoint } from '../harness/entrypoints.js'
import { frontmatter } from '../harness/frontmatter.js'
import type { Adapter, RenderedFile } from './contracts.js'
import { renderPortableSkill } from './portable.js'
import { agentContext, mappedModel, tierSentence } from './roles.js'

export const cursorAdapter: Adapter = {
  id: 'cursor',
  manifestPath: '.cursor-plugin/plugin.json',
  launchers: true,
  capabilities: () => ({
    conformance: 'unverified',
    skills: 'rendered',
    agents: 'rendered',
    hooks: 'native-and-git-fallback',
    readOnly: 'native-readonly',
    engines: ['headless', 'sequential'],
  }),
  name: (_kind, name) => `wl-${name}`,
  paths: (kind, name) => (kind === 'skill' ? `skills/wl-${name}/SKILL.md` : `agents/wl-${name}.md`),
  manifest: (version) => ({
    name: 'wholeloop',
    version,
    description:
      'Independent development steps with observed evidence and explicit human decisions.',
    skills: './skills',
    agents: './agents',
    rules: './rules',
    hooks: './hooks/hooks.json',
  }),
  artifacts: (version) =>
    new Map<string, RenderedFile>([
      // The native manifest carries roles/rules/hooks; the open-standard manifest remains portable skills only.
      [
        'plugin.json',
        {
          mode: 0o644,
          content: `${JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name: 'wholeloop', version, description: 'Independent development steps through checked packaged skills.' }, null, 2)}\n`,
        },
      ],
      [
        'rules/wholeloop.mdc',
        {
          mode: 0o644,
          content: markEntrypoint(
            '---\ndescription: Invoke wholeloop through its checked packaged core and retain observed receipts.\nalwaysApply: false\n---\n# Wholeloop invocation\n\nRead the actual installed SKILL.md and locate its sibling scripts/wl.mjs. Invoke\nthe first normal JSON command with a leading --with-context; use context.root\nfor packaged resources and result for the command payload. Never infer a core\nfrom PATH. Retain explicit human decisions, external runtime state and observed\nevidence. Native installation and a version token do not prove model execution.\n',
          ),
        },
      ],
    ]),
  renderSkill: (name, content) => {
    if (`wl-${name}`.length > 64)
      throw new Error('Native skill names must fit the 64-character skill budget')
    const rendered = renderPortableSkill(content)
    return {
      ...rendered,
      content: `${rendered.content}\nIf structured questions are unavailable, return the exact plain-text options and wait for explicit answers.\n`,
    }
  },
  renderAgent: (name, content, options = {}) => {
    const metadata = frontmatter(content) ?? {}
    const canonical = (metadata.metadata ?? {}) as Record<string, string>
    const capabilities = (canonical['wholeloop.capabilities'] ?? '').split(/\s+/)
    const writable = capabilities.includes('write')
    const header = new Document({
      name: options.runtime === false ? name : `wl-${name}`,
      description: metadata.description,
      model: mappedModel(options.model) ?? 'inherit',
      readonly: !writable,
      is_background: false,
    })
    const context =
      options.runtime === false
        ? ''
        : `${agentContext(writable && capabilities.includes('shell'))}${tierSentence(canonical['wholeloop.tier'] ?? 'standard', options.model, `Canonical model tier: ${canonical['wholeloop.tier'] ?? 'standard'}; inherit the selected model.`)}\n\n`
    const boundary = `${writable ? '' : 'This observer runs with native readonly permissions. Request observed command/provider evidence from the main session; do not change files, state or services. '}Return additional role work for sequential main-session handoff. ${options.runtime !== false && !writable ? 'Return missing inputs to the conductor; never ask the person directly.' : 'If structured questions are unavailable, return plain-text options and wait.'}\n\n`
    return {
      mode: 0o644,
      content: `---\n${header.toString({ lineWidth: 0 })}---\n${context}${boundary}${content.replace(/^---\n[\s\S]*?\n---\n/, '').trimStart()}`,
    }
  },
}
