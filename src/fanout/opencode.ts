// OpenCode headless worker and its permission rules.
import { createHash } from 'node:crypto'
import { isAbsolute } from 'node:path'
import { isObject } from '../config/schema.js'
import type { HeadlessAdapter } from './adapters.js'

export const openCodeWorker: HeadlessAdapter = {
  id: 'opencode',
  invocation: ({ repository, directory }) => {
    // Native permissions have no documented escape for these wildcard characters.
    if (!isAbsolute(repository) || /[*?]/.test(repository))
      throw new Error('OpenCode inspection requires an absolute repository without wildcards')
    const agent = `wholeloop-inspector-${createHash('sha256').update(directory).digest('hex').slice(0, 16)}`
    const permission = {
      '*': 'deny',
      read: { '*': 'allow', '*.env': 'deny', '*.env.*': 'deny', '*.env.example': 'allow' },
      glob: 'allow',
      grep: 'allow',
      external_directory: { '*': 'deny', [repository]: 'allow', [`${repository}/**`]: 'allow' },
    }
    return {
      command: 'opencode',
      args: ['run', '--pure', '--format', 'json', '--dir', directory, '--agent', agent],
      env: {
        OPENCODE_CONFIG: undefined,
        OPENCODE_CONFIG_DIR: undefined,
        OPENCODE_CONFIG_CONTENT: JSON.stringify({
          autoupdate: false,
          share: 'disabled',
          snapshot: false,
          lsp: false,
          permission,
          agent: {
            [agent]: {
              description: 'Read-only wholeloop gate inspector',
              mode: 'primary',
              permission,
            },
          },
        }),
        OPENCODE_PERMISSION: JSON.stringify(permission),
        OPENCODE_DISABLE_AUTOUPDATE: 'true',
        OPENCODE_DISABLE_CLAUDE_CODE: 'true',
        OPENCODE_DISABLE_LSP_DOWNLOAD: 'true',
      },
    }
  },
  response: (stdout) => {
    const events: unknown[] = stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    if (events.some((event) => !isObject(event) || event.type === 'error'))
      throw new Error('No successful OpenCode turn')
    const finishes = events.filter((event) => isObject(event) && event.type === 'step_finish')
    const final = finishes.at(-1)
    if (
      !isObject(final) ||
      !isObject(final.part) ||
      final.part.reason !== 'stop' ||
      typeof final.sessionID !== 'string' ||
      !final.sessionID ||
      typeof final.part.messageID !== 'string' ||
      !final.part.messageID ||
      events.some((event) => isObject(event) && event.sessionID !== final.sessionID)
    )
      throw new Error('No completed OpenCode final step')
    const message = final.part.messageID
    const texts = events.flatMap((event) =>
      isObject(event) &&
      event.type === 'text' &&
      isObject(event.part) &&
      event.part.messageID === message &&
      typeof event.part.text === 'string' &&
      isObject(event.part.time) &&
      typeof event.part.time.end === 'number'
        ? [event.part.text]
        : [],
    )
    if (!texts.length || !texts.join('').trim()) throw new Error('No OpenCode final message')
    return texts.join('')
  },
}
