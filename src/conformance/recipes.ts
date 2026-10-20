import { basename, dirname } from 'node:path'
import type { PreparedConformance, Scenario } from './contracts.js'

export function conformanceBinary(target: string) {
  if (target === 'cursor') return 'agent'
  if (target === 'antigravity') return 'agy'
  return target
}

/** Native skill discovery needs project customizations; the observer gate recipes deliberately disable them. */
export function conformanceRecipe(run: PreparedConformance) {
  const common = { command: conformanceBinary(run.target), cwd: run.root }
  if (run.target === 'cursor')
    return {
      ...common,
      command: 'agent',
      args: [
        '--print',
        '--output-format',
        'json',
        '--sandbox',
        'enabled',
        '--workspace',
        run.root,
        '--add-dir',
        run.state,
      ],
    }
  if (run.target === 'antigravity')
    return {
      ...common,
      command: 'agy',
      args: ['--input-format', 'stream-json', '--output-format', 'stream-json'],
    }
  if (run.target === 'gemini')
    return {
      ...common,
      args: [
        '--prompt',
        'Follow the scenario on standard input.',
        '--output-format',
        'json',
        '--include-directories',
        run.state,
      ],
    }
  if (run.target === 'claude')
    return {
      ...common,
      args: [
        '--print',
        '--output-format',
        'json',
        '--no-session-persistence',
        '--permission-prompts',
        'none',
        '--add-dir',
        run.state,
        '--strict-mcp-config',
        '--mcp-config',
        '{"mcpServers":{}}',
      ],
    }
  if (run.target === 'codex')
    return {
      ...common,
      args: [
        '--ask-for-approval',
        'never',
        'exec',
        '--sandbox',
        'workspace-write',
        '--ephemeral',
        '--ignore-user-config',
        '--config',
        'mcp_servers={}',
        '--cd',
        run.root,
        '--add-dir',
        run.state,
        '--json',
        '-',
      ],
    }
  if (run.target === 'opencode')
    return { ...common, args: ['run', '--format', 'json', '--dir', run.root] }
  if (run.target === 'copilot')
    return {
      ...common,
      args: [
        '--output-format',
        'json',
        '--no-ask-user',
        '--no-auto-update',
        '--log-level',
        'none',
        '--disable-builtin-mcps',
        '--add-dir',
        run.root,
        '--add-dir',
        run.state,
      ],
    }
  throw new Error('Unknown conformance target')
}

export function conformancePrompt(run: PreparedConformance, scenario: Scenario): string {
  return [
    `Run the project-local ${basename(dirname(run.skill))} skill once, standalone. Load its actual installed SKILL.md and follow its instructions.`,
    `The project skill is at ${JSON.stringify(run.skill)}. Use its checked launcher: node ${JSON.stringify(run.launcher)}.`,
    `Idea: ${scenario.input}. Owner: ${scenario.owner}.`,
    'Pass the exact idea sentence as --input and the exact owner as --owner.',
    ...scenario.facts,
    `Write the framing draft only at ${JSON.stringify(run.artifact)}; runtime state is ${JSON.stringify(run.state)}.`,
    'Do not edit the repository, change configuration, commit, push, call remote services or start another step. Do not invent evidence, metrics, validation or approvals.',
    'Complete frame-problem through the installed core, show its receipt and stop. If native trust or permissions block it, report the blocker without bypassing them.',
  ].join('\n')
}

export function conformanceEnvironment(
  run: PreparedConformance,
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...source,
    XDG_CONFIG_HOME: `${run.home}/config`,
    XDG_STATE_HOME: `${run.home}/state`,
  }
  // An inherited topic or workspace would redirect the fixture's core or bind it to real work.
  delete env.WL_WORKSPACE
  delete env.WL_SUBJECT
  return env
}

/** Antigravity accepts a documented JSONL user event rather than an assumed plain stdin prompt. */
export function conformanceInput(run: PreparedConformance, scenario: Scenario): string {
  const prompt = conformancePrompt(run, scenario)
  return run.target === 'antigravity'
    ? `${JSON.stringify({ event: 'user', message: { content: prompt } })}\n`
    : prompt
}
