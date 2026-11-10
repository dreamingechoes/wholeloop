import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'smol-toml'
import { describe, expect, it } from 'vitest'
import { headlessAdapter } from '../../../src/fanout/adapters.js'
import {
  GEMINI_OBSERVER_TOOLS,
  geminiAuthSelection,
  geminiInvocation,
  geminiWorkerEnvironment,
  geminiWorkerPolicy,
} from '../../../src/fanout/gemini.js'
import { geminiFramingPolicy, geminiReadOnlyPolicy } from '../../../src/fanout/gemini-policy.js'
import { geminiSystemPaths } from '../../../src/fanout/gemini-system.js'
import { stageWorkerPolicy, type WorkerPolicyFile } from '../../../src/fanout/policy-files.js'

const managed = {
  settings: '/native/settings.json',
  defaults: '/native/system-defaults.json',
  policies: '/native/policies',
  present: false,
}
const context = { repository: '/repo with spaces', directory: '/external/worker', env: {} }

describe('Gemini private observer policy', () => {
  it('uses a positive core registry and disables alternate tool surfaces without changing models', () => {
    const invocation = geminiInvocation(context, managed)
    expect(headlessAdapter('gemini').id).toBe('gemini')
    expect(invocation.command).toBe('gemini')
    expect(invocation.args).toEqual([
      '--skip-trust',
      '--admin-policy',
      '/external/worker/.gemini/worker-policy.toml',
      '--prompt',
      'Follow the read-only assignment on standard input.',
      '--output-format',
      'json',
      '--approval-mode',
      'default',
      '--allowed-tools',
      GEMINI_OBSERVER_TOOLS.join(','),
      '--extensions',
      'none',
      '--include-directories',
      context.repository,
    ])
    const policy = JSON.parse(invocation.files.get('.gemini/worker-settings.json') ?? '')
    expect(policy.tools.core).toEqual([...GEMINI_OBSERVER_TOOLS])
    expect(policy.tools).toMatchObject({
      enableHooks: false,
      discoveryCommand: '',
      callCommand: '',
    })
    expect(policy.admin).toEqual({
      mcp: { enabled: false },
      extensions: { enabled: false },
      skills: { enabled: false },
    })
    expect(policy.experimental).toEqual({ enableAgents: false, plan: false })
    expect(policy.agents.overrides).toEqual({
      codebase_investigator: { enabled: false },
      cli_help: { enabled: false },
    })
    expect(policy.context.fileName).toEqual([])
    expect(policy).not.toHaveProperty('model')
    expect(policy).not.toHaveProperty('security.folderTrust')
    expect(Object.keys(invocation.env).sort()).toEqual([
      'GEMINI_CLI_HOME',
      'GEMINI_CLI_SYSTEM_DEFAULTS_PATH',
      'GEMINI_CLI_SYSTEM_SETTINGS_PATH',
      'NO_BROWSER',
    ])
    expect(invocation.env.GEMINI_CLI_SYSTEM_DEFAULTS_PATH).toBe(managed.defaults)
    // Gemini 0.67 ignores a system settings file root does not own, so the same restrictions
    // also live in the disposable home and the read-only boundary in admin-tier policy.
    expect(invocation.env.GEMINI_CLI_HOME).toBe('/external/worker/.gemini-home')
    expect(JSON.parse(invocation.files.get('.gemini-home/.gemini/settings.json') ?? '')).toEqual(
      geminiWorkerPolicy(),
    )
    expect(invocation.files.get('.gemini/worker-policy.toml')).toBe(geminiReadOnlyPolicy())
  })

  it("copies only the user's auth method into the disposable home, never a credential", () => {
    const home = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-gemini-auth-')))
    try {
      mkdirSync(join(home, '.gemini'))
      writeFileSync(
        join(home, '.gemini/settings.json'),
        JSON.stringify({
          security: { auth: { selectedType: 'gemini-api-key', apiKey: 'fake-secret' } },
          hooks: { BeforeTool: [] },
        }),
      )
      expect(geminiAuthSelection({ GEMINI_CLI_HOME: home })).toEqual({
        security: { auth: { selectedType: 'gemini-api-key' } },
      })
      const invocation = geminiInvocation({ ...context, env: { GEMINI_CLI_HOME: home } }, managed)
      const settings = invocation.files.get('.gemini-home/.gemini/settings.json') ?? ''
      expect(settings).not.toContain('fake-secret')
      expect(settings).not.toContain('BeforeTool')
      expect(geminiAuthSelection({ GEMINI_CLI_HOME: join(home, 'missing') })).toEqual({})
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it.each(['native', 'environment'] as const)(
    'refuses existing %s administrator settings',
    (kind) => {
      const env =
        kind === 'environment' ? { GEMINI_CLI_SYSTEM_SETTINGS_PATH: '/existing/policy.json' } : {}
      expect(() =>
        geminiInvocation({ ...context, env }, { ...managed, present: kind === 'native' }),
      ).toThrow(/Existing managed Gemini settings/)
    },
  )
  it('preserves an absolute custom system-defaults path instead of redirecting it', () => {
    expect(
      geminiWorkerEnvironment(
        context.directory,
        { GEMINI_CLI_SYSTEM_DEFAULTS_PATH: '/retained/defaults.json' },
        managed,
      ).GEMINI_CLI_SYSTEM_DEFAULTS_PATH,
    ).toBe('/retained/defaults.json')
    expect(() =>
      geminiWorkerEnvironment(
        context.directory,
        { GEMINI_CLI_SYSTEM_DEFAULTS_PATH: 'relative.json' },
        managed,
      ),
    ).toThrow(/absolute/)
  })
  it.each(['relative', '/repo,other', '/repo\nother', '/repo\rother'])(
    'refuses an ambiguous native include path %s',
    (repository) => {
      expect(() => geminiInvocation({ ...context, repository }, managed)).toThrow(/absolute paths/)
    },
  )
  it('keeps supported platform differences in one native path table', () => {
    expect(geminiSystemPaths('darwin')).toEqual({
      settings: '/Library/Application Support/GeminiCli/settings.json',
      defaults: '/Library/Application Support/GeminiCli/system-defaults.json',
      policies: '/Library/Application Support/GeminiCli/policies',
    })
    expect(geminiSystemPaths('linux')).toEqual({
      settings: '/etc/gemini-cli/settings.json',
      defaults: '/etc/gemini-cli/system-defaults.json',
      policies: '/etc/gemini-cli/policies',
    })
    expect(() => geminiSystemPaths('win32')).toThrow(/macOS and Linux/)
  })
  it('stages only private non-secret settings and preflights mixed native directories before writes', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-gemini-worker-')))
    const repository = join(root, "repo ' # $ with spaces"),
      directory = join(root, 'worker')
    mkdirSync(repository)
    mkdirSync(directory)
    try {
      const invocation = geminiInvocation({ repository, directory, env: {} }, managed)
      stageWorkerPolicy(directory, invocation.files)
      expect(lstatSync(join(directory, '.gemini')).mode & 0o777).toBe(0o700)
      expect(lstatSync(join(directory, '.gemini/worker-settings.json')).mode & 0o777).toBe(0o600)
      expect(
        JSON.parse(readFileSync(invocation.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH ?? '', 'utf8')),
      ).toEqual(geminiWorkerPolicy())
      expect(readdirSync(repository)).toEqual([])
      expect(() => stageWorkerPolicy(directory, invocation.files)).toThrow(/already exists/)
      const second = join(root, 'second')
      mkdirSync(second)
      symlinkSync(repository, join(second, '.gemini'))
      const batch = new Map<WorkerPolicyFile, string>([
        ['.cursor/cli.json', '{}'],
        ['.gemini/worker-settings.json', '{}'],
      ])
      expect(() => stageWorkerPolicy(second, batch)).toThrow(/Unsafe/)
      expect(readdirSync(second)).toEqual(['.gemini'])
      expect(readdirSync(repository)).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
  it('decodes only an unambiguous successful native response', () => {
    const adapter = headlessAdapter('gemini')
    expect(
      adapter.response(JSON.stringify({ response: '{"result":true}', session_id: 'fixture' }), ''),
    ).toBe('{"result":true}')
    for (const value of [
      null,
      [],
      {},
      { response: '' },
      { response: ' ' },
      { response: '{}', error: {} },
      { response: '{}', error: null },
    ])
      expect(() => adapter.response(JSON.stringify(value), '')).toThrow()
    expect(() => adapter.response('progress\n{"response":"{}"}', '')).toThrow()
  })
})

describe('Gemini admin-tier policy (0.67)', () => {
  const rules = (toml: string) => parse(toml).rule as Record<string, unknown>[]
  it('denies every tool and MCP server, then allows only reading for the observer', () => {
    const read = rules(geminiReadOnlyPolicy())
    expect(read[0]).toMatchObject({ toolName: '*', decision: 'deny' })
    expect(read[1]).toMatchObject({ toolName: '*', mcpName: '*', decision: 'deny' })
    const allowed = read.filter((rule) => rule.decision === 'allow')
    expect(allowed).toHaveLength(1)
    expect(allowed[0]?.toolName).not.toContain('write_file')
    expect(allowed[0]?.toolName).not.toContain('run_shell_command')
    expect(allowed[0]?.toolName).not.toContain('invoke_agent')
  })
  it('grants the framing scenario only its launcher and exact files', () => {
    const framing = rules(
      geminiFramingPolicy({ launcher: '/r/.gemini/skills/x/scripts/wl.mjs', files: ['/s/d.md'] }),
    )
    expect(framing).toContainEqual({
      toolName: 'run_shell_command',
      commandPrefix: '/r/.gemini/skills/x/scripts/wl.mjs',
      decision: 'allow',
      priority: 600,
    })
    const write = framing.find(
      (rule) => Array.isArray(rule.toolName) && rule.toolName.includes('write_file'),
    )
    expect(write?.argsPattern).toBe('"file_path":"\\/s\\/d\\.md"')
    // The exact-path pattern matches that file and neither a sibling nor a longer path.
    const pattern = new RegExp(String(write?.argsPattern))
    expect(pattern.test(JSON.stringify({ content: 'x', file_path: '/s/d.md' }))).toBe(true)
    expect(pattern.test(JSON.stringify({ file_path: '/s/d.md.bak' }))).toBe(false)
    expect(pattern.test(JSON.stringify({ file_path: '/s/other.md' }))).toBe(false)
    expect(() => geminiFramingPolicy({ launcher: '/a b/wl.mjs', files: [] })).toThrow(/absolute/)
  })
})
