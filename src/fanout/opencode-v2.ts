import { createHash } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import { isObject } from '../config/schema.js'
import type { HeadlessAdapter } from './adapters.js'
import { openCodeWorker } from './opencode.js'

/** Decode one native presentation wrapper, never search prose for a plausible result. */
function finalText(text: string) {
  const trimmed = text.trim()
  if (!trimmed.startsWith('```')) return text
  const fence = /^```(?:json)?\r?\n([\s\S]+)\r?\n```$/.exec(trimmed)
  if (!fence?.[1] || !isObject(JSON.parse(fence[1])))
    throw new Error('Require exactly one JSON object in the OpenCode V2 final fence')
  return fence[1]
}

/** V2 uses a staged native config, not V1 flags or an undocumented legacy environment override. */
export const openCodeV2Worker: HeadlessAdapter = {
  ...openCodeWorker,
  invocation: ({ repository, directory }) => {
    if (![repository, directory].every(isAbsolute) || /[*?]/.test(repository))
      throw new Error('OpenCode inspection requires absolute paths without repository wildcards')
    const agent = `wholeloop-inspector-${createHash('sha256').update(directory).digest('hex').slice(0, 16)}`
    const permissions = [
      { action: '*', resource: '*', effect: 'deny' },
      { action: 'read', resource: '*', effect: 'allow' },
      { action: 'read', resource: '*.env', effect: 'deny' },
      { action: 'read', resource: '*.env.*', effect: 'deny' },
      { action: 'read', resource: '*.env.example', effect: 'allow' },
      { action: 'external_directory', resource: repository, effect: 'allow' },
      { action: 'external_directory', resource: `${repository}/*`, effect: 'allow' },
    ]
    // V2 grep permissions match the expression, not its search path. Keep only the
    // path-checked reader; directory reads provide discovery without an unbounded grep channel.
    const policy = {
      $schema: 'https://opencode.ai/config.json',
      snapshots: false,
      permissions,
      policies: [
        { action: 'integration.use', resource: 'mcp:*', effect: 'deny' },
        { action: 'integration.use', resource: 'skill:*', effect: 'deny' },
      ],
      agents: {
        [agent]: {
          description: 'Read-only wholeloop gate inspector',
          mode: 'primary',
          system:
            'Inspect only the repository named in the supplied read-only gate assignment. Follow its response schema and return one raw JSON object without Markdown or commentary. Do not inspect unrelated repositories or native configuration. Report unavailable when evidence cannot be observed.',
          permissions,
        },
      },
    }
    return {
      command: 'opencode',
      args: ['run', '--standalone', '--format', 'json', '--agent', agent],
      // The native noninteractive run did not discover this inspector from a project
      // config; an isolated global config is observed to load it without changing the user's files.
      files: new Map([
        ['.native-config/opencode/opencode.json' as const, `${JSON.stringify(policy)}\n`],
      ]),
      env: {
        OPENCODE_CONFIG: undefined,
        OPENCODE_CONFIG_DIR: undefined,
        OPENCODE_CONFIG_CONTENT: undefined,
        OPENCODE_PERMISSION: undefined,
        OPENCODE_DISABLE_AUTOUPDATE: 'true',
        OPENCODE_DISABLE_CLAUDE_CODE: 'true',
        XDG_CONFIG_HOME: join(directory, '.native-config'),
        XDG_STATE_HOME: join(directory, '.native-state'),
      },
    }
  },
  response: (stdout, directory) => {
    const events: unknown[] = stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    const last = events.at(-1)
    if (isObject(last) && last.type === 'step_finish')
      return finalText(openCodeWorker.response(stdout, directory))
    const index = events.findLastIndex((event) => isObject(event) && event.type === 'step_start')
    const start = events[index]
    if (
      !isObject(start) ||
      typeof start.sessionID !== 'string' ||
      !start.sessionID ||
      !isObject(start.part) ||
      start.part.type !== 'step-start' ||
      start.part.sessionID !== start.sessionID ||
      typeof start.part.messageID !== 'string' ||
      !start.part.messageID
    )
      throw new Error('No OpenCode V2 final step identity')
    const session = start.sessionID,
      message = start.part.messageID
    for (const event of events) {
      if (
        !isObject(event) ||
        event.type === 'error' ||
        event.sessionID !== session ||
        (isObject(event.part) && event.part.sessionID !== session)
      )
        throw new Error('Mixed or failed OpenCode V2 turn')
      if (
        event.type === 'tool_use' &&
        (!isObject(event.part) ||
          !isObject(event.part.state) ||
          !['completed', 'error'].includes(String(event.part.state.status)))
      )
        throw new Error('Unfinished OpenCode V2 tool')
    }
    // V2 omits the final step_finish in actual CLI output. The host calls this
    // parser only after a clean exit; require completed text in the last step too.
    const final = events.slice(index + 1)
    if (!final.length) throw new Error('No OpenCode V2 final text')
    const texts = final.map((event) => {
      if (
        !isObject(event) ||
        event.type !== 'text' ||
        !isObject(event.part) ||
        event.part.type !== 'text' ||
        event.part.messageID !== message ||
        typeof event.part.text !== 'string' ||
        !isObject(event.part.time) ||
        typeof event.part.time.start !== 'number' ||
        !Number.isFinite(event.part.time.start) ||
        typeof event.part.time.end !== 'number' ||
        !Number.isFinite(event.part.time.end) ||
        event.part.time.end < event.part.time.start
      )
        throw new Error('Incomplete OpenCode V2 final text')
      return event.part.text
    })
    if (!texts.join('').trim()) throw new Error('Empty OpenCode V2 final text')
    return finalText(texts.join(''))
  },
}
