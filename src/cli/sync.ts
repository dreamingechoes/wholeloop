import { readFileSync } from 'node:fs'
import { isObject } from '../config/schema.js'
import { FlowEngine } from '../flow/engine.js'
import type { OperationResult } from '../providers/operations.js'
import { CliCodehostHost } from '../pull-requests/codehost.js'
import { pullRequestPlans } from '../pull-requests/contracts.js'
import { StateStore } from '../state/store.js'
import { SyncWorkflow } from '../sync/workflow.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'

export async function syncCommand(
  { positional, options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
) {
  if (positional.length) throw new CliError('sync takes --for rather than a positional item')
  const engine = new FlowEngine(new StateStore(), root)
  const prune = options['--prune'] ?? 'on'
  if (!['on', 'off'].includes(String(prune))) throw new Error('Use --prune on|off')
  let input: unknown
  if (typeof options['--file'] === 'string') {
    try {
      input = JSON.parse(readFileSync(options['--file'], 'utf8'))
    } catch {
      throw new Error('Cannot read normalized sync observations; contents omitted')
    }
  }
  const observations = new Map<string, { ref: string; result?: OperationResult }>()
  if (input !== undefined) {
    if (
      !isObject(input) ||
      Object.keys(input).some((key) => !['schema', 'observations'].includes(key)) ||
      input.schema !== 'wholeloop/sync-observations@1' ||
      !Array.isArray(input.observations)
    )
      throw new Error('Use wholeloop/sync-observations@1 with explicit PR-plan observations')
    const plans = pullRequestPlans(engine.store.events())
    for (const entry of input.observations) {
      if (
        !isObject(entry) ||
        Object.keys(entry).some((key) => !['plan', 'ref', 'result', 'unavailable'].includes(key)) ||
        typeof entry.plan !== 'string' ||
        observations.has(entry.plan) ||
        typeof entry.ref !== 'string' ||
        !plans.some((plan) => plan.event === entry.plan && plan.pr?.url === entry.ref) ||
        isObject(entry.result) === (typeof entry.unavailable === 'string')
      )
        throw new Error(
          'Each imported observation needs one exact published PR plan/ref and normalized result or unavailable reason',
        )
      observations.set(entry.plan, {
        ref: entry.ref,
        ...(isObject(entry.result) ? { result: entry.result as unknown as OperationResult } : {}),
      })
    }
  }
  const result = await new SyncWorkflow(engine).run(
    {
      origin: input === undefined ? 'host' : 'import',
      codehost: (plan, context) =>
        input === undefined
          ? new CliCodehostHost(plan.root)
          : {
              invoke: async (call) => {
                const entry = observations.get(context.event)
                if (
                  call.operation !== 'codehost.pr-status' ||
                  !entry ||
                  entry.ref !== call.args.ref ||
                  !entry.result
                )
                  throw new Error('No complete explicit imported observation')
                return entry.result
              },
            },
    },
    {
      ...(typeof options['--for'] === 'string' ? { subject: options['--for'] } : {}),
      prune: prune === 'on',
    },
  )
  io.out(JSON.stringify(result, null, json ? undefined : 2))
  return result.observations.some((row) => row.status === 'unknown') ? EXIT.precondition : EXIT.ok
}
