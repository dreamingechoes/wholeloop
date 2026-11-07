// `wl learn`: plans, challenges and records decide-next.
import { readFileSync } from 'node:fs'
import { FlowEngine } from '../flow/engine.js'
import type { IterationIdea, LearningChallenge, LearningOutcome } from '../learning/contracts.js'
import type { ReportedLearning } from '../learning/evidence.js'
import schema from '../learning/schemas/events-v1.json' with { type: 'json' }
import { LearningWorkflow } from '../learning/workflow.js'
import { StateStore } from '../state/store.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'

export function learningCommand(
  command: string,
  { positional, options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
) {
  const value = (key: string) => (typeof options[key] === 'string' ? options[key] : undefined)
  const read = (file: string): unknown => {
    try {
      return JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      throw new Error('Cannot read valid learning JSON; contents omitted')
    }
  }
  if (positional.length > (['learn begin', 'learn decide'].includes(command) ? 1 : 0))
    throw new CliError('Unexpected learning argument')
  if (command === 'learn schema') {
    io.out(
      JSON.stringify({
        schema: 'wholeloop/learning-schema@1',
        challenge: schema.properties['learn.challenged'].properties.challenge,
        reported: schema.properties['learn.planned'].properties.evidence.properties.reported,
        iteration: {
          ...schema.properties['learn.decided'].properties.iteration,
          required: ['title', 'problem', 'audience', 'impact'],
        },
      }),
    )
    return EXIT.ok
  }
  const subject = value('--for')
  if (command !== 'learn begin' && !subject) throw new CliError('Provide --for <scope-id>')
  const workflow = new LearningWorkflow(new FlowEngine(new StateStore(), root))
  let payload: unknown
  if (command === 'learn begin')
    payload = workflow.begin({
      ...(subject ? { subject } : {}),
      ...(positional[0] ? { input: positional[0] } : {}),
      ...(value('--owner') ? { owner: value('--owner') as string } : {}),
      ...(value('--leaning') ? { leaning: value('--leaning') as LearningOutcome } : {}),
      ...(value('--reported')
        ? { reported: read(value('--reported') ?? '') as ReportedLearning }
        : {}),
    })
  else if (command === 'learn challenge') {
    if (!value('--file')) throw new Error('Provide --file <counterargument.json>')
    payload = workflow.challenge(subject ?? '', read(value('--file') ?? '') as LearningChallenge)
  } else if (command === 'learn decide') {
    if (!positional[0]) throw new Error('Choose keep|iterate|kill|unflag')
    payload = {
      schema: 'wholeloop/learning-decision@1',
      ...workflow.decide(subject ?? '', {
        outcome: positional[0] as LearningOutcome,
        basis: value('--basis') ?? '',
        by: value('--by') ?? '',
        reason: value('--reason') ?? '',
        acknowledgedUnknowns: JSON.parse(value('--ack') ?? '[]') as string[],
        ...(value('--iteration')
          ? { iteration: read(value('--iteration') ?? '') as IterationIdea }
          : {}),
      }),
    }
  } else if (command === 'learn complete')
    payload = { schema: 'wholeloop/learning-complete@1', ...workflow.complete(subject ?? '') }
  else payload = workflow.report(subject ?? '')
  io.out(JSON.stringify(payload, null, json ? undefined : 2))
  return payload &&
    typeof payload === 'object' &&
    'status' in payload &&
    payload.status === 'question'
    ? EXIT.input
    : EXIT.ok
}
