// `wl launch`: plans, drafts and records prepare-launch.
import { readFileSync } from 'node:fs'
import { FlowEngine } from '../flow/engine.js'
import type { LaunchDraft } from '../launch/contracts.js'
import type { MeasurementPlan } from '../launch/measurement.js'
import draftSchema from '../launch/schemas/draft-v1.json' with { type: 'json' }
import measurementSchema from '../launch/schemas/measurement-v1.json' with { type: 'json' }
import { LaunchWorkflow } from '../launch/workflow.js'
import { StateStore } from '../state/store.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'
import { emitStep } from './presentation.js'

export function launchCommand(
  command: string,
  { positional, options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
) {
  const value = (key: string) => (typeof options[key] === 'string' ? options[key] : undefined)
  const read = (file: string) => {
    try {
      return JSON.parse(readFileSync(file, 'utf8')) as unknown
    } catch {
      throw new Error('Cannot read valid launch JSON; contents omitted')
    }
  }
  try {
    if (command === 'launch schema') {
      emitStep(
        command,
        {
          schema: 'wholeloop/launch-schema@1',
          measurement: measurementSchema,
          draft: draftSchema,
        },
        io,
        json,
        positional,
      )
      return EXIT.ok
    }
    const workflow = new LaunchWorkflow(new FlowEngine(new StateStore(), root))
    let payload: unknown
    if (command === 'launch begin') {
      if (positional.length > 1) throw new Error('Provide one shipping description')
      payload = workflow.begin({
        ...(value('--for') ? { subject: value('--for') as string } : {}),
        ...(positional[0] ? { input: positional[0] } : {}),
        ...(value('--owner') ? { owner: value('--owner') as string } : {}),
        ...(value('--measurement')
          ? { measurement: read(value('--measurement') ?? '') as MeasurementPlan }
          : {}),
      })
    } else {
      if (positional.length || !value('--for')) throw new Error('Provide --for <scope-id>')
      if (command === 'launch complete') {
        if (!value('--file')) throw new Error('Provide --file <launch-kit.json>')
        payload = workflow.complete(
          value('--for') ?? '',
          read(value('--file') ?? '') as LaunchDraft,
        )
      } else
        payload = {
          schema: 'wholeloop/launch-report@1',
          subject: value('--for'),
          context: workflow.context(value('--for') ?? ''),
          publication: workflow.publication(value('--for') ?? ''),
        }
    }
    emitStep(command, payload, io, json, positional)
    return payload &&
      typeof payload === 'object' &&
      'status' in payload &&
      payload.status === 'question'
      ? EXIT.input
      : EXIT.ok
  } catch (error) {
    throw new CliError(
      error instanceof Error ? error.message : 'Launch operation failed',
      EXIT.precondition,
    )
  }
}
