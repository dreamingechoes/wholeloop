// Rejects rendered instructions that require an interface the native role configuration denies.

import { parse as toml } from 'smol-toml'
import { isObject } from '../config/schema.js'
import { frontmatter } from '../harness/frontmatter.js'

const TOOLS = {
  read: [
    'Read',
    'Glob',
    'Grep',
    'read',
    'glob',
    'grep',
    'view',
    'read_file',
    'read_many_files',
    'list_directory',
    'search_file_content',
    'view_file',
    'grep_search',
  ],
  shell: ['Bash', 'Shell', 'bash', 'exec_command', 'run_shell_command', 'run_command'],
  write: [
    'Write',
    'Edit',
    'NotebookEdit',
    'StrReplace',
    'edit',
    'create',
    'apply_patch',
    'write_file',
    'replace',
    'write_to_file',
    'replace_file_content',
    'multi_replace_file_content',
  ],
  web: [
    'WebFetch',
    'WebSearch',
    'web_fetch',
    'webfetch',
    'websearch',
    'google_web_search',
    'search_web',
    'read_url_content',
  ],
} as const
type Tool = keyof typeof TOOLS

export function renderedRoleTools(content: string) {
  const header = frontmatter(content)
  const data = header ?? toml(content)
  const body = header
    ? content.replace(/^---\n[\s\S]*?\n---\n/, '')
    : String(data.developer_instructions ?? '')
  const allowed: Partial<Record<Tool, boolean>> = {}
  let permits: (name: string) => boolean | undefined = () => undefined
  if (!header) {
    // A Codex role cannot declare its own file sandbox; inherited write/web tools stay unknown.
    allowed.shell = !isObject(data.features) || data.features.shell_tool !== false
    permits = (name) => (TOOLS.shell.some((tool) => tool === name) ? allowed.shell : undefined)
  } else if (typeof data.readonly === 'boolean') {
    allowed.read = true
    allowed.write = !data.readonly
    allowed.shell = !data.readonly
  } else {
    const tools = Array.isArray(data.tools)
      ? data.tools.map(String)
      : typeof data.tools === 'string'
        ? data.tools.split(/,\s*/)
        : []
    const denied =
      typeof data.disallowedTools === 'string' ? data.disallowedTools.split(/,\s*/) : []
    const permission = isObject(data.permission) ? data.permission : undefined
    permits = (name) => {
      const setting = permission?.[name]
      return permission
        ? setting === 'allow' || (isObject(setting) && setting['*'] === 'allow')
        : tools.includes(name) && !denied.includes(name)
    }
    for (const [kind, names] of Object.entries(TOOLS))
      allowed[kind as Tool] = names.some((name) => permits(name) === true)
  }
  if (data.commandExecutionPolicy === 'off') allowed.shell = false
  return { body, allowed, permits }
}

export function roleToolProblems(content: string): string[] {
  const { body, allowed, permits } = renderedRoleTools(content)
  const required = new Set<Tool>()
  const exactDenied = new Set<Tool>()
  if (/\bwl\s+[a-z]|\bbin\/wl\.mjs\b/.test(body)) required.add('shell')
  if (/(?:^|\n|[.!?]\s+)Read\s+/.test(body)) required.add('read')
  for (const [kind, names] of Object.entries(TOOLS)) {
    const pattern = new RegExp(
      `\\b(?:[Cc]all|[Uu]se|[Ii]nvoke)\\s+(\u0060?)(${names.join('|')})\\b`,
      'g',
    )
    for (const match of body.matchAll(pattern)) {
      required.add(kind as Tool)
      const name = match[2] ?? ''
      // Unquoted generic words such as read remain abstract; named native tools must match exactly.
      if ((match[1] || /^[A-Z]|_/.test(name)) && permits(name) === false)
        exactDenied.add(kind as Tool)
    }
  }
  if (
    /(?:^|\n|[.!?]\s+)(?:Write|Edit|Create|Patch|Delete|Replace)\s+(?:the\s+|a\s+)?(?:file|code|artifact|source|result file)\b/.test(
      body,
    )
  )
    required.add('write')
  return [...required]
    .filter((kind) => allowed[kind] === false || exactDenied.has(kind))
    .map((kind) => `Instructions require the disabled ${kind} interface`)
}
