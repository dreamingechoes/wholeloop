import { isAbsolute, join } from 'node:path'
import type { Schema } from '../config/schema.js'
import { isObject } from '../config/schema.js'
import { contractDigest } from '../contracts/compatibility.js'
import { headlessAdapter } from '../fanout/adapters.js'
import { generationSchema } from '../fanout/response-schema.js'
import { safeSourceText } from './input.js'
import { claudeSandboxProfile, type NativeClaudeContainment } from './native-claude-sandbox.js'
import { workerProposalResponseSchema } from './worker-proposal.js'
import {
  validateWorkerAssignment,
  type WorkerAssignment,
  workerResponseSchema,
} from './worker-protocol.js'

export const NATIVE_DELIVERY_TARGETS = [
  'claude',
  'codex',
  'opencode',
  'copilot',
  'cursor',
  'gemini',
  'antigravity',
] as const
export type NativeDeliveryTarget = (typeof NATIVE_DELIVERY_TARGETS)[number]
export const REFERENCE_NATIVE_VERSIONS = { claude: '2.1.316', codex: '0.166.0' } as const
export interface NativeDeliveryRecipe {
  target: NativeDeliveryTarget
  version: string
  command: string
  args: string[]
  cwd: string
  files: Map<string, string>
  policy: string
  response(stdout: string): string
}
export type NativeRecipeResult =
  | { available: true; recipe: NativeDeliveryRecipe }
  | {
      available: false
      reason:
        | 'unknown-target'
        | 'expanded-target-unverified'
        | 'native-version-unverified'
        | 'missing-workspace'
        | 'unexpected-workspace'
        | 'unexpected-containment'
    }

/** argv contains non-secret policy only; quote TOML keys/values rather than constructing shell commands. */
export function nativeTomlLiteral(
  value: string | boolean | number | unknown[] | Record<string, unknown>,
): string {
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'boolean' || typeof value === 'number') return String(value)
  if (Array.isArray(value))
    return `[${value.map((item) => nativeTomlLiteral(item as Parameters<typeof nativeTomlLiteral>[0])).join(',')}]`
  return `{${Object.entries(value)
    .map(
      ([key, child]) =>
        `${JSON.stringify(key)}=${nativeTomlLiteral(child as Parameters<typeof nativeTomlLiteral>[0])}`,
    )
    .join(',')}}`
}
function generationContract(rule: Schema): Schema {
  const result = structuredClone(rule)
  if (result.const !== undefined) result.enum = [result.const]
  if (result.properties)
    result.properties = Object.fromEntries(
      Object.entries(result.properties)
        .filter(([key]) => result.required?.includes(key))
        .map(([key, child]) => [key, generationContract(child)]),
    )
  if (result.items) result.items = generationContract(result.items)
  return result
}

/**
 * Claude Code 2.1.316 validates --json-schema with a validator that does not
 * know draft 2020-12 and rejects the declaration itself, so every structured
 * launch failed before the model. The schemas use no 2020-12-only keyword, so
 * dropping the declaration keeps the same constraints; the core still decodes
 * every response against the original schema.
 */
function withoutDraftDeclaration(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutDraftDeclaration)
  if (!isObject(value)) return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== '$schema')
      .map(([key, child]) => [key, withoutDraftDeclaration(child)]),
  )
}

