// `wl challenge`: plans challenger modes for a definition document.
import { readFileSync } from 'node:fs'
import { CHALLENGE_MODES, type ChallengeMode, challengePlan } from '../definition/challenge.js'
import { CRITERIA_SCHEMA } from '../definition/criteria.js'
import { FlowEngine } from '../flow/engine.js'
import type { Profile } from '../profile/presets.js'
import { scopeContext } from '../scopes/contract.js'
import { slicingContext } from '../slices/contract.js'
import { StateStore } from '../state/store.js'
import { workerModels } from '../workers/models.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'
import { emitStep } from './presentation.js'

export function challengeCommand(
  command: string,
  { positional, options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
): number {
  if (command === 'challenge schema') {
    if (positional.length) throw new CliError('challenge schema takes no arguments')
    emitStep(
      command,
      { schema: 'wholeloop/challenge-schema@1', criteriaSchema: CRITERIA_SCHEMA },
      io,
      json,
      positional,
    )
    return EXIT.ok
  }
  const mode = positional[0]
  const file = options['--file']
  if (
    positional.length !== 1 ||
    !CHALLENGE_MODES.includes(mode as ChallengeMode) ||
    typeof file !== 'string'
  )
    throw new CliError(
      'Provide problem|spec|criteria|scopes|slicing and --file <artifact>',
      EXIT.input,
    )
  const engine = new FlowEngine(new StateStore(), root)
  const subject = options['--for']
  if (
    typeof subject === 'string' &&
    engine.store.get(subject).kind !== (mode === 'slicing' ? 'scope' : 'initiative')
  )
    throw new CliError(mode === 'slicing' ? '--for expects a scope' : '--for expects an initiative')
  const selected = options['--challenge']
  if (
    selected !== undefined &&
    !['supportive', 'balanced', 'adversarial'].includes(String(selected))
  )
    throw new CliError('--challenge expects supportive|balanced|adversarial')
  const challenge = selected ?? (engine.config().profile as Profile).challenge
  const models = workerModels(engine)
  const plan = challengePlan(mode as ChallengeMode, readFileSync(file, 'utf8'), {
    challenge: challenge as Profile['challenge'],
    ...(models ? { models } : {}),
    ...(typeof subject === 'string'
      ? mode === 'slicing'
        ? { slicing: slicingContext(engine.store.events(), subject) }
        : { context: scopeContext(engine.store.events(), subject) }
      : {}),
  })
  emitStep(command, plan, io, json, positional)
  return plan.problems.length ? EXIT.shape : EXIT.ok
}
