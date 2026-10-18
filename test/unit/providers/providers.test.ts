import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { parse as parseToml } from 'smol-toml'
import { describe, expect, it } from 'vitest'
import { stringify } from 'yaml'
import { BUILTINS } from '../../../src/providers/builtins.js'
import { detectMcp, detectProvider, parseJsonConfig } from '../../../src/providers/detect.js'
import { loadProviders, resolveProvider } from '../../../src/providers/load.js'
import { type Provider, validateProvider } from '../../../src/providers/manifest.js'
import { MCP_TARGETS, renderMcp } from '../../../src/providers/mcp.js'
import schema from '../../../src/providers/schema.json' with { type: 'json' }
import { OPERATIONS, TAXONOMY } from '../../../src/providers/taxonomy.js'

function support(id = 'support'): Provider {
  return {
    schema: 1,
    id,
    name: 'Support',
    description: 'Read support evidence.',
    capabilities: ['source.support'],
    access: {
      mcp: {
        server: id,
        install: { transport: 'http', url: 'https://mcp.example.com/mcp', auth: 'oauth' },
      },
    },
    operations: { 'source.support.query': { tool: 'search_tickets' } },
    degrade: { 'source.support.query': 'open-question' },
  }
}
function fixture(operation: (root: string, user: string, dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-providers-'))
  try {
    operation(join(dir, 'repo'), join(dir, 'user'), dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
function manifest(directory: string, value: Record<string, unknown> | Provider): void {
  const file = join(directory, String(value.id), 'provider.yml')
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, stringify(value))
}

describe('provider contracts', () => {
  it('keeps the public schema vocabulary aligned with the runtime taxonomy', () => {
    expect(schema.properties.capabilities.items.enum).toEqual(Object.keys(TAXONOMY))
    expect(schema.properties.operations.propertyNames.enum).toEqual([...OPERATIONS])
  })
  it('resolves local destinations with zero configuration', () =>
    fixture((root, user) => {
      const registry = loadProviders({ root, user })
      expect(registry.problems).toEqual([])
      expect(resolveProvider(registry, 'docs.create').manifest.id).toBe('local-docs')
      expect(resolveProvider(registry, 'tracker.create-item').manifest.id).toBe('local-tracker')
      expect(resolveProvider(registry, 'source.web.query').manifest.id).toBe('native-web')
      expect(() => resolveProvider(registry, 'comms.send')).toThrow('No configured provider')
      for (const builtin of BUILTINS) expect(() => validateProvider(builtin)).not.toThrow()
    }))
  it.each(['comms.send', 'flags.toggle', 'codehost.merge-pr', 'docs.delete'])(
    'rejects unsafe or unknown operation %s',
    (operation) => {
      const value = support()
      value.operations = { [operation]: { tool: 'unsafe' } }
      expect(() => validateProvider(value)).toThrow('taxonomy')
    },
  )
  it('requires explicit degradation and rejects inline credential fields', () => {
    const value = support()
    value.degrade = {}
    expect(() => validateProvider(value)).toThrow('degradation')
    const inline = support() as unknown as { access: { mcp: { install: Record<string, unknown> } } }
    inline.access.mcp.install.headers = { Authorization: `\${AUTH_FROM_STORE}` }
    expect(() => validateProvider(inline)).toThrow('without inline credentials')
    const url = support()
    if (url.access.mcp) url.access.mcp.install.url = 'https://example.com/mcp?auth=reference'
    expect(() => validateProvider(url)).toThrow('without credentials')
  })
  it('replaces by id, extends lower layers, and preserves inherited guidance resources', () =>
    fixture((root, user) => {
      const source = support()
      source.operations['source.support.query'] = { tool: 'search', guidance: 'guidance.md' }
      manifest(join(user, 'providers'), source)
      writeFileSync(
        join(user, 'providers/support/guidance.md'),
        'Read evidence before making a claim.\n',
      )
      manifest(join(root, '.wholeloop/providers'), {
        schema: 1,
        id: 'support',
        extends: 'support',
        description: 'Team guidance.',
      })
      manifest(join(root, '.wholeloop/providers'), {
        schema: 1,
        id: 'local-docs',
        extends: 'builtin:local-docs',
        description: 'Team local documents.',
      })
      const registry = loadProviders({ root, user })
      expect(registry.problems).toEqual([])
      const selected = resolveProvider(registry, 'source.support.query', 'support')
      expect(selected.manifest.description).toBe('Team guidance.')
      expect(selected.manifest.operations['source.support.query']?.tool).toBe('search')
      expect(readFileSync(selected.guidance['source.support.query'] ?? '', 'utf8')).toContain(
        'Read evidence',
      )
      expect(resolveProvider(registry, 'docs.create').manifest.description).toBe(
        'Team local documents.',
      )
      manifest(join(root, '.wholeloop/providers'), {
        schema: 1,
        id: 'local-docs',
        name: 'Invalid replacement',
      })
      const invalid = loadProviders({ root, user })
      expect(invalid.problems).toHaveLength(1)
      expect(resolveProvider(invalid, 'docs.create').origin).toBe('builtin:local-docs')
    }))
  it('detects inheritance cycles and reads declared package manifests without executing code', () =>
    fixture((root, user) => {
      manifest(join(root, '.wholeloop/providers'), { schema: 1, id: 'a', extends: 'b' })
      manifest(join(root, '.wholeloop/providers'), { schema: 1, id: 'b', extends: 'a' })
      const packageRoot = join(root, 'node_modules/acme-kit')
      mkdirSync(packageRoot, { recursive: true })
      writeFileSync(
        join(packageRoot, 'package.json'),
        '{"name":"acme-kit","version":"1.0.0","main":"index.js"}',
      )
      writeFileSync(
        join(packageRoot, 'index.js'),
        'throw new Error("Package code must never execute")\n',
      )
      manifest(join(packageRoot, 'providers'), support('package-support'))
      const registry = loadProviders({ root, user, packages: ['acme-kit@^1'] })
      expect(registry.problems).toHaveLength(2)
      expect(resolveProvider(registry, 'source.support.query', 'package-support').manifest.id).toBe(
        'package-support',
      )
    }))
})

describe('MCP rendering', () => {
  for (const target of MCP_TARGETS)
    for (const transport of ['http', 'stdio'] as const)
      it(`${target} ${transport} matches its golden configuration`, () => {
        const provider = support()
        if (provider.access.mcp && transport === 'stdio')
          provider.access.mcp.install = {
            transport: 'stdio',
            command: 'test-mcp',
            args: ['--readonly'],
          }
        const rendered = renderMcp(provider, target)
        expect(rendered.applied).toBe(false)
        expect(rendered).toMatchSnapshot()
        const parsed =
          rendered.format === 'toml' ? parseToml(rendered.snippet) : JSON.parse(rendered.snippet)
        expect(parsed).toBeTypeOf('object')
      })
  it('renders only bearer environment names and rejects unsupported Copilot header expansion', () => {
    const provider = support()
    if (provider.access.mcp)
      provider.access.mcp.install = {
        transport: 'http',
        url: 'https://mcp.example.com/mcp',
        auth: 'header',
        token_env: 'SUPPORT_AUTH',
      }
    validateProvider(provider)
    expect(renderMcp(provider, 'codex').snippet).toContain('bearer_token_env_var = "SUPPORT_AUTH"')
    expect(renderMcp(provider, 'claude').snippet).toContain(`Bearer \${SUPPORT_AUTH}`)
    expect(renderMcp(provider, 'opencode').snippet).toContain('Bearer {env:SUPPORT_AUTH}')
    expect(() => renderMcp(provider, 'copilot')).toThrow('do not expand')
  })
})

describe('provider detection', () => {
  it('parses JSONC without changing comment-like strings', () => {
    expect(
      parseJsonConfig('{/* comment */"url":"https://example.com/a//b", "marker":",}",}'),
    ).toEqual({ url: 'https://example.com/a//b', marker: ',}' })
    expect(() => parseJsonConfig('{/* unfinished')).toThrow('Unterminated')
  })
  it('reads each dialect, redacts parse failures and does not equate configured with authenticated', () =>
    fixture((root, _user, dir) => {
      const home = join(dir, 'home')
      const files = [
        [
          join(root, '.mcp.json'),
          '{"mcpServers":{"support":{"type":"http","url":"https://example.com"}}}',
        ],
        [join(home, '.codex/config.toml'), '[mcp_servers.support]\nurl = "https://example.com"\n'],
        [
          join(home, '.config/opencode/opencode.jsonc'),
          '{"mcp":{"support":{"type":"remote","url":"https://example.com",},},}',
        ],
        [
          join(home, '.copilot/mcp-config.json'),
          '{"mcpServers":{"support":{"type":"http","url":"https://example.com"}}}',
        ],
      ]
      for (const [file, content] of files)
        if (file && content) {
          mkdirSync(dirname(file), { recursive: true })
          writeFileSync(file, content)
        }
      const detection = detectMcp(root, home, {})
      expect(detection.problems).toEqual([])
      expect(new Set(detection.declarations.map((entry) => entry.target))).toEqual(
        new Set(MCP_TARGETS),
      )
      const result = detectProvider(support(), detection.declarations, '')
      expect(result).toMatchObject({ kind: 'mcp', available: true, authenticated: false })
      writeFileSync(join(home, '.copilot/mcp-config.json'), '{"PRIVATE_CONFIG_VALUE":')
      const invalid = detectMcp(root, home, {})
      expect(JSON.stringify(invalid)).not.toContain('PRIVATE_CONFIG_VALUE')
      expect(invalid.problems).toHaveLength(1)
      const binary = join(dir, 'bin/test-support')
      mkdirSync(dirname(binary), { recursive: true })
      writeFileSync(binary, '#!/bin/sh\nexit 99\n')
      chmodSync(binary, 0o700)
      const provider = support()
      provider.access = { cli: { binary: 'test-support', detect: 'Never run this value' } }
      expect(detectProvider(provider, [], dirname(binary)).kind).toBe('cli')
    }))
})
