// `wl gate`: plans, submits and decides verify and review rounds.
import { readFileSync } from 'node:fs'
import { isObject } from '../config/schema.js'
import { parseCriteria } from '../definition/criteria.js'
import { FlowEngine } from '../flow/engine.js'
import { GATE_SCHEMAS, type GateKind } from '../gates/contracts.js'
import { GateWorkflow } from '../gates/workflow.js'
import { StateStore } from '../state/store.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'

export function roundOverrides(value: string): Partial<Record<GateKind, number>> {
  const result: Partial<Record<GateKind, number>> = {}
  for (const pair of value.split(',')) {
    const match = /^(verify|review)=([1-9]|10)$/.exec(pair)
    if (!match || Object.hasOwn(result, match[1] ?? ''))
      throw new Error('Use --rounds verify=1..10,review=1..10 without duplicates')
    result[match[1] as GateKind] = Number(match[2])
  }
  return result
}

export function gateCommand(
  command: string,
  { positional, options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
): number {
  const action = command.split(' ')[1]
  const value = (key: string) => (typeof options[key] === 'string' ? options[key] : undefined)
  try {
    if (action === 'schema') {
      io.out(
        JSON.stringify(
          { schema: 'wholeloop/gate-schema@1', schemas: GATE_SCHEMAS },
          null,
          json ? undefined : 2,
        ),
      )
      return EXIT.ok
    }
    const subject = value('--for')
    if (!subject) throw new CliError('Provide --for <slice|part|review-id>', EXIT.input)
    const workflow = new GateWorkflow(new FlowEngine(new StateStore(), root))
    let payload: unknown
    if (action === 'submit') {
      if (positional.length || !value('--file'))
        throw new CliError('Provide --file <submission.json>')
      const data: unknown = JSON.parse(readFileSync(value('--file') ?? '', 'utf8'))
      if (
        !isObject(data) ||
        Object.keys(data).some((key) => !['run', 'round', 'result', 'vote'].includes(key)) ||
        typeof data.run !== 'string' ||
        !Number.isInteger(data.round) ||
        Object.hasOwn(data, 'result') === Object.hasOwn(data, 'vote')
      )
        throw new CliError('Submission needs run, round and exactly one result or vote', EXIT.shape)
      // The workflow validates the complete selected public schema before any write.
      payload = workflow.submit(
        subject,
        data.run,
        Number(data.round),
        (data.result ?? data.vote) as Parameters<GateWorkflow['submit']>[3],
      )
    } else {
      const gate = action === 'plan' ? positional[0] : value('--gate')
      if (
        !['verify', 'review'].includes(gate ?? '') ||
        positional.length !== (action === 'plan' ? 1 : 0)
      )
        throw new CliError('Choose verify or review', EXIT.input)
      if (action === 'plan') {
        const rounds = value('--rounds')
          ? roundOverrides(value('--rounds') ?? '')[gate as GateKind]
          : undefined
        if (value('--rounds') && rounds === undefined)
          throw new CliError('The rounds override must include this gate')
        payload = workflow.plan(subject, gate as GateKind, {
          ...(value('--repo') ? { repo: value('--repo') as string } : {}),
          ...(value('--base') ? { base: value('--base') as string } : {}),
          ...(rounds !== undefined ? { rounds } : {}),
          ...(value('--extend') ? { extend: Number(value('--extend')) } : {}),
          ...(value('--reason') ? { reason: value('--reason') as string } : {}),
          ...(options['--new-run'] === true ? { newRun: true } : {}),
          ...(value('--criteria')
            ? {
                criteria: parseCriteria(
                  JSON.parse(readFileSync(value('--criteria') ?? '', 'utf8')),
                ),
              }
            : {}),
        })
      } else payload = workflow.verdict(subject, gate as GateKind)
    }
    io.out(JSON.stringify(payload, null, json ? undefined : 2))
    if (isObject(payload) && typeof payload.verdict === 'string' && payload.verdict !== 'PASS')
      return EXIT.shape
    return EXIT.ok
  } catch (error) {
    if (error instanceof CliError) throw error
    throw new CliError(
      error instanceof Error ? error.message : 'Gate operation failed',
      EXIT.precondition,
    )
  }
}
