import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import type { OperationCall, OperationResult, ProviderHost } from './operations.js'

/** A conservative single-query boundary, complemented by server-enforced read-only transactions. */
export function readOnlyStatement(sql: string): string {
  const tokens: string[] = []
  let index = 0
  while (index < sql.length) {
    const rest = sql.slice(index)
    if (/^\s/.test(rest)) {
      index++
      continue
    }
    if (rest.startsWith('--')) {
      index += rest.indexOf('\n') < 0 ? rest.length : rest.indexOf('\n')
      continue
    }
    if (rest.startsWith('/*')) {
      let depth = 1
      index += 2
      while (index < sql.length && depth) {
        if (sql.slice(index, index + 2) === '/*') {
          depth++
          index += 2
        } else if (sql.slice(index, index + 2) === '*/') {
          depth--
          index += 2
        } else index++
      }
      if (depth) throw new Error('Unterminated SQL comment')
      continue
    }
    const quote = sql[index]
    if (quote === "'" || quote === '"') {
      index++
      let closed = false
      while (index < sql.length) {
        if (sql[index] === '\\')
          throw new Error(
            'Backslash escapes are unsupported in source SQL; use standard quoted values',
          )
        if (sql[index] === quote) {
          if (sql[index + 1] === quote) {
            index += 2
            continue
          }
          index++
          closed = true
          break
        }
        index++
      }
      if (!closed) throw new Error('Unterminated SQL quoted value')
      tokens.push('quoted')
      continue
    }
    if (rest.startsWith('\\') || /^\$(?:[a-zA-Z_][a-zA-Z0-9_]*)?\$/.test(rest))
      throw new Error('psql commands and dollar-quoted SQL are unsupported in source queries')
    const word = /^[a-zA-Z_][a-zA-Z0-9_$]*/.exec(rest)?.[0]
    if (word) {
      tokens.push(word.toLowerCase())
      index += word.length
    } else {
      tokens.push(sql[index] ?? '')
      index++
    }
  }
  if (tokens.at(-1) === ';') tokens.pop()
  if (!['select', 'with'].includes(tokens[0] ?? '') || tokens.includes(';'))
    throw new Error('Provide exactly one SELECT or read-only WITH query')
  const forbidden = new Set([
    'insert',
    'update',
    'delete',
    'merge',
    'into',
    'copy',
    'call',
    'do',
    'execute',
    'set',
    'reset',
    'begin',
    'start',
    'commit',
    'end',
    'rollback',
    'savepoint',
    'release',
    'abort',
    'prepare',
    'deallocate',
    'create',
    'alter',
    'drop',
    'truncate',
    'grant',
    'revoke',
    'vacuum',
    'analyze',
    'refresh',
    'lock',
    'discard',
  ])
  if (tokens.some((token) => forbidden.has(token)))
    throw new Error('Source SQL cannot mutate data or control its transaction')
  // Original bytes remain pinned; a newline keeps a trailing line comment from
  // swallowing the wrapper's terminator or rollback.
  return sql.trim()
}

/** psql authentication stays with libpq/host credentials; only a non-secret service name enters argv. */
export class PostgreSqlSource implements ProviderHost {
  constructor(
    readonly service: string,
    readonly binary = 'psql',
  ) {
    if (!/^[a-zA-Z0-9_.-]+$/.test(service))
      throw new Error('Provide a configured libpq service name, never a credential URI')
  }

  async invoke(call: OperationCall): Promise<OperationResult> {
    if (
      call.provider !== 'postgresql' ||
      call.operation !== 'source.bi.query' ||
      typeof call.args.query !== 'string'
    )
      throw new Error('Unsupported PostgreSQL source operation')
    const query = readOnlyStatement(call.args.query)
    const response = spawnSync(
      this.binary,
      [
        '-X',
        '-w',
        '--set',
        'ON_ERROR_STOP=1',
        '--csv',
        '-q',
        '--dbname',
        `service=${this.service}`,
      ],
      {
        input: `BEGIN READ ONLY;\nSET LOCAL statement_timeout = '30s';\n${query}\n;\nROLLBACK;\n`,
        encoding: 'utf8',
        timeout: 30_000,
        maxBuffer: 65_536,
      },
    )
    if (response.error || response.status !== 0)
      throw new Error(
        'PostgreSQL query failed; inspect access and read-only permissions in the host',
      )
    return {
      status: 'succeeded',
      ref: `postgresql:${this.service}:${createHash('sha256').update(query).digest('hex')}`,
      body: response.stdout,
      complete: true,
    }
  }
}
