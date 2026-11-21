// Limits personal guidance to the executing client's declared skill locations.
import { existsSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { currentClientAttribution } from '../state/attribution-context.js'

export const GUIDANCE_CLIENTS = [
  'codex',
  'claude',
  'opencode',
  'copilot',
  'gemini',
  'cursor',
  'antigravity',
] as const
export function guidanceClient(): string | undefined {
  return currentClientAttribution()?.client
}

export function personalFolders(
  home: string,
  client?: string,
  includeOtherClients = false,
  env: NodeJS.ProcessEnv = {},
) {
  if (client && !GUIDANCE_CLIENTS.includes(client as (typeof GUIDANCE_CLIENTS)[number]))
    throw new Error('Unknown guidance client')
  const directory = (value: string | undefined, fallback: string) =>
    value && isAbsolute(value) ? value : fallback
  const folders: Record<string, string[]> = {
    codex: [
      join(home, '.agents/skills'),
      join(directory(env.CODEX_HOME, join(home, '.codex')), 'skills'),
    ],
    claude: [join(directory(env.CLAUDE_CONFIG_DIR, join(home, '.claude')), 'skills')],
    opencode: [
      join(home, '.opencode/skills'),
      join(
        directory(
          env.OPENCODE_CONFIG_DIR,
          join(directory(env.XDG_CONFIG_HOME, join(home, '.config')), 'opencode'),
        ),
        'skills',
      ),
    ],
    copilot: [
      join(home, '.github/skills'),
      join(directory(env.COPILOT_HOME, join(home, '.copilot')), 'skills'),
    ],
    gemini: [join(directory(env.GEMINI_CLI_HOME, home), '.gemini/skills')],
    cursor: [join(home, '.cursor/skills')],
    antigravity: [join(home, '.agents/skills'), join(home, '.gemini/antigravity-cli/plugins')],
  }
  const current = client ? (folders[client] ?? []) : []
  const present = new Map<string, boolean>()
  const exists = (folder: string) => {
    if (!present.has(folder)) present.set(folder, existsSync(folder))
    return present.get(folder)
  }
  const otherClients = Object.entries(folders).flatMap(([target, roots]) =>
    target === client
      ? []
      : roots
          .filter((folder) => !current.includes(folder) && exists(folder))
          .map((path) => ({ client: target, path, label: 'configured for another client' })),
  )
  return {
    current,
    starts: includeOtherClients
      ? [...new Set([...current, ...Object.values(folders).flat()])]
      : current,
    otherClients,
  }
}
