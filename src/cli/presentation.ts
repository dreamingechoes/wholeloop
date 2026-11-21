// Renders structured step results before serialization, preserving one output and no extra reads.
import { isObject } from '../config/schema.js'
import { commandText } from '../display/commands.js'
import { isStepCommand, stepDisplay } from '../display/step.js'
import type { parseArguments } from './arguments.js'
import type { Io } from './io.js'

export function displayArguments(parsed: ReturnType<typeof parseArguments>): readonly string[] {
  return [
    ...parsed.positional,
    ...(typeof parsed.options['--gate'] === 'string' ? [parsed.options['--gate']] : []),
  ]
}

export function displayPayload(
  command: string,
  payload: Record<string, unknown>,
  args: readonly string[] = [],
) {
  return isStepCommand(command)
    ? { ...payload, display: stepDisplay(command, payload, args) }
    : payload
}

export function emitStep(
  command: string,
  payload: unknown,
  io: Io,
  json: boolean,
  args: readonly string[] = [],
): void {
  if (!isStepCommand(command)) {
    if (command === 'next' && isObject(payload) && isObject(payload.contract)) {
      const display = stepDisplay('step begin', payload.contract, [
        String(payload.contract.step ?? ''),
      ])
      io.out(
        json
          ? JSON.stringify({ ...payload, contract: { ...payload.contract, display } })
          : display.text,
      )
      return
    }
    io.out(json ? JSON.stringify(payload) : commandText(command, payload))
    return
  }
  if (
    !isObject(payload) ||
    typeof payload.schema !== 'string' ||
    !/^wholeloop\/[a-z][a-z0-9-]*@[1-9]\d*$/.test(payload.schema)
  )
    throw new Error('Step presentation requires a versioned command result')
  const display = stepDisplay(command, payload, args)
  io.out(json ? JSON.stringify({ ...payload, display }) : display.text)
}

export const emitCommand = emitStep
