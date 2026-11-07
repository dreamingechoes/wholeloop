// `wl delivery` acceptance commands: definitions, cases, reports and their execution.
import { resolve } from 'node:path'
import { ACCEPTANCE_SCHEMAS, type AcceptanceArtifact } from '../acceptance/contracts.js'
import { DockerBehaviorHost } from '../acceptance/docker-behavior.js'
import { DeliveryAcceptance } from '../acceptance/store.js'
import { readSourceBytes, readSourceFile } from '../delivery/input.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'

function context(options: ReturnType<typeof parseArguments>['options'], root: string) {
  return {
    acceptance: new DeliveryAcceptance(
      typeof options['--store'] === 'string' ? resolve(root, options['--store']) : undefined,
    ),
    boundary: typeof options['--root'] === 'string' ? resolve(root, options['--root']) : root,
  }
}
function required(options: ReturnType<typeof parseArguments>['options'], name: string) {
  const value = options[name]
  if (typeof value !== 'string') throw new CliError(`Provide ${name}`, EXIT.input)
  return value
}
function failure(error: unknown): never {
  if (error instanceof CliError) throw error
  throw new CliError(
    'Acceptance unavailable; inspect pinned definitions, current candidate, observed evidence and private authority; contents omitted',
    EXIT.precondition,
  )
}
export function deliveryAcceptanceCommand(
  command: string,
  { options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
) {
  try {
    let receipt: unknown
    if (command === 'delivery acceptance-schema')
      receipt = {
        schema: 'wholeloop/acceptance-schema@1',
        contracts: ACCEPTANCE_SCHEMAS,
        executed: false,
      }
    else {
      const { acceptance, boundary } = context(options, root)
      if (command === 'delivery acceptance-plan') {
        const input = JSON.parse(
          readSourceFile(boundary, required(options, '--file'), 8 * 1024 * 1024),
        )
        receipt = {
          schema: 'wholeloop/acceptance-plan-prepared@1',
          ...acceptance.prepare(input),
          executed: false,
          acceptance: 'not-established',
        }
      } else if (command === 'delivery acceptance-inspect')
        receipt = {
          schema: 'wholeloop/acceptance-plan-inspection@1',
          ...acceptance.get(required(options, '--digest')),
          executed: false,
          acceptance: 'not-established',
        }
      else if (command === 'delivery acceptance-artifact') {
        const captured = acceptance.artifacts.capture(
          required(options, '--run'),
          readSourceBytes(boundary, required(options, '--file'), 20 * 1024 * 1024),
          (typeof options['--media-type'] === 'string'
            ? options['--media-type']
            : 'application/octet-stream') as AcceptanceArtifact['mediaType'],
        )
        receipt = {
          schema: 'wholeloop/acceptance-artifact-capture@1',
          ...captured,
          publication: 'not-performed',
        }
      } else throw new CliError('Use the asynchronous acceptance entrypoint', EXIT.precondition)
    }
    io.out(JSON.stringify(receipt, null, json ? undefined : 2))
    return EXIT.ok
  } catch (error) {
    return failure(error)
  }
}
export async function deliveryAcceptanceAsyncCommand(
  command: string,
  { options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
) {
  try {
    const { acceptance, boundary } = context(options, root)
    const digest = required(options, '--digest'),
      environment = acceptance.boundary(required(options, '--environment'))
    let receipt: unknown
    let code: number = EXIT.ok
    if (command === 'delivery acceptance-run') {
      const caseId = required(options, '--case')
      const test = acceptance.get(digest).plan.cases.find((c) => c.id === caseId)
      const host =
        test?.runner.kind === 'browser'
          ? new (await import('../acceptance/docker-browser.js')).DockerBrowserHost(
              acceptance,
              digest,
              environment.environment,
              caseId,
            )
          : test?.runner.capability === 'evaluator.private-http'
            ? new (await import('../acceptance/docker-private.js')).DockerPrivateHost(
                acceptance,
                digest,
                environment.environment,
                caseId,
              )
            : new DockerBehaviorHost(acceptance, digest, environment.environment, caseId)
      receipt = await acceptance.executeCase(
        digest,
        caseId,
        required(options, '--key'),
        environment,
        host,
      )
      if ((receipt as { status: string }).status !== 'passed') code = EXIT.precondition
    } else if (command === 'delivery acceptance-seal') {
      receipt = {
        schema: 'wholeloop/acceptance-sealed@1',
        ...(await acceptance.seal(digest, environment)),
        publication: 'not-performed',
      }
    } else if (command === 'delivery acceptance-report') {
      const result = await acceptance.report(digest, environment)
      receipt = result
      if (result.status !== 'passed') code = EXIT.precondition
    } else {
      const request = JSON.parse(
        readSourceFile(boundary, required(options, '--file'), 65536),
      ) as Parameters<DeliveryAcceptance['recordHuman']>[3]
      receipt = await acceptance.recordHuman(
        digest,
        required(options, '--case'),
        environment,
        request,
      )
    }
    io.out(JSON.stringify(receipt, null, json ? undefined : 2))
    return code
  } catch (error) {
    return failure(error)
  }
}
