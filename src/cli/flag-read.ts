// `wl provider read-flags`: plans one flag-state read without reading anything (ADR-0085).
import { loadExtensionOptions } from '../config/load.js'
import { loadProviders, resolveProvider } from '../providers/load.js'
import { type OperationCall, performOperation } from '../providers/operations.js'
import { planProviderTransport } from '../providers/transport.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import type { Io } from './io.js'
import { readClientInventory } from './mcp-inventory.js'
import { emitCommand } from './presentation.js'

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

/**
 * Plan one flag-state read without reading anything (ADR-0085).
 *
 * wholeloop has no service client: when the client reports a reviewed MCP
 * binding, the output names the exact call for the client to make; a local
 * provider reads its repository file during ramp evidence; otherwise the
 * state stays an open question for a person. No route resolves a credential.
 */
export async function flagReadCommand(
  { positional, options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
) {
  const flag = options['--flag'],
    environment = options['--environment']
  if (positional.length !== 1 || typeof flag !== 'string' || typeof environment !== 'string')
    throw new CliError(
      'Use provider read-flags <id> --flag <key> --environment <key> [--mcp <file>]',
    )
  if (!IDENTIFIER.test(flag) || !IDENTIFIER.test(environment))
    throw new CliError('Use bounded exact flag and environment identifiers')
  const provider = resolveProvider(
    loadProviders(loadExtensionOptions({ root })),
    'flags.read-state',
    positional[0],
  )
  const inventory =
    typeof options['--mcp'] === 'string' ? readClientInventory(root, options['--mcp']) : undefined
  const route = planProviderTransport(provider, 'flags.read-state', inventory ? { inventory } : {})
  // Bind the manifest's arguments exactly as an invoking host would receive them.
  let call: OperationCall | undefined
  await performOperation(
    provider,
    'flags.read-state',
    { flag, environment },
    {
      invoke: async (planned) => {
        call = planned
        return { status: 'pending', ref: 'not-performed' }
      },
    },
  )
  if (!call) throw new CliError('Flag read did not produce a validated call')
  const status =
    route.transport === 'mcp' ? 'planned' : route.transport === 'native' ? 'local' : 'open-question'
  emitCommand(
    'provider read-flags',
    {
      schema: 'wholeloop/flag-read@2',
      provider: provider.manifest.id,
      flag,
      environment,
      status,
      transport: route.transport,
      ...(route.server ? { server: route.server } : {}),
      tool: route.tool,
      args: call.args,
      degrade: route.degrade,
      reason: route.reason,
      ...(status === 'open-question'
        ? {
            question: `What is the current state of flag ${flag} in ${environment}? Its exposure is unknown until a person or a client tool reports it.`,
          }
        : {}),
      effects: 'not-performed',
      authentication: route.authentication,
    },
    io,
    json,
  )
  return 0
}
