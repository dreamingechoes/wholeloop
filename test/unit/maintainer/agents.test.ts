import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { frontmatter } from '../../../src/harness/frontmatter.js'
import { readSources } from '../../../src/maintainer/render.js'

const root = resolve('.')
const agents = [...readSources(root)].filter(([path]) => path.startsWith('maintainer/agents/'))
const names = agents.map(([path]) => path.replace(/^maintainer\/agents\/|\.md$/g, ''))
const rendered = (path: string) => readFileSync(join(root, path), 'utf8')

describe('maintainer specialist agents', () => {
  it('provides the four reviewers, all read-only at the source', () => {
    expect(names.sort()).toEqual([
      'maint-convention-reviewer',
      'maint-docs-auditor',
      'maint-release-manager',
      'maint-security-auditor',
    ])
    for (const [path, content] of agents) {
      const metadata = (frontmatter(content)?.metadata ?? {}) as Record<string, string>
      expect(metadata['wholeloop.capabilities'], path).toBe('read')
    }
  })

  it.each(names)('%s maps to each client read-only, or states why it cannot', (name) => {
    expect(rendered(`.claude/agents/${name}.md`)).toMatch(/permissionMode: plan/)
    expect(rendered(`.claude/agents/${name}.md`)).toMatch(/disallowedTools: Write, Edit/)
    const codex = rendered(`.codex/agents/${name}.toml`)
    expect(codex).toMatch(/shell_tool = false/)
    // Codex cannot sandbox a custom agent itself; the rendered role says so.
    expect(codex).toContain('a prompt alone does not enforce read-only access')
    const opencode = rendered(`.opencode/agents/${name}.md`)
    expect(opencode).toMatch(/"\*": deny/)
    expect(opencode).not.toMatch(/^\s+(?:edit|bash): allow/m)
    expect(rendered(`.github/agents/${name}.agent.md`)).not.toMatch(
      /\b(?:edit|create|bash)\b.*tools|tools:.*\b(?:edit|create|bash)\b/,
    )
    expect(rendered(`.gemini/agents/${name}.md`)).not.toMatch(/write_file|run_shell_command/)
    expect(rendered(`.cursor/agents/${name}.md`)).toMatch(/readonly: true/)
    const antigravity = rendered(`.agents/agents/${name}.md`)
    expect(antigravity).not.toMatch(/write_to_file|run_command/)
    expect(antigravity).toMatch(/commandExecutionPolicy: off/)
    const manifest = JSON.parse(rendered('maintainer/rendered.json'))
    expect(manifest.targets.codex.readOnly).toBe('inherited-parent-and-checked-headless')
  })

  it.each(agents)('%s cites the rule behind every finding', (_path, content) => {
    expect(content).toMatch(/\*\*rule:?\*\*/)
    expect(content).toMatch(/read-only: never/)
    for (const [, cited] of content.matchAll(
      /`((?:docs|roadmap|scripts|src|test|\.github)\/[A-Za-z0-9_./-]+|AGENTS\.md|SECURITY\.md|CONTRIBUTING\.md|enforcement\.yml)`/g,
    ))
      if (cited) expect(existsSync(join(root, cited)), cited).toBe(true)
  })
})