/** Dedicated recipes never broaden the existing read-only gate launchers or select a fallback model. */
export function nativeDeliveryRecipe(input: {
  target: string
  version: string
  assignment: WorkerAssignment
  directory: string
  workspace?: string
  model?: string
  output?: 'files' | 'inline-proposal'
  /** Claude Code only: the operating system profile the launch runs inside (ADR-0203). */
  containment?: NativeClaudeContainment
}): NativeRecipeResult {
  validateWorkerAssignment(input.assignment)
  if (!NATIVE_DELIVERY_TARGETS.includes(input.target as NativeDeliveryTarget))
    return { available: false, reason: 'unknown-target' }
  if (input.target !== 'claude' && input.target !== 'codex')
    return { available: false, reason: 'expanded-target-unverified' }
  if (input.version !== REFERENCE_NATIVE_VERSIONS[input.target])
    return { available: false, reason: 'native-version-unverified' }
  // Codex contains tool commands through its own permission profile.
  if (input.containment && input.target !== 'claude')
    return { available: false, reason: 'unexpected-containment' }
  if (
    (input.assignment.tools.workspace === 'write' || input.assignment.candidates.length > 0) &&
    !input.workspace
  )
    return { available: false, reason: 'missing-workspace' }
  for (const path of [input.directory, ...(input.workspace ? [input.workspace] : [])]) {
    safeSourceText(path, 4096)
    if (!isAbsolute(path) || /[\r\n\0]/.test(path))
      throw new Error('Native paths must be absolute and bounded')
  }
  if (input.assignment.tools.workspace === 'none' && input.workspace)
    return { available: false, reason: 'unexpected-workspace' }
  if (input.model !== undefined) {
    safeSourceText(input.model, 256)
    if (!input.model.trim() || input.model.startsWith('-') || /[\r\n\0]/.test(input.model))
      throw new Error('Provide one explicit bounded native model identifier')
  }
  if (input.output !== undefined && !['files', 'inline-proposal'].includes(input.output))
    throw new Error('Provide one supported native output protocol')
  const schema =
    input.output === 'inline-proposal'
      ? workerProposalResponseSchema(input.assignment)
      : workerResponseSchema(input.assignment)
  const files = new Map<string, string>()
  let args: string[]
  if (input.target === 'claude') {
    // Restricted mode drops WebFetch unless --tools names it; only a research
    // job's assignment carries web reads (ADR-0204).
    const tools = [
      input.assignment.tools.workspace === 'write' ? 'Read,Glob,Grep,Edit,Write' : 'Read,Glob,Grep',
      ...(input.assignment.tools.web === 'read' ? ['WebSearch,WebFetch'] : []),
    ].join(',')
    args = [
      '--print',
      '--output-format',
      'json',
      '--permission-mode',
      'dontAsk',
      '--permission-prompts',
      'none',
      '--restricted',
      '--tools',
      tools,
      '--allowedTools',
      tools,
      '--disallowedTools',
      'mcp__*',
      '--strict-mcp-config',
      '--mcp-config',
      '{"mcpServers":{}}',
      '--setting-sources',
      '',
      '--safe-mode',
      '--no-session-persistence',
      '--json-schema',
      JSON.stringify(withoutDraftDeclaration(schema)),
      ...(input.workspace ? ['--add-dir', input.workspace] : []),
      ...(input.model ? ['--model', input.model] : []),
    ]
  } else {
    const filesystem: Record<string, string> = {
      ':minimal': 'read',
      [input.directory]: 'read',
      [join(input.directory, 'outputs')]: input.output === 'inline-proposal' ? 'read' : 'write',
      [join(input.directory, 'inputs')]: 'read',
      [join(input.directory, 'response.schema.json')]: 'read',
      ...(input.workspace
        ? { [input.workspace]: input.assignment.tools.workspace === 'write' ? 'write' : 'read' }
        : {}),
    }
    const config: Record<string, Parameters<typeof nativeTomlLiteral>[0]> = {
      default_permissions: 'wholeloop',
      'permissions.wholeloop': { filesystem, network: { enabled: false } },
      'features.shell_tool': false,
      // Command visibility belongs to shell_tool. The reference client's
      // resumable executor stays enabled even when its user opt-out is false.
      'features.unified_exec_tty': false,
      'features.shell_snapshot': false,
      'features.computer_use': false,
      'features.browser_use': false,
      'features.browser_use_external': false,
      'features.browser_use_full_cdp_access': false,
      'features.browser_annotation_api': false,
      'features.in_app_browser': false,
      'features.auth_elicitation': false,
      'features.goals': false,
      'features.guardian_approval': false,
      'features.daemon_auto_start': false,
      'features.multi_agent': false,
      'features.multi_agent_v2': false,
      'features.multi_agent_v2_dynamic_tools': false,
      'features.agent_message_board': false,
      'features.apps': false,
      'features.plugins': false,
      'features.memories': false,
      'features.hooks': false,
      'features.remote_plugin': false,
      'features.skill_mcp_dependency_install': false,
      'features.request_permissions_tool': false,
      'features.default_mode_request_user_input': false,
      // Enabled by default in 0.166.0. Elicitation lets an MCP tool ask the
      // user mid-run, which a none-policy run must never do even with no
      // servers configured; the other two are tools no assignment needs.
      'features.tool_call_mcp_elicitation': false,
      'features.image_generation': false,
      'features.tool_suggest': false,
      'skills.bundled.enabled': false,
      'skills.include_instructions': false,
      'tools.view_image': false,
      web_search: input.assignment.tools.web === 'read' ? 'live' : 'disabled',
      mcp_servers: {},
      project_doc_max_bytes: 0,
      'shell_environment_policy.inherit': 'none',
    }
    // --sandbox would override permission profiles and restore broad read access.
    args = [
      '--no-daemon',
      '--ask-for-approval',
      'never',
      'exec',
      '--ephemeral',
      '--ignore-user-config',
      '--ignore-rules',
      ...Object.entries(config).flatMap(([key, value]) => [
        '--config',
        `${key}=${nativeTomlLiteral(value)}`,
      ]),
      '--cd',
      input.directory,
      '--skip-git-repo-check',
      '--json',
      '--output-schema',
      join(input.directory, 'response.schema.json'),
      ...(input.model ? ['--model', input.model] : []),
      '-',
    ]
    files.set(
      'response.schema.json',
      `${JSON.stringify(generationSchema(generationContract(schema)))}\n`,
    )
  }
  const target = input.target
  let command: string = target
  if (input.containment) {
    // The profile is part of argv and therefore of the policy digest, so an
    // observation of one profile can never admit a launch under another.
    if (input.containment.kind !== 'macos-sandbox')
      throw new Error('Provide one supported native containment')
    args = [
      '-p',
      claudeSandboxProfile({
        containment: input.containment,
        directory: input.directory,
        output: input.output ?? 'files',
        ...(input.workspace ? { workspace: input.workspace } : {}),
        workspaceWrite: input.assignment.tools.workspace === 'write',
      }),
      input.containment.client,
      ...args,
    ]
    command = input.containment.sandbox
  }
  const policy = contractDigest({
    target,
    version: input.version,
    assignment: input.assignment.assignment,
    args,
    cwd: input.directory,
    files: [...files],
    tools: input.assignment.tools,
    ...(input.containment ? { containment: input.containment } : {}),
  })
  return {
    available: true,
    recipe: {
      target,
      version: input.version,
      command,
      args,
      cwd: input.directory,
      files,
      policy,
      response: (stdout) => {
        if (target === 'claude') {
          const value: unknown = JSON.parse(stdout)
          if (isObject(value) && value.is_error !== true && isObject(value.structured_output))
            return JSON.stringify(value.structured_output)
        }
        return headlessAdapter(target).response(stdout, input.directory)
      },
    },
  }
}

