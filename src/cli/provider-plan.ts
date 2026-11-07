// `wl provider plan`: plans an operation's transport from the client's MCP inventory.
import { loadExtensionOptions } from '../config/load.js'
import { loadProviders, resolveProvider } from '../providers/load.js'
import { type ProviderTransport, planProviderTransport } from '../providers/transport.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import type { Io } from './io.js'
import { readClientInventory } from './mcp-inventory.js'

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
  const inventory =
    typeof options['--mcp'] === 'string' ? readClientInventory(root, options['--mcp']) : undefined
  const transport = options['--transport']
  if (transport !== undefined && transport !== 'mcp' && transport !== 'native')
    throw new CliError('Select mcp or native transport')
  const plan = planProviderTransport(provider, operation, {
    ...(inventory ? { inventory } : {}),
    ...(typeof transport === 'string' ? { transport: transport as ProviderTransport } : {}),
  })
  io.out(JSON.stringify(plan, null, json ? undefined : 2))
  return plan.status === 'unavailable' ? 3 : 0
}
