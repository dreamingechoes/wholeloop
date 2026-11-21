// `wl step`: begins, plans, completes and skips steps.
import { readFileSync } from 'node:fs'
import { isObject } from '../config/schema.js'
import { FlowEngine } from '../flow/engine.js'
import type { FrameOutcome } from '../framing/contract.js'
import { StateStore } from '../state/store.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'

export function flowCommand(
  command: string,
  { positional, options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
): number {
  const value = (key: string) => (typeof options[key] === 'string' ? options[key] : undefined)
  const require = (input: string | undefined, name: string): string => {
    if (!input) throw new CliError(`Provide ${name}`, EXIT.input)
    return input
  }
  if (positional.length > (command === 'step plan' ? 0 : 1))
    throw new CliError(`Too many arguments for ${command}`)
  try {
    const noGo = value('--no-go')
    if (noGo && !['dropped', 'on-hold'].includes(noGo))
      throw new CliError('--no-go must be dropped or on-hold')
    if (!noGo && (value('--reason') || value('--reopen')) && command === 'step complete')
      throw new CliError('--reason and --reopen require --no-go')
    const engine = new FlowEngine(new StateStore(), root)
    let payload: unknown
    let code: number = EXIT.ok
    if (command === 'answer') {
      const answer = require(positional[0], 'qid=value')
      const equals = answer.indexOf('=')
      if (equals < 1) throw new CliError('Expected qid=value')
      const scope = value('--remember') ?? 'run'
      payload = engine.answer(answer.slice(0, equals), answer.slice(equals + 1), {
        scope,
        ...(value('--client') ? { client: value('--client') as string } : {}),
        ...(options['--include-other-clients'] ? { includeOtherClients: true } : {}),
        ...(value('--for') ? { subject: value('--for') as string } : {}),
        ...(value('--run') ? { run: value('--run') as string } : {}),
        ...(value('--by') ? { by: value('--by') as string } : {}),
        ...(value('--basis') ? { basis: value('--basis') as string } : {}),
      })
    } else if (command === 'step plan') payload = engine.plan(require(value('--for'), '--for <id>'))
    else {
      const name = require(positional[0], 'a step name')
      if (command === 'step begin') {
        const mode = value('--mode') ?? 'standalone'
        if (mode !== 'standalone' && mode !== 'flow')
          throw new CliError('--mode must be standalone or flow')
        const result = engine.begin(name, {
          ...(value('--profile') ? { profile: parseProfile(value('--profile') ?? '') } : {}),
          mode,
          ...(value('--run') ? { run: value('--run') as string } : {}),
          ...(value('--client') ? { client: value('--client') as string } : {}),
          ...(options['--include-other-clients'] ? { includeOtherClients: true } : {}),
          ...(value('--for') ? { subject: value('--for') as string } : {}),
          ...(value('--parent') ? { parent: value('--parent') as string } : {}),
          ...(value('--from') ? { from: value('--from') as string } : {}),
          ...(value('--impact') ? { impact: value('--impact') as string } : {}),
          ...(value('--input') ? { input: value('--input') as string } : {}),
          ...(value('--owner') ? { owner: value('--owner') as string } : {}),
        })
        payload = result.payload
        code = result.code
      } else if (command === 'step skip')
        payload = engine.skip(
          name,
          require(value('--for'), '--for <id>'),
          require(value('--reason'), '--reason'),
        )
      else
        payload = engine.complete(
          name,
          require(value('--for'), '--for <id>'),
          readFileSync(require(value('--artifact'), '--artifact <file>'), 'utf8'),
          value('--no-go')
            ? {
                outcome: value('--no-go') as FrameOutcome['outcome'],
                reason: require(value('--reason'), '--reason'),
                ...(value('--reopen') ? { reopen: value('--reopen') as string } : {}),
              }
            : undefined,
        )
    }
    io.out(JSON.stringify(payload, null, json ? undefined : 2))
    return code
  } catch (error) {
    if (error instanceof CliError) throw error
    const message = error instanceof Error ? error.message : String(error)
    throw new CliError(
      message,
      /Unknown item|Missing item|outside git|locked|escapes/.test(message)
        ? EXIT.precondition
        : EXIT.shape,
    )
  }
}

function parseProfile(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value)
  if (!isObject(parsed)) throw new CliError('--profile must be a JSON object of profile dials')
  return parsed
}
