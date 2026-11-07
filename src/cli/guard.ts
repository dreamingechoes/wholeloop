// `wl guard`: answers client hook events with a decision, never echoing their input.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { isObject } from '../config/schema.js'
import {
  type GuardDecision,
  guardCommit,
  guardPush,
  guardStateWrite,
  guardTool,
  type PushUpdate,
} from '../guards/assess.js'
import { gitGuards } from '../guards/git-hooks.js'
import { normalizeTool } from '../guards/normalize.js'
import { ITEM_ID } from '../state/events.js'
import { StateStore } from '../state/store.js'
import type { parseArguments } from './arguments.js'
import type { Io } from './io.js'

/** Bound transient native input; never include its contents in errors or reports. */
export function hookInput(): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let bytes = 0
    const finish = (error?: Error) => {
      clearTimeout(timer)
      process.stdin.removeListener('data', data)
      process.stdin.removeListener('end', end)
      process.stdin.removeListener('error', fail)
      process.stdin.pause()
      if (error) reject(error)
    }
    const fail = () => finish(new Error('Hook input unavailable'))
    const data = (chunk: Buffer) => {
      bytes += chunk.length
      if (bytes > 2 * 1024 * 1024) finish(new Error('Hook input exceeds its limit'))
      else chunks.push(chunk)
    }
    const end = () => {
      finish()
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new Error('Invalid hook input'))
      }
    }
    const timer = setTimeout(() => finish(new Error('Hook input timed out')), 5000)
    process.stdin.on('data', data)
    process.stdin.once('end', end)
    process.stdin.once('error', fail)
  })
}
export async function guardCommand(
  path: string,
  { positional, options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
) {
  if (path === 'guard hooks') {
    const action = positional[0]
    if (positional.length !== 1 || !['install', 'uninstall', 'status'].includes(action ?? ''))
      throw new Error('Choose guard hooks install|uninstall|status')
    const result = gitGuards(
      action as 'install' | 'uninstall' | 'status',
      typeof options['--repo'] === 'string' ? options['--repo'] : root,
      action === 'install' ? readFileSync(fileURLToPath(import.meta.url), 'utf8') : undefined,
      typeof options['--store'] === 'string' ? options['--store'] : undefined,
    )
    io.out(JSON.stringify(result, null, json ? undefined : 2))
    return ['broken', 'configuration-changed', 'changed'].includes(result.status) ? 3 : 0
  }
  let result: GuardDecision
  try {
    if (positional.length) throw new Error('Unexpected guard arguments')
    const cwd = typeof options['--repo'] === 'string' ? options['--repo'] : root
    const subject = options['--for'] ?? process.env.WL_SUBJECT
    if (subject !== undefined && (typeof subject !== 'string' || !ITEM_ID.test(subject)))
      throw new Error('Invalid guard subject')
    const readEvents = () =>
      new StateStore(
        typeof options['--store'] === 'string' ? options['--store'] : undefined,
      ).events()
    if (path === 'guard before-tool') {
      if (!options['--stdin']) throw new Error('Native guard needs stdin')
      result = guardTool(normalizeTool(await hookInput(), cwd, subject), readEvents)
    } else if (path === 'guard git-commit') result = guardCommit(cwd, readEvents(), subject)
    else if (path === 'guard state-write') {
      if (typeof options['--path'] !== 'string') throw new Error('State guard needs a path')
      result = guardStateWrite(options['--path'])
    } else {
      if (path !== 'guard git-push' || !options['--stdin'])
        throw new Error('Push guard needs stdin')
      const input = await hookInput()
      if (
        !isObject(input) ||
        typeof input.remote !== 'string' ||
        !input.remote ||
        input.remote.startsWith('-') ||
        /[\0\r\n]/.test(input.remote) ||
        typeof input.url !== 'string' ||
        !Array.isArray(input.updates) ||
        input.updates.length > 256 ||
        input.updates.some(
          (row) =>
            !isObject(row) ||
            ['localRef', 'localSha', 'remoteRef', 'remoteSha'].some(
              (key) => typeof row[key] !== 'string',
            ),
        )
      )
        throw new Error('Invalid push input')
      result = guardPush(
        {
          cwd,
          remote: input.remote,
          url: input.url,
          updates: input.updates as PushUpdate[],
          ...(subject ? { subject } : {}),
        },
        readEvents(),
      )
    }
  } catch {
    result = {
      schema: 'wholeloop/guard@1',
      decision: 'deny',
      policies: ['guard-unavailable'],
      reasons: [
        'Guard context is invalid or unavailable; preserve the operation and inspect configuration/journal before retrying. Payload contents are omitted.',
      ],
    }
  }
  io.out(JSON.stringify(result, null, json ? undefined : 2))
  return result.decision === 'allow' ? 0 : 2
}
