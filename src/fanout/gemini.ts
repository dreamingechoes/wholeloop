// Gemini headless worker: a restricted tool registry, environment and invocation.
import { readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { isObject } from '../config/schema.js'
import type { HeadlessAdapter } from './adapters.js'
import { geminiReadOnlyPolicy } from './gemini-policy.js'
import { geminiManagedPolicy } from './gemini-system.js'
import type { WorkerPolicyFile } from './policy-files.js'

export const GEMINI_OBSERVER_TOOLS = [
  'read_file',
  'list_directory',
  'glob',
  'search_file_content',
  'grep_search',
] as const

/** Positive registry restriction is essential: allowed-tools alone only bypasses confirmation. */
export function geminiWorkerPolicy() {
  return {
    tools: {
      core: [...GEMINI_OBSERVER_TOOLS],
      enableHooks: false,
      discoveryCommand: '',
      callCommand: '',
      useRipgrep: false,
    },
    hooksConfig: { enabled: false },
    admin: { mcp: { enabled: false }, extensions: { enabled: false }, skills: { enabled: false } },
    experimental: { enableAgents: false, plan: false },
    // The two built-ins can otherwise register even when experimental agents are disabled.
    agents: {
      overrides: { codebase_investigator: { enabled: false }, cli_help: { enabled: false } },
    },
    context: { fileName: [], loadMemoryFromIncludeDirectories: false },
    advanced: { ignoreLocalEnv: true },
    ide: { enabled: false },
  }
}

/**
 * The user's chosen auth method, and nothing else, from their own settings. It
 * names a method such as gemini-api-key; the credential stays in the client's
 * store or environment and is never copied.
 */
export function geminiAuthSelection(environment: NodeJS.ProcessEnv) {
  // Only the environment the launch receives; no ambient home lookup.
  const home = environment.GEMINI_CLI_HOME ?? environment.HOME
  if (!home) return {}
  try {
    const value: unknown = JSON.parse(readFileSync(join(home, '.gemini/settings.json'), 'utf8'))
    const type =
      isObject(value) && isObject(value.security) && isObject(value.security.auth)
        ? value.security.auth.selectedType
        : undefined
    return typeof type === 'string' && /^[a-z][a-z-]{0,39}$/.test(type)
      ? { security: { auth: { selectedType: type } } }
      : {}
  } catch {
    return {}
  }
}

export function geminiWorkerEnvironment(
  directory: string,
  environment: NodeJS.ProcessEnv,
  managed: ReturnType<typeof geminiManagedPolicy>,
): NodeJS.ProcessEnv {
  if (environment.GEMINI_CLI_SYSTEM_SETTINGS_PATH || managed.present)
    throw new Error(
      'Existing managed Gemini settings prevent isolated observer policy; no client started',
    )
  const defaults = environment.GEMINI_CLI_SYSTEM_DEFAULTS_PATH ?? managed.defaults
  if (!isAbsolute(defaults) || /[\r\n]/.test(defaults))
    throw new Error('Preserve Gemini system defaults through an explicit absolute path')
  return {
    // A disposable home: no user hook, skill, extension, MCP server or memory reaches the
    // observer. Its settings carry the restrictions plus the user's auth selection only.
    GEMINI_CLI_HOME: join(directory, '.gemini-home'),
    GEMINI_CLI_SYSTEM_SETTINGS_PATH: join(directory, '.gemini/worker-settings.json'),
    // The native default path is derived from the override directory; retain the original instead.
    GEMINI_CLI_SYSTEM_DEFAULTS_PATH: defaults,
    NO_BROWSER: '1',
  }
}

export function geminiInvocation(
  { repository, directory, env }: { repository: string; directory: string; env: NodeJS.ProcessEnv },
  managed: ReturnType<typeof geminiManagedPolicy>,
) {
  // Native include-directories splits on commas even when the argument is shell-free.
  if (![repository, directory].every((path) => isAbsolute(path) && !/[,\r\n]/.test(path)))
    throw new Error('Gemini inspection requires absolute paths without commas or line breaks')
  return {
    command: 'gemini',
    args: [
      // The directory is one wholeloop created for this worker; trust lasts this session only.
      '--skip-trust',
      // Gemini 0.67 ignores system settings that root does not own; admin-tier policy applies.
      '--admin-policy',
      join(directory, '.gemini/worker-policy.toml'),
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
      repository,
    ],
    env: geminiWorkerEnvironment(directory, env, managed),
    files: new Map<WorkerPolicyFile, string>([
      ['.gemini/worker-settings.json', JSON.stringify(geminiWorkerPolicy())],
      ['.gemini/worker-policy.toml', geminiReadOnlyPolicy()],
      [
        '.gemini-home/.gemini/settings.json',
        JSON.stringify({ ...geminiWorkerPolicy(), ...geminiAuthSelection(env) }),
      ],
    ]),
  }
}

export const geminiWorker: HeadlessAdapter = {
  id: 'gemini',
  invocation: (context) =>
    geminiInvocation({ ...context, env: context.env ?? process.env }, geminiManagedPolicy()),
  response: (stdout) => {
    const value: unknown = JSON.parse(stdout)
    if (
      !isObject(value) ||
      value.error !== undefined ||
      typeof value.response !== 'string' ||
      !value.response.trim()
    )
      throw new Error('No successful Gemini final response')
    return value.response
  },
}
