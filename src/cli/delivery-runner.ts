import { resolve } from 'node:path'
import { readSourceFile } from '../delivery/input.js'
import { DeliveryRunnerError } from '../runner/route.js'
import event from '../runner/schemas/event-v1.json' with { type: 'json' }
import facet from '../runner/schemas/facet-v1.json' with { type: 'json' }
import processOutcome from '../runner/schemas/process-outcome-v1.json' with { type: 'json' }
import request from '../runner/schemas/request-v1.json' with { type: 'json' }
import observation from '../runner/schemas/stage-observation-v1.json' with { type: 'json' }
import status from '../runner/schemas/status-v1.json' with { type: 'json' }
import { RunnerStore } from '../runner/store.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'

/** Preparation and controls never select an arbitrary executable or import host results. */
export function deliveryRunnerCommand(
  command: string,
  { options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
) {
  if (command === 'delivery runner-schema') {
    io.out(
      JSON.stringify(
        {
          schema: 'wholeloop/delivery-runner-schema@1',
          contracts: { request, event, facet, observation, processOutcome, status },
          executed: false,
          completeRouteAvailable: false,
        },
        null,
        json ? undefined : 2,
      ),
    )
    return EXIT.ok
  }
  try {
    const store = new RunnerStore(
      typeof options['--store'] === 'string' ? resolve(root, options['--store']) : undefined,
    )
    let receipt: ReturnType<RunnerStore['inspect']>
    if (command === 'delivery runner-prepare') {
      const file = options['--file'],
        boundary = options['--root']
      if (typeof file !== 'string') throw new CliError('Provide --file <request.json>', EXIT.input)
      receipt = store.prepare(
        JSON.parse(
          readSourceFile(
            typeof boundary === 'string' ? resolve(root, boundary) : root,
            file,
            1024 * 1024,
          ),
        ),
      )
    } else {
      const digest = options['--digest']
      if (typeof digest !== 'string') throw new CliError('Provide --digest <sha256>', EXIT.input)
      const operation = command.slice('delivery '.length)
      if (operation === 'runner-status') receipt = store.inspect(digest)
      else {
        if (!['pause', 'resume', 'stop'].includes(operation))
          throw new CliError('Unsupported runner control', EXIT.input)
        const operator = options['--operator']
        if (typeof operator !== 'string')
          throw new CliError('Provide --operator <person>', EXIT.input)
        receipt = store.control(digest, operation as 'pause' | 'resume' | 'stop', operator)
      }
    }
    io.out(JSON.stringify(receipt, null, json ? undefined : 2))
    return receipt.problems.length ? EXIT.precondition : EXIT.ok
  } catch (error) {
    if (error instanceof CliError) throw error
    throw new CliError(
      `Delivery runner unavailable${error instanceof DeliveryRunnerError ? `: ${error.problem}` : ''}; retain original work and inspect the external store; contents omitted`,
      EXIT.precondition,
    )
  }
}
