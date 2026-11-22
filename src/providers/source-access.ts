// Detection orders source choices; it never authorizes an unrelated source or proves a connection.

import { detectProvider, type McpDeclaration } from './detect.js'
import type { Registry } from './load.js'
import type { Provider } from './manifest.js'

/** How one provider is reachable from the executing client; never proof of a working connection. */
export function providerAccess(
  manifest: Provider,
  declarations: readonly McpDeclaration[],
  client: string | undefined,
  path?: string,
) {
  const detected = detectProvider(
    manifest,
    declarations.filter((entry) => entry.target === client),
    path,
  )
  const configuredClients = [
    ...new Set(
      declarations
        .filter((entry) => entry.enabled && entry.server === manifest.access.mcp?.server)
        .map((entry) => entry.target),
    ),
  ].sort()
  const access =
    detected.kind === 'native' || detected.kind === 'local'
      ? 'native'
      : detected.kind === 'mcp'
        ? 'available in this client'
        : configuredClients.some((entry) => entry !== client)
          ? 'configured in another client'
          : detected.kind === 'cli'
            ? 'executable only'
            : 'unavailable'
  const available = detected.available && detected.kind !== 'cli'
  const evidence =
    access === 'configured in another client'
      ? 'MCP is declared for another client; no source access is established here'
      : detected.kind === 'cli'
        ? `${detected.evidence}; a connection and relevant source are not established`
        : detected.evidence
  return { access, available, evidence, configuredClients }
}

export function sourceCandidates(options: {
  registry: Registry
  declarations: readonly McpDeclaration[]
  client?: string | undefined
  path?: string | undefined
}) {
  if (options.registry.problems.length)
    throw new Error('Resolve provider registry problems before choosing research sources')
  const candidates = options.registry.providers
    .flatMap(({ manifest }) => {
      const capabilities = manifest.capabilities.filter(
        (capability) =>
          capability.startsWith('source.') && manifest.operations[`${capability}.query`],
      )
      if (!capabilities.length) return []
      const { access, available, evidence, configuredClients } = providerAccess(
        manifest,
        options.declarations,
        options.client,
        options.path,
      )
      return [
        {
          id: manifest.id,
          name: manifest.name,
          capabilities,
          access,
          available,
          evidence,
          configuredClients,
        },
      ]
    })
    .sort((a, b) => {
      const rank = (id: string) => (id === 'native-code' ? 0 : id === 'native-web' ? 1 : 2)
      return rank(a.id) - rank(b.id) || a.id.localeCompare(b.id)
    })
  const mapped = new Set(
    options.registry.providers
      .filter(({ manifest }) => candidates.some((candidate) => candidate.id === manifest.id))
      .flatMap(({ manifest }) => (manifest.access.mcp ? [manifest.access.mcp.server] : [])),
  )
  const servers = [
    ...new Set(
      options.declarations
        .filter((entry) => !mapped.has(entry.server))
        .map((entry) => entry.server),
    ),
  ].sort()
  const unusable = servers.map((server) => ({
    server,
    label: 'not usable yet',
    reason: 'No validated source query provider',
    clients: [
      ...new Set(
        options.declarations
          .filter((entry) => entry.server === server)
          .map((entry) => entry.target),
      ),
    ].sort(),
    guide: 'docs/extending/providers.md',
  }))
  return { candidates, unusable }
}

export type SourceCandidate = ReturnType<typeof sourceCandidates>['candidates'][number]
