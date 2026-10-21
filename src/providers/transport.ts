import { validate } from '../config/schema.js'
import type { LoadedProvider } from './load.js'
import { validateProvider } from './manifest.js'
import type { OperationCall, OperationResult, ProviderHost } from './operations.js'
import inventorySchema from './schemas/client-mcp-v1.json' with { type: 'json' }

export interface ClientMcpInventory {
  schema: 'wholeloop/client-mcp@1'
  server: string
  tools: { name: string; inputSchema: Record<string, unknown> }[]
  /** Explicit reviewed operation bindings, not guesses from similar tool names. */
  bindings?: Record<string, string>
}

export function clientMcpInventory(value: unknown): ClientMcpInventory {
  try {
    if (
      Buffer.byteLength(JSON.stringify(value) ?? '') > 65536 ||
      validate(value, inventorySchema).length
    )
      throw new Error()
    const inventory = value as ClientMcpInventory
    if (
      inventory.server.length > 160 ||
      inventory.tools.length > 256 ||
      inventory.tools.some((tool) => tool.name.length > 160) ||
      Object.values(inventory.bindings ?? {}).some((tool) => tool.length > 160) ||
      new Set(inventory.tools.map((tool) => tool.name)).size !== inventory.tools.length
    )
      throw new Error()
    return structuredClone(inventory)
  } catch {
    throw new Error('Invalid client MCP inventory; supply bounded non-secret tool schemas')
  }
}

const nativeOnly = new Set(['comms.draft', 'flags.propose-change'])
const nativeTools = new Set([
  'wholeloop.comms.draft',
  'wholeloop.flags.propose-change',
  'wholeloop.dashboard.handoff',
  'wholeloop.config-flags.read-state',
])
export type ProviderTransport = 'mcp' | 'native' | 'http'
export interface TransportSelection {
  transport?: ProviderTransport
  inventory?: ClientMcpInventory
  httpAvailable?: boolean
}

export function planProviderTransport(
  provider: LoadedProvider,
  operation: string,
  options: TransportSelection = {},
) {
  const manifest = provider.manifest
  const mapping = manifest.operations[operation]
  const degrade = manifest.degrade[operation]
  if (!mapping || !degrade) throw new Error('Select a declared provider operation')
  const transport = options.transport ?? 'mcp'
  if (!['mcp', 'native', 'http'].includes(transport)) throw new Error('Unknown provider transport')
  const inventory = options.inventory ? clientMcpInventory(options.inventory) : undefined
  if (inventory) {
    for (const [name, tool] of Object.entries(inventory.bindings ?? {})) {
      if (!manifest.operations[name]) throw new Error('MCP bindings must name declared operations')
      validateProvider({
        ...manifest,
        operations: { ...manifest.operations, [name]: { ...manifest.operations[name], tool } },
      })
      if (nativeOnly.has(name)) throw new Error('Drafts and unapplied proposals remain native')
    }
  }
  const base = {
    schema: 'wholeloop/provider-transport@1' as const,
    provider: manifest.id,
    operation,
    degrade,
    effects: 'not-performed' as const,
    authentication: 'client-owned-unverified' as const,
  }
  const answer = (
    selected: ProviderTransport | 'unavailable',
    reason: string,
    tool = mapping.tool,
  ) => ({
    ...base,
    transport: selected,
    status: selected === 'unavailable' ? ('unavailable' as const) : ('planned' as const),
    tool,
    ...(selected === 'mcp' ? { server: inventory?.server } : {}),
    reason,
  })
  if (nativeOnly.has(operation) || manifest.access.local)
    return transport === 'http'
      ? answer('unavailable', 'This operation retains its native boundary')
      : answer('native', 'Native local state, drafts and unapplied proposals stay local')
  if (transport === 'http')
    return options.httpAvailable
      ? answer('http', 'Experimental HTTP host explicitly selected')
      : answer('unavailable', 'Select an explicit HTTP host or the existing opt-in bridge command')
  if (transport === 'mcp' && inventory && inventory.server === manifest.access.mcp?.server) {
    const tool = inventory.bindings?.[operation] ?? mapping.tool
    if (!tool.startsWith('wholeloop.') && inventory.tools.some((entry) => entry.name === tool))
      return answer(
        'mcp',
        'Client-reported tool/schema matches a declared or reviewed binding',
        tool,
      )
  }
  if (
    nativeTools.has(mapping.tool) ||
    (!manifest.access.mcp && (manifest.access.native || manifest.access.cli))
  )
    return answer('native', 'Use the declared native operation or explicit pending handoff')
  return answer(
    'unavailable',
    'No matching client MCP tool/schema; retain the declared degradation',
  )
}

/** Reuse the native client's connection. No MCP network client or automatic HTTP fallback lives here. */
export function clientProviderHost(
  provider: LoadedProvider,
  options: {
    transport?: ProviderTransport
    mcp?: { inventory: ClientMcpInventory; invoke(call: OperationCall): Promise<OperationResult> }
    native?: ProviderHost
    http?: ProviderHost
  } = {},
): ProviderHost {
  const selection = {
    ...(options.transport ? { transport: options.transport } : {}),
    ...(options.mcp ? { inventory: clientMcpInventory(options.mcp.inventory) } : {}),
    httpAvailable: options.http !== undefined,
  }
  const mcpInvoke = options.mcp?.invoke.bind(options.mcp)
  const http = options.http
  const native = options.native
  const plan = (call: OperationCall) => {
    if (
      call.provider !== provider.manifest.id ||
      call.tool !== provider.manifest.operations[call.operation]?.tool
    )
      throw new Error('Provider transport must match the declared operation identity')
    return planProviderTransport(provider, call.operation, selection)
  }
  return {
    supports: (call) => {
      const route = plan(call)
      return route.status === 'planned' && ['mcp', 'http'].includes(route.transport)
    },
    invoke: async (call) => {
      const route = plan(call)
      // Validate the actual outgoing arguments as well as the reviewed tool name.
      validateProvider({
        ...provider.manifest,
        operations: {
          ...provider.manifest.operations,
          [call.operation]: { tool: route.tool, args: call.args },
        },
      })
      const selected =
        route.transport === 'mcp'
          ? mcpInvoke
          : route.transport === 'http'
            ? http?.invoke.bind(http)
            : route.transport === 'native'
              ? native?.invoke.bind(native)
              : undefined
      if (!selected)
        throw new Error(
          'Provider transport unavailable; retain its pending handoff or open question',
        )
      try {
        return await selected({ ...call, tool: route.tool })
      } catch {
        // A failed write may already exist remotely. Switching transport would duplicate authority and intent.
        throw new Error(
          'Selected provider transport failed; inspect its outcome without switching transports',
        )
      }
    },
  }
}
