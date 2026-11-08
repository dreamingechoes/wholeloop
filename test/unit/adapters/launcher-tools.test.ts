// P4-01: the launcher drafts launch material and must have no tool able to send a message,
// change exposure or run a command, in every client's rendering of the real harness. These are
// render-level checks. Natively (2026-11-08), Cursor's readonly mode refused inherited MCP calls,
// while a Codex custom agent received every user MCP server, so Codex renders no native launcher
// and drafts through the isolated headless recipe.
import { describe, expect, it } from 'vitest'
import { bundledCanonical } from '../../../src/adapters/canonical.js'
import { generateAdapter } from '../../../src/adapters/generate.js'
import { headlessAdapter } from '../../../src/fanout/adapters.js'
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

  it('Codex: no native launcher; the headless recipe ignores user config and MCP servers', () => {
    expect(() => launcher('codex')).toThrow('No launcher rendered for codex')
    const { args } = headlessAdapter('codex').invocation({
      repository: '/workspace/project',
      directory: '/workspace/worker',
    })
    expect(args).toEqual(expect.arrayContaining(['--ignore-user-config', 'mcp_servers={}']))
    // Account apps (connectors) survive both settings, so the recipe also disables them.
    for (const feature of ['apps', 'plugins', 'browser_use', 'computer_use'])
      expect(args.join(' ')).toContain(`--disable ${feature}`)
    expect(args.slice(args.indexOf('--sandbox'), args.indexOf('--sandbox') + 2)).toEqual([
      '--sandbox',
      'read-only',
    ])
    expect(args.slice(0, 2)).toEqual(['--ask-for-approval', 'never'])
  })

  it('OpenCode: every permission denied except reading', () => {
    const permission = meta(launcher('opencode')[1]).permission as Record<string, unknown>
    expect(permission['*']).toBe('deny')
    const allowed = Object.entries(permission)
      .filter(([, value]) => value === 'allow')
      .map(([key]) => key)
      .sort()
    expect(allowed).toEqual(['external_directory', 'glob', 'grep', 'skill'])
    expect(permission.read).toMatchObject({ '*': 'allow', '*.env': 'deny', '*.env.*': 'deny' })
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
