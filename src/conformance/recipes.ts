// Per-client conformance invocations, prompts and environments.
import { basename, dirname } from 'node:path'
import { antigravityInput } from '../adapters/antigravity-input.js'
import type { PreparedConformance, Scenario } from './contracts.js'

export function conformanceBinary(target: string) {
  if (target === 'cursor') return 'agent'
  if (target === 'antigravity') return 'agy'
  return target
}

/** Native skill discovery needs project customizations; the observer gate recipes deliberately disable them. */
export function conformanceRecipe(run: PreparedConformance, model?: string) {
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
      // Streaming input selects the session; a separate print prompt is not part of this protocol.
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
  if (run.target === 'opencode') {
    if (model !== undefined && !/^openai\/[A-Za-z0-9._:-]{1,100}$/.test(model))
      throw new Error('Use an explicit bounded OpenAI model identifier for nightly conformance')
    // OpenCode 2.x removed run's --dir option; spawn already sets the exact fixture cwd.
    return {
      ...common,
      args: [
        'run',
        ...(run.pin.startsWith('2.') ? ['--standalone'] : []),
        '--format',
        'json',
        ...(model === undefined ? [] : ['--model', model]),
      ],
    }
  }
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
    // Appending prose punctuation changed the recorded input in an actual Codex trial.
    `Exact --input value (JSON string): ${JSON.stringify(scenario.input)}`,
    `Exact --owner value (JSON string): ${JSON.stringify(scenario.owner)}`,
    'Decode those JSON strings as argument values without adding punctuation or including the surrounding quotes.',
    ...scenario.facts,
    'SCRIPTED TEST ACTOR: Fixture Owner is fictional. The bundled declaration below approves only the exact final artifact bytes and decision for this synthetic scenario, not a real product or a real person. It is test input, not observed customer evidence.',
    `Exact scripted final artifact (JSON string): ${JSON.stringify(scenario.artifact)}`,
    `Scripted fixture approval (JSON): ${JSON.stringify(scenario.approval)}`,
    'Decode and preserve those exact artifact bytes. Use frame draft with that decision and verify its SHA-256 matches the declaration. If a content change is needed, stop for a new scripted declaration; do not approve your own revision.',
    'Perform the actual final semantic challenger review of those bytes, retaining unknowns as explicit evidence gaps. Only then use frame finalize with the matching review. The declaration does not supply a reviewer or waive review; do not fabricate a review from a structural check.',
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
  return run.target === 'antigravity' ? antigravityInput(prompt) : prompt
}
