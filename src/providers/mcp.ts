import { stringify as toml } from 'smol-toml'
import type { Provider } from './manifest.js'

export const MCP_TARGETS = [
  'claude',
  'codex',
  'opencode',
  'copilot',
  'gemini',
  'antigravity',
  'cursor',
] as const
export type McpTarget = (typeof MCP_TARGETS)[number]

/** Print a mergeable snippet; never read credentials or overwrite a client's config. */
export function renderMcp(provider: Provider, target: McpTarget) {
  const mcp = provider.access.mcp
  if (!mcp) throw new Error(`Provider ${provider.id} has no MCP installation recipe`)
  const recipe = mcp.install
  if ((target === 'copilot' || target === 'antigravity') && recipe.auth === 'header')
    throw new Error(
      'Remote headers do not expand verified environment references for this target; use OAuth or its native credential store',
    )
  const header = recipe.auth === 'header' ? recipe.token_env : undefined
  let config: Record<string, unknown>
  let destination: string
  if (target === 'cursor') {
    destination = '$HOME/.cursor/mcp.json'
    config = {
      mcpServers: {
        [mcp.server]:
          recipe.transport === 'http'
            ? {
                url: recipe.url,
                ...(header ? { headers: { Authorization: `Bearer \${env:${header}}` } } : {}),
              }
            : { type: 'stdio', command: recipe.command, args: recipe.args ?? [] },
      },
    }
  } else if (target === 'antigravity') {
    destination = '$HOME/.gemini/config/mcp_config.json'
    config = {
      mcpServers: {
        [mcp.server]:
          recipe.transport === 'http'
            ? { serverUrl: recipe.url }
            : { command: recipe.command, args: recipe.args ?? [] },
      },
    }
  } else if (target === 'gemini') {
    destination = '$HOME/.gemini/settings.json'
    config = {
      mcpServers: {
        [mcp.server]:
          recipe.transport === 'http'
            ? {
                httpUrl: recipe.url,
                // 0.27.0 requires explicit OAuth enablement; current clients also accept this documented field.
                ...(recipe.auth ? { oauth: { enabled: recipe.auth === 'oauth' } } : {}),
                ...(header ? { headers: { Authorization: `Bearer \${${header}}` } } : {}),
              }
            : { command: recipe.command, args: recipe.args ?? [] },
      },
    }
  } else if (target === 'codex') {
    destination = '$HOME/.codex/config.toml'
    config = {
      mcp_servers: {
        [mcp.server]:
          recipe.transport === 'http'
            ? { url: recipe.url, ...(header ? { bearer_token_env_var: header } : {}) }
            : { command: recipe.command, args: recipe.args ?? [] },
      },
    }
  } else if (target === 'opencode') {
    destination = '$XDG_CONFIG_HOME/opencode/opencode.json'
    config = {
      mcp: {
        [mcp.server]:
          recipe.transport === 'http'
            ? {
                type: 'remote',
                url: recipe.url,
                enabled: true,
                ...(recipe.auth === 'none' ? { oauth: false } : {}),
                ...(header ? { headers: { Authorization: `Bearer {env:${header}}` } } : {}),
              }
            : { type: 'local', command: [recipe.command, ...(recipe.args ?? [])], enabled: true },
      },
    }
  } else {
    destination = target === 'claude' ? '.mcp.json' : '$HOME/.copilot/mcp-config.json'
    config = {
      mcpServers: {
        [mcp.server]: {
          ...(recipe.transport === 'http'
            ? {
                type: 'http',
                url: recipe.url,
                ...(header ? { headers: { Authorization: `Bearer \${${header}}` } } : {}),
              }
            : { type: 'stdio', command: recipe.command, args: recipe.args ?? [] }),
          ...(target === 'copilot' ? { tools: ['*'] } : {}),
        },
      },
    }
  }
  return {
    schema: 'wholeloop/mcp-add@1',
    provider: provider.id,
    target,
    destination,
    format: target === 'codex' ? 'toml' : 'json',
    snippet: target === 'codex' ? toml(config) : `${JSON.stringify(config, null, 2)}\n`,
    applied: false,
  }
}
