// Detects MCP servers and providers from client configuration without logging any value.
import { accessSync, constants, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, isAbsolute, join } from 'node:path'
import { parse as parseToml } from 'smol-toml'
import { isObject } from '../config/schema.js'
import type { Provider } from './manifest.js'

/** Strip comments outside strings; configuration values are never logged. */
export function parseJsonConfig(text: string): unknown {
  let clean = ''
  let quoted = false
  let escaped = false
  for (let index = 0; index < text.length; index++) {
    const char = text[index] ?? ''
    if (quoted) {
      clean += char
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') quoted = false
      continue
    }
    if (char === '"') {
      quoted = true
      clean += char
      continue
    }
    if (char === '/' && text[index + 1] === '/') {
      while (index < text.length && text[index] !== '\n') index++
      clean += '\n'
      continue
    }
    if (char === '/' && text[index + 1] === '*') {
      const end = text.indexOf('*/', index + 2)
      if (end < 0) throw new Error('Unterminated JSON comment')
      clean += ' '
      index = end + 1
      continue
    }
    clean += char
  }
  let json = ''
  quoted = false
  escaped = false
  for (let index = 0; index < clean.length; index++) {
    const char = clean[index] ?? ''
    if (!quoted && char === ',' && /^[\s]*[}\]]/.test(clean.slice(index + 1))) continue
    json += char
    if (escaped) escaped = false
    else if (quoted && char === '\\') escaped = true
    else if (char === '"') quoted = !quoted
  }
  return JSON.parse(json)
}

export interface McpDeclaration {
  target: string
  server: string
  file: string
  enabled: boolean
}
export function detectMcp(root: string, home = homedir(), env: NodeJS.ProcessEnv = process.env) {
  const configHome = env.XDG_CONFIG_HOME?.startsWith('/')
    ? env.XDG_CONFIG_HOME
    : join(home, '.config')
  const paths = [
    { target: 'cursor', file: join(home, '.cursor/mcp.json'), field: 'mcpServers' },
    { target: 'cursor', file: join(root, '.cursor/mcp.json'), field: 'mcpServers' },
    {
      target: 'antigravity',
      file: join(home, '.gemini/config/mcp_config.json'),
      field: 'mcpServers',
    },
    { target: 'antigravity', file: join(root, '.agents/mcp_config.json'), field: 'mcpServers' },
    { target: 'claude', file: join(home, '.claude.json'), field: 'mcpServers' },
    { target: 'claude', file: join(root, '.mcp.json'), field: 'mcpServers' },
    {
      target: 'codex',
      file: join(env.CODEX_HOME ?? join(home, '.codex'), 'config.toml'),
      field: 'mcp_servers',
    },
    { target: 'codex', file: join(root, '.codex/config.toml'), field: 'mcp_servers' },
    ...['opencode.json', 'opencode.jsonc'].flatMap((name) => [
      { target: 'opencode', file: join(configHome, 'opencode', name), field: 'mcp' },
      { target: 'opencode', file: join(root, name), field: 'mcp' },
    ]),
    {
      target: 'copilot',
      file: join(env.COPILOT_HOME ?? join(home, '.copilot'), 'mcp-config.json'),
      field: 'mcpServers',
    },
    { target: 'copilot', file: join(root, '.github/mcp.json'), field: 'mcpServers' },
    { target: 'copilot', file: join(root, '.mcp.json'), field: 'mcpServers' },
    ...(!env.GEMINI_CLI_HOME || isAbsolute(env.GEMINI_CLI_HOME)
      ? [
          {
            target: 'gemini',
            file: join(env.GEMINI_CLI_HOME || home, '.gemini/settings.json'),
            field: 'mcpServers',
          },
        ]
      : []),
    { target: 'gemini', file: join(root, '.gemini/settings.json'), field: 'mcpServers' },
  ]
  const declarations: McpDeclaration[] = []
  const problems: { file: string; message: string }[] = []
  if (env.GEMINI_CLI_HOME && !isAbsolute(env.GEMINI_CLI_HOME))
    problems.push({
      file: 'GEMINI_CLI_HOME',
      message: 'Gemini home override must be absolute; contents omitted',
    })
  for (const entry of paths) {
    let text: string
    try {
      text = readFileSync(entry.file, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        problems.push({
          file: entry.file,
          message: 'Cannot read MCP configuration; contents omitted',
        })
      continue
    }
    try {
      const data: unknown = entry.file.endsWith('.toml') ? parseToml(text) : parseJsonConfig(text)
      if (!isObject(data)) throw new Error('Expected configuration object')
      const servers = data[entry.field]
      if (servers !== undefined && !isObject(servers)) throw new Error('Expected server map')
      if (isObject(servers))
        for (const [server, config] of Object.entries(servers)) {
          if (!isObject(config)) throw new Error('Expected server configuration')
          declarations.push({
            target: entry.target,
            server,
            file: entry.file,
            enabled:
              config.enabled !== false &&
              config.disabled !== true &&
              (entry.target !== 'gemini' ||
                !isObject(data.mcp) ||
                ((!Array.isArray(data.mcp.excluded) || !data.mcp.excluded.includes(server)) &&
                  (!Array.isArray(data.mcp.allowed) || data.mcp.allowed.includes(server)))),
          })
        }
    } catch {
      problems.push({ file: entry.file, message: 'Invalid MCP configuration; contents omitted' })
    }
  }
  return { declarations, problems }
}

export function detectProvider(
  provider: Provider,
  declarations: readonly McpDeclaration[],
  path = process.env.PATH ?? '',
) {
  if (provider.access.local)
    return {
      kind: 'local',
      available: true,
      authenticated: false,
      evidence: 'Built-in external-store implementation',
    }
  if (provider.access.mcp) {
    const configured = declarations.filter(
      (entry) => entry.server === provider.access.mcp?.server && entry.enabled,
    )
    if (configured.length)
      return {
        kind: 'mcp',
        available: true,
        authenticated: false,
        evidence: 'Configuration found; tool discovery and authentication are unverified',
        declarations: configured,
      }
  }
  if (provider.access.cli?.binary === 'curl')
    return {
      kind: 'unavailable',
      available: false,
      authenticated: false,
      evidence:
        'A generic HTTP executable does not detect this service; configure its source, endpoint and host credentials explicitly',
    }
  if (provider.access.cli) {
    for (const directory of path.split(delimiter).filter(Boolean)) {
      try {
        accessSync(join(directory, provider.access.cli.binary), constants.X_OK)
        if (!statSync(join(directory, provider.access.cli.binary)).isFile()) continue
        return {
          kind: 'cli',
          available: true,
          authenticated: false,
          evidence: `Executable on PATH: ${provider.access.cli.binary}`,
        }
      } catch {
        /* Availability only; never execute a manifest's detection command. */
      }
    }
  }
  // A native draft/handoff does not establish access to the same manifest's remote sources.
  if (provider.access.native && !provider.access.mcp && !provider.access.cli)
    return {
      kind: 'native',
      available: true,
      authenticated: false,
      evidence: 'Host-native capability declaration; verify tools in the current CLI',
    }
  return {
    kind: 'unavailable',
    available: false,
    authenticated: false,
    evidence: 'No matching enabled MCP declaration or executable found',
  }
}
