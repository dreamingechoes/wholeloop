// `wl ramp`: plans, observes and records ramp-exposure decisions.
import { readFileSync } from 'node:fs'
import { FlowEngine } from '../flow/engine.js'
import type { RampOutcome, RampPlan } from '../ramp/contracts.js'
import schema from '../ramp/schemas/plan-v1.json' with { type: 'json' }
import { rampReadRequests, rampResponseHost } from '../ramp/transcript.js'
import { RampWorkflow } from '../ramp/workflow.js'
import { StateStore } from '../state/store.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'

export async function rampCommand(
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
      throw new Error('Cannot read valid ramp JSON; contents omitted')
    }
  }
  if (command === 'ramp schema') {
    io.out(JSON.stringify({ schema: 'wholeloop/ramp-schema@1', plan: schema }))
    return EXIT.ok
  }
  const workflow = new RampWorkflow(new FlowEngine(new StateStore(), root))
  const subject = value('--for')
  if (command !== 'ramp begin' && !subject) throw new CliError('Provide --for <scope-id>')
  if (positional.length > (['ramp begin', 'ramp decide'].includes(command) ? 1 : 0))
    throw new CliError('Unexpected ramp argument')
  let payload: unknown
  if (command === 'ramp begin')
    payload = workflow.begin({
      ...(subject ? { subject } : {}),
      ...(positional[0] ? { input: positional[0] } : {}),
      ...(value('--owner') ? { owner: value('--owner') as string } : {}),
      ...(value('--file') ? { plan: read(value('--file') ?? '') as RampPlan } : {}),
    })
  else if (command === 'ramp requests') {
    const mode = value('--mode') ?? 'observe'
    if (!['observe', 'confirm'].includes(mode))
      throw new Error('Choose read mode observe or confirm')
    payload = await rampReadRequests(
      workflow,
      subject ?? '',
      mode as 'observe' | 'confirm',
      value('--at'),
    )
  } else if (command === 'ramp observe' || command === 'ramp confirm') {
    if (!value('--file')) throw new Error('Provide --file <normalized-read-responses.json>')
    const supplied = read(value('--file') ?? '')
    if (
      !supplied ||
      typeof supplied !== 'object' ||
      !('at' in supplied) ||
      typeof supplied.at !== 'string'
    )
      throw new Error('Supplied read results need their request timestamp')
    const requests = await rampReadRequests(
      workflow,
      subject ?? '',
      command === 'ramp confirm' ? 'confirm' : 'observe',
      supplied.at,
    )
    const host = rampResponseHost(supplied, requests)
    payload =
      command === 'ramp confirm'
        ? await workflow.confirm(subject ?? '', host, {
            by: value('--by') ?? '',
            ...(value('--evidence') ? { manualEvidence: value('--evidence') as string } : {}),
          })
        : await workflow.observe(subject ?? '', host, requests.at)
  } else if (command === 'ramp decide') {
    if (!positional[0] || !value('--basis'))
      throw new Error('Choose go|hold|rollback and provide --basis <evidence-event-id>')
    payload = workflow.decide(subject ?? '', positional[0] as RampOutcome, {
      basis: value('--basis') ?? '',
      by: value('--by') ?? '',
      reason: value('--reason') ?? '',
      ...(value('--ack')
        ? { acknowledgedRisks: JSON.parse(value('--ack') ?? '') as string[] }
        : {}),
    })
  } else if (command === 'ramp proposal') payload = workflow.proposal(subject ?? '')
  else payload = workflow.report(subject ?? '')
  io.out(JSON.stringify(payload, null, json ? undefined : 2))
  return payload &&
    typeof payload === 'object' &&
    'status' in payload &&
    payload.status === 'question'
    ? EXIT.input
    : EXIT.ok
}
