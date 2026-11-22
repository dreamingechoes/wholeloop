// `wl verify`: suite plans and execution for verify-works.

import { readFileSync } from 'node:fs'
import { BuildWorkflow } from '../build/workflow.js'
import { parseCriteria } from '../definition/criteria.js'
import { chosenImage, executionChoice, NOT_ISOLATED } from '../execution/choice.js'
import { DockerUnavailableError } from '../execution/docker.js'
import { FlowEngine } from '../flow/engine.js'
import { StateStore } from '../state/store.js'
import { namedSuiteHashes, SuiteStartError } from '../verification/start.js'
import { runSuite, suiteResultV2 } from '../verification/suite.js'
import { VerificationWorkflow } from '../verification/workflow.js'
import { checkRigor } from '../workers/rigor.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { roundOverrides } from './gate.js'
import { EXIT, type Io } from './io.js'
import { emitStep } from './presentation.js'

export function verificationCommand(
  command: string,
  { positional, options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
) {
  const value = (key: string) => (typeof options[key] === 'string' ? options[key] : undefined)
  try {
    if (positional.length > 1) throw new CliError('Provide one branch or PR reference')
    const engine = new FlowEngine(new StateStore(), root)
    const workflow = new VerificationWorkflow(engine)
    let payload:
      | ReturnType<VerificationWorkflow['begin']>
      | { schema: string; receipt: unknown }
      | Record<string, unknown>
    if (command === 'verify begin') {
      const input = positional[0]
      payload = workflow.begin({
        ...(value('--for') ? { subject: value('--for') as string } : {}),
        ...(value('--branch')
          ? { branch: value('--branch') as string }
          : input && !/^https?:\/\//i.test(input)
            ? { branch: input }
            : {}),
        ...(input && /^https?:\/\//i.test(input) ? { pr: input } : {}),
        ...(value('--owner') ? { owner: value('--owner') as string } : {}),
        ...(value('--by') ? { by: value('--by') as string } : {}),
        ...(value('--base') ? { base: value('--base') as string } : {}),
        ...(value('--criteria')
          ? { criteria: parseCriteria(JSON.parse(readFileSync(value('--criteria') ?? '', 'utf8'))) }
          : {}),
        ...(value('--rounds')
          ? { rounds: roundOverrides(value('--rounds') ?? '').verify ?? Number.NaN }
          : {}),
        ...(value('--rigor') ? { rigor: checkRigor(value('--rigor')) } : {}),
      })
    } else {
      if (positional.length || !value('--for')) throw new CliError('Provide --for <id>')
      payload = {
        schema: 'wholeloop/verify-complete@1',
        receipt: workflow.complete(value('--for') ?? ''),
      }
    }
    // Shown before the step starts: where its project code will run. Docker is not queried here.
    if (command === 'verify begin') payload = { ...payload, projectCode: projectCode(root, engine) }
    emitStep(command, payload, io, json, positional)
    return 'status' in payload && payload.status === 'question' ? EXIT.input : EXIT.ok
  } catch (error) {
    if (error instanceof CliError) throw error
    throw new CliError(
      error instanceof Error ? error.message : 'Verification operation failed',
      EXIT.precondition,
    )
  }
}

function projectCode(root: string, engine: FlowEngine) {
  const choice = executionChoice(root)
  return choice.isolation === 'host'
    ? { ...choice, note: NOT_ISOLATED }
    : { ...choice, image: chosenImage(engine.configuration().values.answers) ?? null }
}

export async function verificationSuiteCommand(
  { positional, options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
) {
  const value = (key: string) => (typeof options[key] === 'string' ? options[key] : undefined)
  if (positional.length || !value('--for') || !value('--run') || !value('--round'))
    throw new CliError('Provide --for, --run and --round')
  const version = value('--result-version') ?? (json ? '1' : '2')
  if (!['1', '2'].includes(version)) throw new CliError('Use --result-version 1 or 2', EXIT.input)
  const workflow = new BuildWorkflow(new FlowEngine(new StateStore(), root))
  let payload: Awaited<ReturnType<typeof runSuite>>
  try {
    payload = await runSuite(
      workflow.engineFor(value('--for') ?? ''),
      value('--for') ?? '',
      value('--run') ?? '',
      Number(value('--round')),
      {
        ...(value('--commands') ? { refs: JSON.parse(value('--commands') ?? '') as string[] } : {}),
        ...(value('--timeout') ? { timeoutMs: Number(value('--timeout')) } : {}),
        ...(value('--execution') ? { execution: value('--execution') as string } : {}),
        ...(value('--image') ? { image: value('--image') as string } : {}),
      },
    )
  } catch (error) {
    // Refused before any intent: the round is untouched and both remedies are named.
    if (error instanceof DockerUnavailableError)
      throw new CliError(error.message, EXIT.precondition)
    if (!(error instanceof SuiteStartError)) throw error
    if (version === '1') throw new CliError(error.message, EXIT.precondition)
    emitStep(
      'verify suite',
      {
        schema: 'wholeloop/verify-suite@2',
        subject: value('--for'),
        run: error.failure.run,
        round: error.failure.round,
        status: 'unavailable',
        roundSpent: false,
        result: null,
        output: [],
        findings: [],
        commands: namedSuiteHashes(error.failure.commands),
        cause: error.failure.cause,
        warnings: [error.message],
      },
      io,
      json,
      positional,
    )
    return EXIT.precondition
  }
  emitStep('verify suite', version === '2' ? suiteResultV2(payload) : payload, io, json, positional)
  return payload.result.status === 'passed' && payload.current ? EXIT.ok : EXIT.shape
}
