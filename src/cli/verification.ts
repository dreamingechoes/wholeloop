// `wl verify`: suite plans and execution for verify-works.
import { readFileSync } from 'node:fs'
import { BuildWorkflow } from '../build/workflow.js'
import { parseCriteria } from '../definition/criteria.js'
import { FlowEngine } from '../flow/engine.js'
import { StateStore } from '../state/store.js'
import { runSuite } from '../verification/suite.js'
import { VerificationWorkflow } from '../verification/workflow.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { roundOverrides } from './gate.js'
import { EXIT, type Io } from './io.js'

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
    let payload: ReturnType<VerificationWorkflow['begin']> | { schema: string; receipt: unknown }
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
      })
    } else {
      if (positional.length || !value('--for')) throw new CliError('Provide --for <id>')
      payload = {
        schema: 'wholeloop/verify-complete@1',
        receipt: workflow.complete(value('--for') ?? ''),
      }
    }
    io.out(JSON.stringify(payload, null, json ? undefined : 2))
    return 'status' in payload && payload.status === 'question' ? EXIT.input : EXIT.ok
  } catch (error) {
    if (error instanceof CliError) throw error
    throw new CliError(
      error instanceof Error ? error.message : 'Verification operation failed',
      EXIT.precondition,
    )
  }
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
  const workflow = new BuildWorkflow(new FlowEngine(new StateStore(), root))
  const payload = await runSuite(
    workflow.engineFor(value('--for') ?? ''),
    value('--for') ?? '',
    value('--run') ?? '',
    Number(value('--round')),
    {
      ...(value('--commands') ? { refs: JSON.parse(value('--commands') ?? '') as string[] } : {}),
      ...(value('--timeout') ? { timeoutMs: Number(value('--timeout')) } : {}),
    },
  )
  io.out(JSON.stringify(payload, null, json ? undefined : 2))
  return payload.result.status === 'passed' && payload.current ? EXIT.ok : EXIT.shape
}
