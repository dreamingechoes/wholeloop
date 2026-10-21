import { lstatSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadExtensionOptions } from '../config/load.js'
import { loadProviders, resolveProvider } from '../providers/load.js'
import {
  clientMcpInventory,
  type ProviderTransport,
  planProviderTransport,
} from '../providers/transport.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import type { Io } from './io.js'

/** A client inventory is metadata, not authentication or authority to call any service. */
export function providerPlanCommand(
  { positional, options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
) {
  if (positional.length !== 2)
    throw new CliError('Use provider plan <id> <operation> [--mcp <file>]')
  const [id, operation] = positional as [string, string]
  const provider = resolveProvider(loadProviders(loadExtensionOptions({ root })), operation, id)
  let inventory: ReturnType<typeof clientMcpInventory> | undefined
  if (typeof options['--mcp'] === 'string') {
    try {
      const file = resolve(root, options['--mcp'])
      const stat = lstatSync(file)
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536) throw new Error()
      const bytes = readFileSync(file)
      if (bytes.length > 65536) throw new Error()
      inventory = clientMcpInventory(JSON.parse(bytes.toString('utf8')))
    } catch {
      throw new CliError(
        'Use one regular non-secret client MCP inventory file under 64 KiB; contents omitted',
      )
    }
  }
  const transport = options['--transport']
  if (transport !== undefined && !['mcp', 'native', 'http'].includes(String(transport)))
    throw new CliError('Select mcp, native or http transport')
  const plan = planProviderTransport(provider, operation, {
    ...(inventory ? { inventory } : {}),
    ...(typeof transport === 'string' ? { transport: transport as ProviderTransport } : {}),
  })
  io.out(JSON.stringify(plan, null, json ? undefined : 2))
  return plan.status === 'unavailable' ? 3 : 0
}
