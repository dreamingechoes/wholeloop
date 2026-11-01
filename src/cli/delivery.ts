import { resolve } from 'node:path'
import { BEHAVIOR_INPUT_SCHEMA } from '../acceptance/behavior-input.js'
import { BROWSER_INPUT_SCHEMA } from '../acceptance/browser-input.js'
import { BROWSER_REFERENCE, BROWSER_REFERENCE_IMAGES } from '../acceptance/browser-reference.js'
import { readSourceFile, SOURCE_REQUEST_SCHEMA, SourceInputError } from '../delivery/input.js'
import { NATIVE_DELIVERY_TARGETS, REFERENCE_NATIVE_VERSIONS } from '../delivery/native-adapters.js'
import { NATIVE_OBSERVATION_SCHEMA } from '../delivery/native-capabilities.js'
import nativeRunSchema from '../delivery/schemas/native-run-v1.json' with { type: 'json' }
import { DeliverySources } from '../delivery/source.js'
import { WORKER_SCHEMAS } from '../delivery/worker-protocol.js'
import browserReleaseSchema from '../environment/schemas/exec-release-v1.json' with { type: 'json' }
import browserOperationSchema from '../environment/schemas/operation-v2.json' with { type: 'json' }
import type { parseArguments } from './arguments.js'
import { deliveryAcceptanceCommand } from './delivery-acceptance.js'
import { deliveryAuthorityCommand } from './delivery-authority.js'
import { deliveryBudgetCommand } from './delivery-budgets.js'
import { deliveryEnvironmentCommand } from './delivery-environment.js'
import { deliveryIntegrationCommand } from './delivery-integration.js'
import { deliveryJournalCommand } from './delivery-journal.js'
import { deliveryPlanningCommand } from './delivery-planning.js'
import { deliveryPrivateCommand } from './delivery-private.js'
import { deliveryQueueCommand } from './delivery-queue.js'
import { deliveryRecoveryCommand } from './delivery-recovery.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'

