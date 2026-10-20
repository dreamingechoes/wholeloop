import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { headlessAdapter } from '../../../src/fanout/adapters.js'
import {
  GEMINI_OBSERVER_TOOLS,
  geminiInvocation,
  geminiWorkerEnvironment,
  geminiWorkerPolicy,
} from '../../../src/fanout/gemini.js'
import { geminiSystemPaths } from '../../../src/fanout/gemini-system.js'
import { stageWorkerPolicy, type WorkerPolicyFile } from '../../../src/fanout/policy-files.js'

const managed = {
  settings: '/native/settings.json',
  defaults: '/native/system-defaults.json',
  present: false,
}
const context = { repository: '/repo with spaces', directory: '/external/worker', env: {} }

describe('Gemini private observer policy', () => {
  it('uses a positive core registry and disables alternate tool surfaces without changing models', () => {
    const invocation = geminiInvocation(context, managed)
    expect(headlessAdapter('gemini').id).toBe('gemini')
    expect(invocation.command).toBe('gemini')
    expect(invocation.args).toEqual([
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
      'GEMINI_CLI_SYSTEM_DEFAULTS_PATH',
      'GEMINI_CLI_SYSTEM_SETTINGS_PATH',
      'NO_BROWSER',
    ])
    expect(invocation.env.GEMINI_CLI_SYSTEM_DEFAULTS_PATH).toBe(managed.defaults)
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
    })
    expect(geminiSystemPaths('linux')).toEqual({
      settings: '/etc/gemini-cli/settings.json',
      defaults: '/etc/gemini-cli/system-defaults.json',
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
