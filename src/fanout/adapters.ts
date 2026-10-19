import { isObject } from '../config/schema.js'

export interface HeadlessAdapter {
  id: string
  invocation(context: { repository: string; directory: string }): {
    command: string
    args: string[]
    env?: NodeJS.ProcessEnv
  }
  response(stdout: string, directory: string): string
}
/** These recipes are help-probed boundaries, not a claimed authenticated conformance pass. */
export function headlessAdapter(id: string): HeadlessAdapter {
  if (id === 'claude')
    return {
      id,
      invocation: ({ repository }) => ({
        command: 'claude',
        args: [
          '--add-dir',
          repository,
          '--print',
          '--output-format',
          'json',
          '--permission-mode',
          'dontAsk',
          '--permission-prompts',
          'none',
          '--tools',
          'Read,Glob,Grep',
          '--allowedTools',
          'Read,Glob,Grep',
          '--disallowedTools',
          'mcp__*',
          '--strict-mcp-config',
          '--mcp-config',
          '{"mcpServers":{}}',
          '--setting-sources',
          '',
          '--safe-mode',
          '--no-session-persistence',
        ],
      }),
      response: (stdout) => {
        const value: unknown = JSON.parse(stdout)
        if (!isObject(value) || value.is_error === true || typeof value.result !== 'string')
          throw new Error('No successful Claude final result')
        return value.result
      },
    }
  if (id === 'codex')
    return {
      id,
      invocation: ({ directory }) => ({
        command: 'codex',
        args: [
          '--ask-for-approval',
          'never',
          'exec',
          '--sandbox',
          'read-only',
          '--ephemeral',
          '--ignore-user-config',
          '--config',
          'mcp_servers={}',
          '--cd',
          directory,
          '--skip-git-repo-check',
          '--json',
          '-',
        ],
      }),
      response: (stdout) => {
        const events: unknown[] = stdout
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line))
        if (
          !events.some((event) => isObject(event) && event.type === 'turn.completed') ||
          events.some(
            (event) => isObject(event) && ['turn.failed', 'error'].includes(String(event.type)),
          )
        )
          throw new Error('No successful Codex turn')
        const messages = events.flatMap((event) =>
          isObject(event) &&
          event.type === 'item.completed' &&
          isObject(event.item) &&
          event.item.type === 'agent_message' &&
          typeof event.item.text === 'string'
            ? [event.item.text]
            : [],
        )
        const final = messages.at(-1)
        if (!final) throw new Error('No Codex final message')
        return final
      },
    }
  throw new Error(
    'Headless recipes currently support claude|codex; other adapters remain unimplemented',
  )
}
