// Adds checked package locations to an explicitly requested invocation without another process.

import { isObject } from '../config/schema.js'
import type { Io } from './io.js'
import { EXIT } from './io.js'

export interface AdapterContext {
  root: string
  target: string
  version: string
  source: string
  roles: Record<string, string>
}

export async function adapterInvocation(
  argv: readonly string[],
  io: Io,
  context: AdapterContext | undefined,
  action: (args: readonly string[], output: Io) => Promise<number>,
) {
  if (argv[0] !== '--with-context') return action(argv, io)
  if (!context || !argv.includes('--json')) {
    const code = EXIT.precondition
    const message =
      'Use --with-context before a JSON command through an unchanged packaged launcher'
    if (argv.includes('--json'))
      io.out(JSON.stringify({ schema: 'wholeloop/error@1', code, message }))
    else io.err(`wl: ${message}`)
    return code
  }
  return action(argv.slice(1), {
    ...io,
    out: (text) => {
      const result: unknown = JSON.parse(text)
      if (
        !isObject(result) ||
        typeof result.schema !== 'string' ||
        !/^wholeloop\/[a-z][a-z0-9-]*@[1-9][0-9]*$/.test(result.schema)
      )
        throw new Error('Adapter context requires a versioned JSON command result')
      io.out(JSON.stringify({ schema: 'wholeloop/adapter-invocation@1', context, result }))
    },
  })
}
