// Gemini policy-engine rules for wholeloop's own launches. Gemini 0.67 ignores a system settings
// file that root does not own, so the read-only boundary is expressed as admin-tier policy instead.
import { stringify } from 'smol-toml'

/** Read-only built-ins in Gemini 0.67, plus the 0.2x search name kept for older pins. */
export const GEMINI_READ_TOOLS = [
  'read_file',
  'read_many_files',
  'list_directory',
  'glob',
  'grep_search',
  'search_file_content',
] as const

interface GeminiRule {
  toolName?: string | string[]
  mcpName?: string
  argsPattern?: string
  commandPrefix?: string
  decision: 'allow' | 'deny'
  priority: number
  denyMessage?: string
}

/**
 * Deny everything first, then allow exactly what the launch needs. A global deny
 * removes a tool from the model's view; in a non-interactive run an unmatched
 * call would ask and therefore be denied anyway. MCP tools are denied by server.
 */
function policy(allowed: GeminiRule[]) {
  const rules: GeminiRule[] = [
    {
      toolName: '*',
      decision: 'deny',
      priority: 100,
      denyMessage: 'wholeloop allows only the tools this launch needs.',
    },
    { toolName: '*', mcpName: '*', decision: 'deny', priority: 900 },
    ...allowed,
  ]
  return `${stringify({ rule: rules })}\n`
}

/** The headless observer reads and searches; it can write, run or delegate nothing. */
export function geminiReadOnlyPolicy() {
  return policy([{ toolName: [...GEMINI_READ_TOOLS], decision: 'allow', priority: 500 }])
}

const regex = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
/** Matches one exact path inside JSON-stringified arguments, so no prefix or sibling matches. */
function exactPath(path: string) {
  if (!path.startsWith('/') || /["\\\s]/.test(path))
    throw new Error('Gemini policy paths must be absolute, without quotes, backslashes or spaces')
  return `"file_path":"${regex(path)}"`
}

/**
 * The framing scenario reads freely, activates its installed skill, runs only the
 * checked launcher and writes only the draft, decision and review files. The
 * launcher runs as the command itself. Gemini 0.67 turns commandPrefix into a
 * pattern that must end at a space, a quote or the end of the command, splits
 * compound commands and checks every part, and downgrades redirections to an ask,
 * which a non-interactive run denies; nothing can ride along after the launcher.
 * A hand-written commandRegex is refused as a ReDoS risk and is never anchored.
 */
export function geminiFramingPolicy(input: { launcher: string; files: readonly string[] }) {
  exactPath(input.launcher)
  return policy([
    // update_topic only labels the session; denying it made the model retry it before
    // every step and spend a request each time (observed on 0.67.0).
    {
      toolName: [...GEMINI_READ_TOOLS, 'activate_skill', 'update_topic'],
      decision: 'allow',
      priority: 500,
    },
    ...input.files.map((path) => ({
      toolName: ['write_file', 'replace'],
      argsPattern: exactPath(path),
      decision: 'allow' as const,
      priority: 600,
    })),
    {
      toolName: 'run_shell_command',
      commandPrefix: input.launcher,
      decision: 'allow',
      priority: 600,
    },
  ])
}
