// `wl pr`: plans, tests and publishes draft pull requests.
import { readFileSync } from 'node:fs'
import { FlowEngine } from '../flow/engine.js'
import { CliCodehostHost } from '../pull-requests/codehost.js'
import { PullRequestWorkflow } from '../pull-requests/workflow.js'
import { StateStore } from '../state/store.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'
import { emitStep } from './presentation.js'

export async function pullRequestCommand(
  command: string,
  { positional, options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
) {
  const value = (key: string) => (typeof options[key] === 'string' ? options[key] : undefined)
  const engine = new FlowEngine(new StateStore(), root)
  const workflow = new PullRequestWorkflow(engine)
  if (positional.length > (command === 'pr prepare' ? 1 : 0))
    throw new CliError('Unexpected PR argument')
  const subject = value('--for')
  if (command !== 'pr prepare' && !subject) throw new CliError('Provide --for <id>')
  let payload: unknown
  if (command === 'pr prepare')
    payload = workflow.prepare({
      ...(subject ? { subject } : {}),
      ...(positional[0] ? { branch: positional[0] } : {}),
      ...(value('--base') ? { base: value('--base') as string } : {}),
      ...(value('--owner') ? { owner: value('--owner') as string } : {}),
      ...(value('--title') ? { title: value('--title') as string } : {}),
      ...(value('--provider') ? { provider: value('--provider') as string } : {}),
      ...(value('--remote') ? { remote: value('--remote') as string } : {}),
      ...(value('--body-file') ? { body: readFileSync(value('--body-file') ?? '', 'utf8') } : {}),
    })
  else if (command === 'pr tested')
    payload = workflow.tested(subject ?? '', value('--by') ?? '', value('--note') ?? '')
  else {
    const context = workflow.context(subject ?? '')
    const host = new CliCodehostHost(context.root)
    if (command === 'pr reconcile') {
      if (!value('--url')) throw new CliError('Provide the observed --url to reconcile')
      payload = await workflow.reconcile(subject ?? '', value('--url') ?? '', host)
    } else payload = await workflow.publish(subject ?? '', host)
  }
  emitStep(command, payload, io, json, positional)
  return payload &&
    typeof payload === 'object' &&
    'status' in payload &&
    payload.status === 'question'
    ? EXIT.input
    : EXIT.ok
}
