// P4-01: the launcher drafts launch material and must have no tool able to send a message,
// change exposure or run a command, in every client's rendering of the real harness. These are
// render-level checks; whether a client also inherits user MCP servers is native verification.
import { parse as toml } from 'smol-toml'
import { describe, expect, it } from 'vitest'
import { bundledCanonical } from '../../../src/adapters/canonical.js'
import { generateAdapter } from '../../../src/adapters/generate.js'
import { frontmatter } from '../../../src/harness/frontmatter.js'

const core = '#!/usr/bin/env node\nconsole.log("fixture core")\n'

function launcher(target: string) {
  const files = generateAdapter(target, bundledCanonical(), core, '0.0.0').files
  const entry = [...files].find(([path]) =>
    /(?:^|\/)(?:wl-(?:agy-)?)?launcher(?:\.agent)?\.(?:md|toml)$/.test(path),
  )
  if (!entry) throw new Error(`No launcher rendered for ${target}`)
  return [entry[0], String((entry[1] as { content: string | Uint8Array }).content)] as const
}
const meta = (text: string) => frontmatter(text) ?? {}

describe('launcher tools per client', () => {
  it('Claude Code: read tools only, plan mode, writes and every MCP tool disallowed', () => {
    const data = meta(launcher('claude')[1])
    expect(String(data.tools).split(/,\s*/)).toEqual(['Read', 'Glob', 'Grep'])
    expect(data.permissionMode).toBe('plan')
    expect(String(data.disallowedTools)).toContain('mcp__*')
  })

  it('Codex: shell, apps, plugins and permission requests disabled', () => {
    const data = toml(launcher('codex')[1]) as { features: Record<string, boolean> }
    expect(data.features).toMatchObject({
      shell_tool: false,
      apps: false,
      plugins: false,
      request_permissions_tool: false,
    })
  })

  it('OpenCode: every permission denied except reading', () => {
    const permission = meta(launcher('opencode')[1]).permission as Record<string, string>
    expect(permission['*']).toBe('deny')
    const allowed = Object.entries(permission)
      .filter(([, value]) => value === 'allow')
      .map(([key]) => key)
      .sort()
    expect(allowed).toEqual(['external_directory', 'glob', 'grep', 'read', 'skill'])
  })

  it.each([
    ['copilot', ['view', 'glob', 'grep']],
    ['gemini', ['read_file', 'read_many_files', 'list_directory', 'glob', 'search_file_content']],
    ['antigravity', ['view_file', 'grep_search']],
  ])('%s: an explicit list of read tools only', (target, tools) => {
    const data = meta(launcher(target)[1])
    expect(data.tools).toEqual(tools)
    if (target === 'antigravity') expect(data.commandExecutionPolicy).toBe('off')
  })

  it('Cursor: the read-only subagent mode', () => {
    expect(meta(launcher('cursor')[1]).readonly).toBe(true)
  })
})
