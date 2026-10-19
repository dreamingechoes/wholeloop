import { readFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { isObject } from '../config/schema.js'
import type { EnvironmentWrite } from '../environment/contracts.js'
import { EnvironmentLedger } from '../environment/ledger.js'
import { StateStore } from '../state/store.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'

export function environmentCommand(
  command: string,
  { positional, options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
) {
  const subject = options['--for']
  if (positional.length || typeof subject !== 'string') throw new CliError('Provide --for <id>')
  const ledger = new EnvironmentLedger(new StateStore())
  try {
    let payload: ReturnType<EnvironmentLedger['declare']> | ReturnType<EnvironmentLedger['report']>
    if (command === 'env declare') {
      if (typeof options['--file'] !== 'string')
        throw new Error('Provide --file <non-secret-declaration.json>')
      let input: unknown
      try {
        input = JSON.parse(readFileSync(options['--file'], 'utf8'))
      } catch {
        throw new Error('Cannot read a valid environment declaration; contents omitted')
      }
      if (
        isObject(input) &&
        isObject(input.undo) &&
        typeof input.undo.cwd === 'string' &&
        !isAbsolute(input.undo.cwd)
      )
        input.undo.cwd = resolve(root, input.undo.cwd)
      payload = ledger.declare(subject, input as EnvironmentWrite)
    } else payload = ledger.report(subject)
    io.out(json ? JSON.stringify(payload) : payload.receipt)
    return EXIT.ok
  } catch (error) {
    throw new CliError(
      error instanceof Error ? error.message : 'Environment ledger operation failed',
      EXIT.precondition,
    )
  }
}
