// The provider manifest format and its validation.
import { isObject } from '../config/schema.js'
import { type Capability, OPERATIONS, TAXONOMY } from './taxonomy.js'

export interface Recipe {
  transport: 'http' | 'stdio'
  url?: string
  command?: string
  args?: string[]
  auth?: 'oauth' | 'header' | 'none'
  token_env?: string
}
export interface Provider {
  schema: 1
  id: string
  name: string
  description: string
  capabilities: Capability[]
  extends?: string
  access: {
    native?: true
    local?: true
    cli?: { binary: string; detect?: string }
    mcp?: { server: string; detect?: { tools: string[] }; install: Recipe }
  }
  operations: Record<string, { tool: string; args?: Record<string, unknown>; guidance?: string }>
  degrade: Record<string, 'open-question' | 'handoff-artifact' | 'skip-with-reason'>
}
export const PROVIDER_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string' && item.length > 0)
const text = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0
const allowed = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).every((key) => keys.includes(key))

export function validateProvider(value: unknown): asserts value is Provider {
  const fail = (path: string, expected: string): never => {
    throw new Error(`provider.${path}: expected ${expected}`)
  }
  if (!isObject(value)) fail('', 'a manifest object')
  if (!isObject(value)) return
  if (
    !allowed(value, [
      'schema',
      'id',
      'name',
      'description',
      'extends',
      'capabilities',
      'access',
      'operations',
      'degrade',
    ])
  )
    fail('', 'known manifest keys')
  if (value.schema !== 1) fail('schema', '1')
  if (!text(value.id) || !PROVIDER_ID.test(value.id)) fail('id', 'kebab-case id')
  if (!text(value.name) || !text(value.description)) fail('name/description', 'non-empty strings')
  if (value.extends !== undefined && !text(value.extends)) fail('extends', 'a provider id')
  if (
    !strings(value.capabilities) ||
    !value.capabilities.length ||
    value.capabilities.some((capability) => !Object.hasOwn(TAXONOMY, capability)) ||
    new Set(value.capabilities).size !== value.capabilities.length
  )
    fail('capabilities', 'unique taxonomy capabilities')
  if (
    !isObject(value.access) ||
    !Object.keys(value.access).length ||
    !allowed(value.access, ['native', 'local', 'cli', 'mcp'])
  )
    fail('access', 'native, local, cli or mcp access')
  const access = value.access as Record<string, unknown>
  if (access.local === true && !['local-docs', 'local-tracker'].includes(String(value.id)))
    fail('access.local', 'a built-in local destination id')
  for (const key of ['native', 'local'])
    if (access[key] !== undefined && access[key] !== true) fail(`access.${key}`, 'true')
  if (
    access.cli !== undefined &&
    (!isObject(access.cli) ||
      !allowed(access.cli, ['binary', 'detect']) ||
      !text(access.cli.binary) ||
      !/^[a-zA-Z0-9._-]+$/.test(access.cli.binary) ||
      (access.cli.detect !== undefined && !text(access.cli.detect)))
  )
    fail('access.cli', 'a binary name and optional detection description')
  if (access.mcp !== undefined) {
    const mcp = access.mcp
    if (
      !isObject(mcp) ||
      !allowed(mcp, ['server', 'detect', 'install']) ||
      !text(mcp.server) ||
      !PROVIDER_ID.test(mcp.server)
    )
      fail('access.mcp', 'a server id and neutral install recipe')
    if (!isObject(mcp)) return
    if (
      mcp.detect !== undefined &&
      (!isObject(mcp.detect) || !allowed(mcp.detect, ['tools']) || !strings(mcp.detect.tools))
    )
      fail('access.mcp.detect', 'tool names')
    const recipe = mcp.install
    if (
      !isObject(recipe) ||
      !allowed(recipe, ['transport', 'url', 'command', 'args', 'auth', 'token_env'])
    )
      fail('access.mcp.install', 'a recipe without inline credentials')
    if (!isObject(recipe)) return
    if (recipe.transport !== 'http' && recipe.transport !== 'stdio')
      fail('access.mcp.install.transport', 'http or stdio')
    if (
      recipe.auth !== undefined &&
      (typeof recipe.auth !== 'string' || !['oauth', 'header', 'none'].includes(recipe.auth))
    )
      fail('access.mcp.install.auth', 'oauth, header or none')
    if (recipe.transport === 'http') {
      if (!text(recipe.url)) fail('access.mcp.install.url', 'an HTTP(S) URL')
      try {
        const url = new URL(String(recipe.url))
        // PostHog needs an explicit roster mode; this is the only credential-free
        // query parameter accepted in installation recipes, never an arbitrary token.
        const safeQuery =
          [...url.searchParams].length <= 1 &&
          [...url.searchParams].every(
            ([key, mode]) => key === 'mode' && ['tools', 'cli'].includes(mode),
          )
        if (
          !['http:', 'https:'].includes(url.protocol) ||
          url.username ||
          url.password ||
          !safeQuery ||
          url.hash
        )
          fail(
            'access.mcp.install.url',
            'an endpoint without credentials, arbitrary query or fragment',
          )
      } catch {
        fail('access.mcp.install.url', 'an HTTP(S) endpoint without credentials')
      }
      if (recipe.command !== undefined || recipe.args !== undefined)
        fail('access.mcp.install', 'HTTP fields only')
    } else if (
      !text(recipe.command) ||
      (recipe.args !== undefined && !strings(recipe.args)) ||
      recipe.url !== undefined ||
      recipe.auth === 'header' ||
      recipe.auth === 'oauth'
    )
      fail(
        'access.mcp.install',
        'a stdio command with optional arguments and no inline authentication',
      )
    if (
      recipe.token_env !== undefined &&
      (!text(recipe.token_env) || !/^[A-Z_][A-Z0-9_]*$/.test(recipe.token_env))
    )
      fail('access.mcp.install.token_env', 'an environment variable name')
    if (recipe.auth === 'header' && !recipe.token_env)
      fail('access.mcp.install.token_env', 'a bearer-token environment variable name')
  }
  if (!isObject(value.operations) || !Object.keys(value.operations).length)
    fail('operations', 'at least one taxonomy operation')
  const operations = value.operations as Record<string, unknown>
  if (Object.hasOwn(operations, 'docs.update') && !Object.hasOwn(operations, 'docs.read'))
    fail('operations.docs.update', 'docs.read for same-operation read-modify-write')
  const capabilities = value.capabilities as string[]
  for (const [operation, mapping] of Object.entries(operations)) {
    if (
      !OPERATIONS.has(operation) ||
      !capabilities.some((capability) => operation.startsWith(`${capability}.`))
    )
      fail(`operations.${operation}`, 'an operation belonging to a declared taxonomy capability')
    if (
      !isObject(mapping) ||
      !allowed(mapping, ['tool', 'args', 'guidance']) ||
      !text(mapping.tool) ||
      (mapping.args !== undefined && !isObject(mapping.args))
    )
      fail(`operations.${operation}`, 'a tool mapping with optional args and guidance')
    if (operation.startsWith('flags.') && isObject(mapping)) {
      const dangerous =
        /(?:^|[._:/-])(?:toggle|setFlag|updateFlag|setEnabled|enableFlag|disableFlag|applyChange)(?:$|[._:/-])/i
      const routes = isObject(mapping.args)
        ? Object.entries(mapping.args)
            .filter(([key]) =>
              /^(?:method|action|operation|endpoint|path|url|command|argv)$/i.test(key),
            )
            .flatMap(([, value]) =>
              typeof value === 'string'
                ? [value]
                : Array.isArray(value)
                  ? value.filter((entry): entry is string => typeof entry === 'string')
                  : [],
            )
        : []
      if (
        dangerous.test(String(mapping.tool)) ||
        routes.some((value) => dangerous.test(value)) ||
        (isObject(mapping.args) &&
          (mapping.args.apply === true || mapping.args.proposalOnly === false))
      )
        fail(`operations.${operation}`, 'a proposal-only mapping without known toggle/apply routes')
    }
    if (operation === 'comms.draft' && isObject(mapping)) {
      const dangerous = /(?:^|[._:/-])(?:send|sendMessage|postMessage|publish)(?:$|[._:/-])/i
      const routes = isObject(mapping.args)
        ? Object.entries(mapping.args)
            .filter(([key]) =>
              /^(?:method|action|operation|endpoint|path|url|command|argv)$/i.test(key),
            )
            .flatMap(([, value]) =>
              typeof value === 'string'
                ? [value]
                : Array.isArray(value)
                  ? value.filter((entry): entry is string => typeof entry === 'string')
                  : [],
            )
        : []
      if (
        dangerous.test(String(mapping.tool)) ||
        routes.some((value) => dangerous.test(value)) ||
        (isObject(mapping.args) && (mapping.args.send === true || mapping.args.draft === false))
      )
        fail('operations.comms.draft', 'a draft-only mapping without a sending route')
    }
    if (
      isObject(mapping) &&
      mapping.guidance !== undefined &&
      (!text(mapping.guidance) ||
        mapping.guidance.startsWith('/') ||
        mapping.guidance.split(/[\\/]/).includes('..'))
    )
      fail(`operations.${operation}.guidance`, 'a relative guidance path within the provider')
  }
  if (
    capabilities.some(
      (capability) =>
        !Object.keys(operations).some((operation) => operation.startsWith(`${capability}.`)),
    )
  )
    fail('capabilities', 'at least one mapping for every capability')
  if (
    !isObject(value.degrade) ||
    Object.keys(value.degrade).some((operation) => !Object.hasOwn(operations, operation))
  )
    fail('degrade', 'only declared operations')
  const degrade = value.degrade as Record<string, unknown>
  for (const operation of Object.keys(operations))
    if (
      typeof degrade[operation] !== 'string' ||
      !['open-question', 'handoff-artifact', 'skip-with-reason'].includes(
        degrade[operation] as string,
      )
    )
      fail(`degrade.${operation}`, 'an explicit degradation behavior')
  for (const operation of Object.keys(operations))
    if (operation.startsWith('source.') && degrade[operation] !== 'open-question')
      fail(`degrade.${operation}`, 'open-question for an unavailable evidence source')
}
