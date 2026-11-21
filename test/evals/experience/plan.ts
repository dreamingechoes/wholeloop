// Keeps the live walk-through reproducible and reviewable without launching a client.
import { join } from 'node:path'
import { EXPERIENCE_STEPS } from '../../../src/experience/budgets.js'
import type { ExperienceClient } from '../../../src/experience/transcript.js'

export function experienceEnvironment(
  root: string,
  home: string,
  state: string,
  inherited: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  return {
    ...inherited,
    HOME: home,
    PWD: root,
    XDG_STATE_HOME: state,
    XDG_CONFIG_HOME: join(home, '.config'),
    CODEX_HOME: join(home, '.codex'),
    CLAUDE_CONFIG_DIR: join(home, '.claude'),
    COPILOT_HOME: join(home, '.copilot'),
    OPENCODE_CONFIG_DIR: join(home, '.config', 'opencode'),
    GEMINI_CLI_HOME: home,
    WL_WORKSPACE: '',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: join(home, '.gitconfig'),
  }
}

export const EXPERIENCE_QUESTIONS: Record<string, string[]> = {
  research: ['sources'],
  'frame-problem': ['owner'],
  'write-spec': ['metric'],
  'cut-scopes': ['delivery'],
  'slice-work': ['slice'],
  'build-slice': ['plan'],
}
export const FIXTURE_ANSWERS = {
  owner: 'Example Owner',
  sources: ['codebase'],
  metric: 'A local acceptance test; no external measurement service.',
  delivery: 'One standalone deliverable, manual local testing, no publication.',
  slice: 'One slice containing the three criteria.',
  plan: 'Proceed with the bounded fixture change after showing the plan.',
}
export const FIXTURE_FILES: Record<string, string> = {
  'package.json': `${JSON.stringify({ name: 'experience-fixture', private: true, type: 'module', scripts: { test: 'node --test' } }, null, 2)}\n`,
  'README.md': '# Task titles\n\nA tiny module for normalizing task titles. Run node --test.\n',
  'titles.js': 'export function title(value) { return value.trim() }\n',
  'titles.test.js': [
    "import { test } from 'node:test'",
    "import assert from 'node:assert/strict'",
    "import { title } from './titles.js'",
    "test('trims titles', () => assert.equal(title(' a '), 'a'))",
    "test('keeps words', () => assert.equal(title('a b'), 'a b'))",
    "test('allows empty titles', () => assert.equal(title(''), ''))",
    '',
  ].join('\n'),
}
export function experiencePrompt(step: string, launcher: string, store: string): string {
  if (!EXPERIENCE_STEPS.includes(step as (typeof EXPERIENCE_STEPS)[number]))
    throw new Error('Unknown step')
  return [
    `Use the installed wl-${step} skill in this fixture repository.`,
    `The exact CLI is ${JSON.stringify(launcher)}. The inherited XDG_STATE_HOME selects ${JSON.stringify(store)} as the default store. Do not add --store to commands that do not support it.`,
    'Use the prior stored work when this step needs a parent. Research is standalone; frame from that brief, then spec, scopes, slices and build.',
    'Question: how does title normalization work in this codebase?',
    'Change: collapse repeated internal spaces, reject non-string titles with TypeError, and add acceptance tests for both.',
    'Fixture answers follow. Present each required question normally, then use its fixture answer; no person is connected to answer.',
    JSON.stringify(FIXTURE_ANSWERS),
    'Choose quick rigor for research if supported; otherwise keep the current default and report it.',
    'Never publish, push, open a pull request, send a message, or call an external service.',
    'Do not change permissions, grant broad shell access, or bypass containment. A refused action stays visible.',
    'Research only reads code. Execute project code only through the execution route of the build skill.',
    'Stop after this step and return its result. Do not continue to the next step.',
  ].join('\n')
}

export function experienceRecipe(client: ExperienceClient, root: string, state: string) {
  return client === 'codex'
    ? [
        '--ask-for-approval',
        'never',
        'exec',
        '--sandbox',
        'workspace-write',
        '--ignore-user-config',
        '--config',
        'mcp_servers={}',
        '--cd',
        root,
        '--add-dir',
        state,
        '--json',
        '-',
      ]
    : [
        '--print',
        '--verbose',
        '--output-format',
        'stream-json',
        '--no-session-persistence',
        '--permission-prompts',
        'none',
        '--add-dir',
        state,
        '--strict-mcp-config',
        '--mcp-config',
        '{"mcpServers":{}}',
      ]
}
