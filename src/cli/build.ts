// `wl build route`, `agree`, `plan` and related subcommands: builder plans, agreements and receipts for build-slice.
import { readFileSync } from 'node:fs'
import { BUILDER_PLAN_SCHEMA, type BuilderPlan } from '../build/contracts.js'
import { BuildWorkflow } from '../build/workflow.js'
import { parseCriteria } from '../definition/criteria.js'
import { FlowEngine } from '../flow/engine.js'
import { StateStore } from '../state/store.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'
import { emitStep } from './presentation.js'

export function buildCommand(
  command: string,
  { positional, options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
) {
  const action = command.split(' ')[1]
  const value = (key: string) => (typeof options[key] === 'string' ? options[key] : undefined)
  try {
    if (positional.length > 1 || (!['route', 'schema'].includes(action ?? '') && !positional[0]))
      throw new CliError('Provide one build input or item ID')
    const workflow = new BuildWorkflow(new FlowEngine(new StateStore(), root))
    const subject = positional[0] ?? ''
    let payload: unknown
    if (action === 'schema')
      payload = { schema: 'wholeloop/build-schema@1', plan: BUILDER_PLAN_SCHEMA }
    else if (action === 'route') payload = workflow.route(positional[0])
    else if (action === 'agree') {
      const file = value('--criteria')
      const by = value('--by')
      const owner = value('--owner')
      if (!file || !by || !owner)
        throw new CliError('Provide --criteria, --owner and --by after the person agrees')
      const ref = value('--issue')
      const revision = value('--revision')
      if (ref && !revision) throw new CliError('Issue agreement requires its observed --revision')
      if (!ref && revision) throw new CliError('--revision requires --issue')
      payload = workflow.agree(subject, owner, {
        by,
        criteria: parseCriteria(JSON.parse(readFileSync(file, 'utf8'))),
        source: ref
          ? { kind: 'issue', ref, revision: revision ?? '' }
          : { kind: 'sentence', ref: subject },
      })
    } else if (action === 'preflight') payload = workflow.preflight(subject)
    else if (action === 'prepare')
      payload = workflow.prepare(subject, {
        ...(value('--base') ? { base: value('--base') as string } : {}),
        ...(value('--after') ? { after: value('--after') as string } : {}),
      })
    else if (action === 'plan') {
      if (!value('--file') || !value('--basis'))
        throw new CliError('Provide --file <builder-plan.json> and the prepared --basis snapshot')
      payload = workflow.recordPlan(
        subject,
        JSON.parse(readFileSync(value('--file') ?? '', 'utf8')) as BuilderPlan,
        value('--basis') ?? '',
      )
    } else payload = { schema: 'wholeloop/build-complete@1', receipt: workflow.complete(subject) }
    emitStep(command, payload, io, json, positional)
    return EXIT.ok
  } catch (error) {
    if (error instanceof CliError) throw error
    throw new CliError(
      error instanceof Error ? error.message : 'Build operation failed',
      EXIT.precondition,
    )
  }
}
