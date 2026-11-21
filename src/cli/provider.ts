// `wl provider`: lists, shows, resolves, tests and scaffolds providers.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { stringify } from 'yaml'
import { loadConfig, userConfigPath } from '../config/load.js'
import { isObject } from '../config/schema.js'
import { detectMcp, detectProvider } from '../providers/detect.js'
import { loadProviders, resolveProvider } from '../providers/load.js'
import { PROVIDER_ID } from '../providers/manifest.js'
import { MCP_TARGETS, type McpTarget, renderMcp } from '../providers/mcp.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'
import { emitCommand } from './presentation.js'

export function providerCommand(
  command: string,
  { positional, options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
): number {
  const value = (name: string) => (typeof options[name] === 'string' ? options[name] : undefined)
  if (positional.length !== (command === 'provider list' ? 0 : 1))
    throw new CliError(
      `Expected ${command === 'provider list' ? 'no argument' : 'one id or operation'} for ${command}`,
      EXIT.input,
    )
  try {
    if (command === 'provider scaffold') {
      const id = positional[0] ?? ''
      if (!PROVIDER_ID.test(id)) throw new CliError('Provider id must be kebab-case')
      const manifest = {
        schema: 1,
        id,
        name: id,
        description: 'Describe this read-only evidence source.',
        capabilities: ['source.support'],
        access: {
          mcp: {
            server: id,
            install: { transport: 'http', url: 'https://mcp.example.com/mcp', auth: 'oauth' },
          },
        },
        operations: {
          'source.support.query': { tool: 'search_tickets', args: { text: '{{query}}' } },
        },
        degrade: { 'source.support.query': 'open-question' },
      }
      const content = stringify(manifest)
      const output = value('--output')
      if (output) {
        mkdirSync(dirname(output), { recursive: true })
        writeFileSync(output, content, { flag: 'wx', mode: 0o600 })
      }
      io.out(
        json
          ? JSON.stringify({
              schema: 'wholeloop/provider-scaffold@1',
              id,
              content,
              file: output ?? null,
            })
          : content,
      )
      return EXIT.ok
    }
    const configuration = loadConfig({ root }).values
    const packages = Array.isArray(configuration.extensions)
      ? configuration.extensions.filter((value): value is string => typeof value === 'string')
      : []
    const registry = loadProviders({ root, user: dirname(userConfigPath()), packages })
    if (command === 'mcp add') {
      const target = value('--target')
      if (!target) throw new CliError('Provide --target <cli>', EXIT.input)
      if (!MCP_TARGETS.includes(target as McpTarget))
        throw new CliError(`Unsupported MCP target: ${target}`)
      const provider = registry.providers.find((provider) => provider.manifest.id === positional[0])
      if (!provider) throw new CliError(`Unknown provider: ${positional[0]}`, EXIT.precondition)
      const payload = renderMcp(provider.manifest, target as McpTarget)
      if (json) io.out(JSON.stringify(payload))
      else
        emitCommand(
          command,
          {
            destination: payload.destination,
            status: 'Review only; no settings changed',
            next: 'Use --json for the configuration snippet.',
          },
          io,
          false,
        )
      return EXIT.ok
    }
    if (command === 'provider resolve') {
      const operation = positional[0] ?? ''
      const capability = operation.slice(0, operation.lastIndexOf('.'))
      const configured =
        isObject(configuration.providers) && typeof configuration.providers[capability] === 'string'
          ? configuration.providers[capability]
          : undefined
      const provider = resolveProvider(registry, operation, configured)
      emitCommand(
        command,
        { schema: 'wholeloop/provider-resolve@1', operation, ...provider },
        io,
        json,
      )
      return EXIT.ok
    }
    const detection = detectMcp(root)
    const entries = registry.providers.map((provider) => ({
      ...provider,
      detection: detectProvider(provider.manifest, detection.declarations),
    }))
    const selected =
      command === 'provider list'
        ? entries
        : entries.filter((provider) => provider.manifest.id === positional[0])
    if (!selected.length)
      throw new CliError(`Unknown provider: ${positional[0]}`, EXIT.precondition)
    const payload = {
      schema: `wholeloop/${command.replaceAll(' ', '-')}@1`,
      providers: selected,
      problems: [...registry.problems, ...detection.problems],
      probe: 'Not performed; verify tool availability and authentication in the host CLI',
    }
    emitCommand(command, payload, io, json)
    return payload.problems.length ? EXIT.shape : EXIT.ok
  } catch (error) {
    if (error instanceof CliError) throw error
    throw new CliError(error instanceof Error ? error.message : 'Provider command failed')
  }
}