export function deliveryCommand(
  command: string,
  { options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
): number {
  if (
    [
      'delivery integration-assembly-schema',
      'delivery integration-assemble',
      'delivery integration-assembly-status',
      'delivery integration-assembly-reconcile',
      'delivery integration-verify',
      'delivery integration-report',
      'delivery private-sensitivity',
      'delivery environment-backend',
      'delivery environment-start',
      'delivery environment-status',
      'delivery acceptance-run',
      'delivery acceptance-report',
      'delivery acceptance-seal',
      'delivery acceptance-human-note',
      'delivery environment-stop',
      'delivery environment-reconcile',
      'delivery environment-retire',
    ].includes(command)
  )
    throw new CliError(
      'Use the asynchronous CLI entrypoint for environment runtime operations',
      EXIT.precondition,
    )
  if (command.startsWith('delivery integration-'))
    return deliveryIntegrationCommand(command, { options, positional: [] }, root, json, io)
  if (command.startsWith('delivery private-'))
    return deliveryPrivateCommand(command, { options, positional: [] }, root, json, io)
  if (command === 'delivery browser-schema') {
    io.out(
      JSON.stringify({
        schema: 'wholeloop/browser-schema@1',
        input: BROWSER_INPUT_SCHEMA,
        reference: BROWSER_REFERENCE,
        images: BROWSER_REFERENCE_IMAGES,
        operation: browserOperationSchema,
        release: browserReleaseSchema,
        executed: false,
      }),
    )
    return EXIT.ok
  }
  if (command === 'delivery behavior-schema') {
    io.out(
      JSON.stringify({
        schema: 'wholeloop/behavior-schema@1',
        input: BEHAVIOR_INPUT_SCHEMA,
        executed: false,
      }),
    )
    return EXIT.ok
  }
  if (command.startsWith('delivery acceptance-'))
    return deliveryAcceptanceCommand(command, { options, positional: [] }, root, json, io)
  if (command.startsWith('delivery environment-'))
    return deliveryEnvironmentCommand(command, { options, positional: [] }, root, json, io)
  if (command === 'delivery native-schema') {
    io.out(
      JSON.stringify(
        {
          schema: 'wholeloop/delivery-native-schema@1',
          observationSchema: NATIVE_OBSERVATION_SCHEMA,
          runSchema: nativeRunSchema,
          targets: NATIVE_DELIVERY_TARGETS,
          referenceVersions: REFERENCE_NATIVE_VERSIONS,
          dispatch: 'not-performed',
        },
        null,
        json ? undefined : 2,
      ),
    )
    return EXIT.ok
  }
  if (command === 'delivery worker-schema') {
    io.out(
      JSON.stringify(
        {
          schema: 'wholeloop/delivery-worker-schema@1',
          assignmentSchema: WORKER_SCHEMAS.assignment,
          resultSchema: WORKER_SCHEMAS.result,
          executionSchema: WORKER_SCHEMAS.execution,
        },
        null,
        json ? undefined : 2,
      ),
    )
    return EXIT.ok
  }
  if (
    [
      'delivery budget-schema',
      'delivery budget-configure',
      'delivery budget',
      'delivery artifact',
    ].includes(command)
  )
    return deliveryBudgetCommand(command, { options, positional: [] }, root, json, io)
  if (command === 'delivery recover')
    throw new CliError(
      'Use the asynchronous CLI entrypoint for delivery recovery',
      EXIT.precondition,
    )
  if (
    [
      'delivery recovery-schema',
      'delivery checkpoint',
      'delivery checkpoints',
      'delivery effects',
      'delivery lock-status',
      'delivery repair-lock',
    ].includes(command)
  )
    return deliveryRecoveryCommand(command, { options, positional: [] }, root, json, io)
  if (['delivery enqueue', 'delivery queue'].includes(command))
    return deliveryQueueCommand(command, { options, positional: [] }, root, json, io)
  if (
    [
      'delivery state-schema',
      'delivery track',
      'delivery status',
      'delivery events',
      'delivery rebuild',
      'delivery report',
      'delivery revise',
      'delivery diagnostics',
      'delivery recovery-export',
      'delivery recovery-import',
    ].includes(command)
  )
    return deliveryJournalCommand(command, { options, positional: [] }, root, json, io)
  if (
    [
      'delivery authority-schema',
      'delivery authorize',
      'delivery revoke',
      'delivery grant',
    ].includes(command)
  )
    return deliveryAuthorityCommand(command, { options, positional: [] }, root, json, io)
  if (!['delivery source', 'delivery source-schema'].includes(command))
    return deliveryPlanningCommand(command, { options, positional: [] }, root, json, io)
  if (command === 'delivery source-schema') {
    io.out(
      JSON.stringify(
        { schema: 'wholeloop/delivery-source-schema@1', requestSchema: SOURCE_REQUEST_SCHEMA },
        null,
        json ? undefined : 2,
      ),
    )
    return EXIT.ok
  }
  const file = options['--file'],
    boundary = options['--root'],
    store = options['--store']
  if (typeof file !== 'string') throw new CliError('Provide --file <request.json>', EXIT.input)
  const selectedRoot = typeof boundary === 'string' ? resolve(root, boundary) : root
  try {
    let value: unknown
    try {
      value = JSON.parse(readSourceFile(selectedRoot, file, 8 * 1024 * 1024))
    } catch (error) {
      if (error instanceof SourceInputError) throw error
      throw new SourceInputError('invalid-input')
    }
    const snapshot = new DeliverySources(
      typeof store === 'string' ? resolve(root, store) : undefined,
    ).capture(value, selectedRoot)
    const { body: _body, ...source } = snapshot
    const receipt = {
      schema: 'wholeloop/delivery-source-intake@1',
      status: 'stored',
      source,
      problems: [],
      workers: 'not-started',
    }
    io.out(
      json
        ? JSON.stringify(receipt)
        : `Stored delivery source ${source.id}\nRevision: ${source.revision}\nNo worker started; no execution authority granted.`,
    )
    return EXIT.ok
  } catch (error) {
    if (!(error instanceof SourceInputError))
      throw new CliError(
        'Delivery source storage failed; inspect the external store; contents omitted',
        EXIT.precondition,
      )
    const receipt = {
      schema: 'wholeloop/delivery-source-intake@1',
      status: 'missing-input',
      source: null,
      problems: [error.problem],
      workers: 'not-started',
    }
    io.out(json ? JSON.stringify(receipt) : error.message)
    return EXIT.precondition
  }
}
