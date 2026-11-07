// `wl delivery integration-assembl*`: owned assembly of committed parts and its status.
import { resolve } from 'node:path'
import { readSourceFile } from '../delivery/input.js'
import {
  ASSEMBLY_RECORD_SCHEMA,
  ASSEMBLY_REQUEST_SCHEMA,
  ASSEMBLY_STATUS_SCHEMA,
  IntegrationAssembly,
} from '../integration/assembly.js'
import {
  INTEGRATION_VERIFICATION_REPORT_SCHEMA,
  INTEGRATION_VERIFICATION_SCHEMA,
  IntegrationVerification,
} from '../integration/verification.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'

function required(options: ReturnType<typeof parseArguments>['options'], name: string) {
  const value = options[name]
  if (typeof value !== 'string') throw new CliError(`Provide ${name}`, EXIT.input)
  return value
}
export async function deliveryAssemblyCommand(
  command: string,
  { options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
) {
  try {
    let receipt: unknown,
      code: number = EXIT.ok
    if (command === 'delivery integration-assembly-schema')
      receipt = {
        schema: 'wholeloop/integration-assembly-schema@1',
        contracts: {
          request: ASSEMBLY_REQUEST_SCHEMA,
          record: ASSEMBLY_RECORD_SCHEMA,
          verification: INTEGRATION_VERIFICATION_SCHEMA,
          status: ASSEMBLY_STATUS_SCHEMA,
          verificationReport: INTEGRATION_VERIFICATION_REPORT_SCHEMA,
        },
        executed: false,
      }
    else {
      const store =
        typeof options['--store'] === 'string' ? resolve(root, options['--store']) : undefined
      if (command === 'delivery integration-assembly-reconcile')
        receipt = await new IntegrationAssembly(store).reconcile(required(options, '--digest'))
      else if (command === 'delivery integration-assembly-status')
        receipt = new IntegrationAssembly(store).inspect(required(options, '--digest'))
      else {
        const boundary =
            typeof options['--root'] === 'string' ? resolve(root, options['--root']) : root,
          value = JSON.parse(readSourceFile(boundary, required(options, '--file'), 2 * 1024 * 1024))
        if (command === 'delivery integration-assemble') {
          const assembly = new IntegrationAssembly(store),
            record = assembly.prepare(value)
          receipt = await assembly.execute(record.digest)
        } else {
          const verification = new IntegrationVerification(store)
          receipt =
            command === 'delivery integration-verify'
              ? await verification.run(value)
              : await verification.report(value)
        }
      }
      if (!['assembled', 'passed'].includes((receipt as { status: string }).status))
        code = EXIT.precondition
    }
    io.out(JSON.stringify(receipt, null, json ? undefined : 2))
    return code
  } catch (error) {
    if (error instanceof CliError) throw error
    throw new CliError(
      'Integration assembly or verification unavailable; preserve owned worktrees and inspect the original authority, committed vector and retained effects; contents omitted',
      EXIT.precondition,
    )
  }
}
