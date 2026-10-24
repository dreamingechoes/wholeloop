import { resolve } from 'node:path'
import { BUDGET_CONSTRAINTS_SCHEMA, DeliveryBudgets } from '../delivery/budgets.js'
import { DeliveryJournalError } from '../delivery/events.js'
import { readSourceBytes, readSourceFile } from '../delivery/input.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'

export function deliveryBudgetCommand(
  command: string,
  { options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
): number {
  const emit = (value: unknown) => io.out(JSON.stringify(value, null, json ? undefined : 2))
  if (command === 'delivery budget-schema') {
    emit({
      schema: 'wholeloop/delivery-budget-schema@1',
      constraintsSchema: BUDGET_CONSTRAINTS_SCHEMA,
    })
    return EXIT.ok
  }
  const store = options['--store'],
    boundary = options['--root'],
    file = options['--file']
  const budgets = new DeliveryBudgets(typeof store === 'string' ? resolve(root, store) : undefined)
  const selectedRoot = typeof boundary === 'string' ? resolve(root, boundary) : root
  try {
    let report: ReturnType<DeliveryBudgets['inspect']>
    if (command === 'delivery budget-configure') {
      if (typeof file !== 'string')
        throw new CliError('Provide --file <constraints.json>', EXIT.input)
      let request: unknown
      try {
        request = JSON.parse(readSourceFile(selectedRoot, file, 1024 * 1024))
      } catch {
        throw new CliError('Provide bounded UTF-8 constraints; contents omitted', EXIT.input)
      }
      report = budgets.configure(request)
    } else {
      const run = options['--run']
      if (typeof run !== 'string') throw new CliError('Provide --run <delivery-id>', EXIT.input)
      if (command === 'delivery artifact') {
        if (typeof file !== 'string') throw new CliError('Provide --file <artifact>', EXIT.input)
        const result = budgets.captureArtifact(
          run,
          readSourceBytes(selectedRoot, file, 8 * 1024 * 1024),
        )
        emit({
          schema: 'wholeloop/delivery-artifact-capture@1',
          run,
          ...result,
          authority: 'not-granted',
        })
        return result.stored ? EXIT.ok : EXIT.precondition
      }
      report = budgets.inspect(run)
    }
    emit({ schema: 'wholeloop/delivery-budget-status@1', ...report })
    return EXIT.ok
  } catch (error) {
    if (error instanceof CliError) throw error
    throw new CliError(
      error instanceof DeliveryJournalError
        ? error.message
        : 'Budget operation refused; contents omitted',
      EXIT.precondition,
    )
  }
}