/** What a client says a launch consumed. It is a report, never a metered or enforced limit. */
export interface NativeUsage {
  provenance: 'client-reported'
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  /** The client's own cost estimate in millionths of a dollar; subscriptions are not billed per call. */
  costMicros?: number
}
const count = (value: unknown) =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1e12 ? value : 0

/**
 * Reads usage from the reference clients' own machine output: Claude's single
 * JSON result, or the sum of Codex's turn.completed events. Anything else, or
 * a malformed report, yields no usage rather than a guess.
 */
export function nativeUsage(target: string, stdout: string): NativeUsage | undefined {
  try {
    if (target === 'claude') {
      const value: unknown = JSON.parse(stdout)
      if (!isObject(value) || !isObject(value.usage)) return undefined
      const usage = value.usage,
        cost = value.total_cost_usd
      return {
        provenance: 'client-reported',
        inputTokens: count(usage.input_tokens),
        outputTokens: count(usage.output_tokens),
        cacheReadTokens: count(usage.cache_read_input_tokens),
        cacheCreationTokens: count(usage.cache_creation_input_tokens),
        ...(typeof cost === 'number' && cost >= 0 && cost < 1e6
          ? { costMicros: Math.round(cost * 1e6) }
          : {}),
      }
    }
    if (target === 'codex') {
      const turns = stdout
        .split('\n')
        .filter((line) => line.includes('"turn.completed"'))
        .map((line) => JSON.parse(line) as unknown)
        .filter(
          (event) => isObject(event) && event.type === 'turn.completed' && isObject(event.usage),
        )
        .map((event) => (event as { usage: Record<string, unknown> }).usage)
      if (!turns.length) return undefined
      const sum = (key: string) => turns.reduce((total, usage) => total + count(usage[key]), 0)
      return {
        provenance: 'client-reported',
        inputTokens: sum('input_tokens'),
        outputTokens: sum('output_tokens'),
        cacheReadTokens: sum('cached_input_tokens'),
        cacheCreationTokens: 0,
      }
    }
  } catch {
    return undefined
  }
  return undefined
}
