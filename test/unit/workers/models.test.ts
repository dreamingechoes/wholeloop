// Tier-to-model mappings stay explicit, render per client and reach the cost preview honestly.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parse as toml } from 'smol-toml'
import { describe, expect, it } from 'vitest'
import { bundledCanonical } from '../../../src/adapters/canonical.js'
import { ADAPTERS, adapterFor, generateAdapter } from '../../../src/adapters/generate.js'
import { stepDisplay } from '../../../src/display/step.js'
import { frontmatter } from '../../../src/harness/frontmatter.js'
import { inspectInstallation } from '../../../src/installation/inspect.js'
import { manageInstallation } from '../../../src/installation/manage.js'
import { scopeModels } from '../../../src/installation/models.js'
import { setup } from '../../../src/utilities/setup.js'
import { costText, workerCost } from '../../../src/workers/cost.js'
import {
  checkModel,
  clientModels,
  configuredModels,
  type ModelMap,
  parseModelChoices,
} from '../../../src/workers/models.js'

const core = '#!/usr/bin/env node\n'
const canonical = bundledCanonical()
const mapping: ModelMap = { fast: 'fixture-fast', standard: 'fixture/standard-1', deep: 'deep@2' }
const roles = [...canonical].flatMap(([path, content]) => {
  const name = /^harness\/agents\/([a-z-]+)\.md$/.exec(path)?.[1]
  const tier = (frontmatter(content)?.metadata as Record<string, string> | undefined)?.[
    'wholeloop.tier'
  ]
  return name ? [{ name, tier: (tier ?? 'standard') as keyof ModelMap }] : []
})
function agentModel(path: string, content: string): unknown {
  if (path.endsWith('.toml'))
    return (toml(content.replace(/^#.*\n/gm, '')) as { model?: unknown }).model
  return frontmatter(content)?.model
}
function temporary(run: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-models-'))
  try {
    run(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('model choices', () => {
  it('accepts client model identifiers and refuses text that is not one', () => {
    expect(parseModelChoices('claude:fast=haiku, codex:deep=gpt-6.1-sol')).toEqual({
      'model:claude:fast': 'haiku',
      'model:codex:deep': 'gpt-6.1-sol',
    })
    expect(checkModel('anthropic/claude-sonnet-4-5@20250929')).toBe(
      'anthropic/claude-sonnet-4-5@20250929',
    )
    for (const bad of ['two words', 'quote"d', 'new\nline', '-flag', '', 'x'.repeat(129)])
      expect(() => checkModel(bad)).toThrow('not a client model identifier')
    expect(() => parseModelChoices('emacs:fast=x')).toThrow('with a client among')
    expect(() => parseModelChoices('claude:huge=x')).toThrow("Unknown model tier 'huge'")
    expect(() => parseModelChoices('claude:fast=a,claude:fast=b')).toThrow('Duplicate')
    expect(() => parseModelChoices('claude:fast=a b')).toThrow('not a client model identifier')
  })

  it('reads only the executing client and refuses a malformed remembered value', () => {
    const answers = { 'model:claude:fast': 'haiku', 'model:codex:fast': 'other', unrelated: 'x' }
    expect(configuredModels(answers, 'claude')).toEqual({ fast: 'haiku' })
    expect(configuredModels(answers, undefined)).toEqual({})
    expect(() => configuredModels({ 'model:claude:deep': 'two words' }, 'claude')).toThrow(
      'not a client model identifier',
    )
    let reads = 0
    const read = () => {
      reads++
      return answers
    }
    expect(clientModels(read, undefined)).toBeUndefined()
    expect(reads).toBe(0)
    expect(clientModels(read, 'gemini')).toBeUndefined()
    expect(clientModels(read, 'claude')).toEqual({ client: 'claude', tiers: { fast: 'haiku' } })
    expect(reads).toBe(2)
  })
})

describe('rendered agents', () => {
  it.each(ADAPTERS.map((adapter) => adapter.id))(
    'carries the mapped model in the native %s field and says it was configured',
    (id) => {
      const adapter = adapterFor(id)
      const mapped = generateAdapter(id, canonical, core, '1.0.0', undefined, mapping)
      const rendered = roles.filter(({ name }) => !adapter.omitAgents?.includes(name))
      expect(rendered.length).toBeGreaterThan(0)
      for (const { name, tier } of rendered) {
        const path = adapter.paths('agent', name)
        const content = mapped.files.get(path)?.content ?? ''
        expect(agentModel(path, content), `${id}/${name}`).toBe(mapping[tier])
        if (id !== 'claude')
          expect(content).toContain(`configured for this client as model ${mapping[tier]}`)
      }
    },
  )

  it.each(ADAPTERS.map((adapter) => adapter.id))(
    'keeps the unmapped %s render byte-identical, and inherit explicit only where it differs',
    (id) => {
      const plain = generateAdapter(id, canonical, core, '1.0.0')
      expect(generateAdapter(id, canonical, core, '1.0.0', undefined, {}).files).toEqual(
        plain.files,
      )
      const inherit = generateAdapter(id, canonical, core, '1.0.0', undefined, {
        fast: 'inherit',
        standard: 'inherit',
        deep: 'inherit',
      })
      if (id !== 'claude') expect(inherit.files).toEqual(plain.files)
      else
        for (const { name } of roles) {
          const path = adapterFor(id).paths('agent', name)
          expect(agentModel(path, plain.files.get(path)?.content ?? '')).toMatch(
            /^(haiku|sonnet|opus)$/,
          )
          expect(agentModel(path, inherit.files.get(path)?.content ?? '')).toBe('inherit')
        }
    },
  )
})

describe('cost preview', () => {
  it('names configured models per tier without claiming the client observed them', () => {
    const models = { client: 'codex', tiers: { standard: 'fixture-standard', deep: 'inherit' } }
    const cost = workerCost(['verifier', 'verifier', 'researcher', 'custom'], undefined, models)
    expect(cost.modelTiers).toEqual([
      { tier: 'deep', workers: 1, model: 'inherit' },
      { tier: 'standard', workers: 2, model: 'fixture-standard' },
      { tier: 'unknown', workers: 1 },
    ])
    expect(cost.modelClient).toBe('codex')
    expect(cost.basis).toContain('models configured for codex')
    expect(cost.basis).toContain('not observed client models')
    expect(costText(cost)).toContain('deep × 1 (session model) · standard × 2 (fixture-standard)')
    const display = stepDisplay('research plan', { question: 'Fixture?', cost })
    expect(display.rows).toContainEqual({ label: 'Models', value: 'configured for codex' })
    expect(display.text).toContain('standard × 2 (fixture-standard)')
    expect(display.open.join(' ')).toContain('Requested tiers do not prove the client model.')
    const unmapped = workerCost(['verifier'], undefined, { client: 'codex', tiers: { fast: 'x' } })
    expect(unmapped).not.toHaveProperty('modelClient')
    expect(unmapped.modelTiers).toEqual([{ tier: 'standard', workers: 1 }])
    expect(workerCost(['verifier'])).toEqual(workerCost(['verifier'], undefined, undefined))
  })
})

describe('setup and installation', () => {
  it('asks the executing client once per tier and remembers only explicit valid choices', () =>
    temporary((dir) => {
      const userFile = join(dir, 'user/config.yml')
      const asked = setup(dir, { client: 'claude' }, userFile)
      const questions = (asked.payload as { questions: { id: string; freeText?: boolean }[] })
        .questions
      expect(questions.filter(({ id }) => id.startsWith('model:'))).toEqual([
        expect.objectContaining({ id: 'model:claude:fast', freeText: true }),
        expect.objectContaining({ id: 'model:claude:standard', freeText: true }),
        expect.objectContaining({ id: 'model:claude:deep', freeText: true }),
      ])
      expect(JSON.stringify(questions)).toContain('Skip to keep haiku')
      const terminal = setup(dir, {}, userFile).payload as { questions: { id: string }[] }
      expect(terminal.questions.some(({ id }) => id.startsWith('model:'))).toBe(false)
      expect(() =>
        setup(dir, { scope: 'user', models: 'claude:fast=two words' }, userFile),
      ).toThrow('not a client model identifier')
      expect(existsSync(userFile)).toBe(false)
      const run = setup(dir, { scope: 'run', models: 'claude:fast=haiku' }, userFile)
      expect(run.payload).toMatchObject({ applied: false, file: null })
      expect(existsSync(userFile)).toBe(false)
      setup(dir, { scope: 'user', models: 'claude:deep=fixture-deep' }, userFile)
      expect(readFileSync(userFile, 'utf8')).toContain('model:claude:deep: fixture-deep')
      const again = setup(dir, { client: 'claude' }, userFile).payload
      expect(JSON.stringify(again)).toContain('Skip to keep fixture-deep')
    }))

  it('installs each scope with its own file and lets doctor see a mapped install as current', () =>
    temporary((dir) => {
      const root = join(dir, 'project'),
        home = join(dir, 'home'),
        userFile = join(home, '.config/wholeloop/config.yml')
      mkdirSync(join(root, '.wholeloop'), { recursive: true })
      mkdirSync(join(home, '.config/wholeloop'), { recursive: true })
      if (spawnSync('git', ['init', '-q', root]).status !== 0) throw new Error('git init failed')
      writeFileSync(userFile, "version: 1\nanswers:\n  'model:claude:standard': fixture-user\n")
      writeFileSync(
        join(root, '.wholeloop/config.yml'),
        "version: 1\nanswers:\n  'model:claude:standard': fixture-team\n",
      )
      const env = {
        XDG_CONFIG_HOME: join(home, '.config'),
        CLAUDE_CONFIG_DIR: join(home, '.claude'),
      }
      expect(scopeModels('user', root, home, env)).toEqual({ claude: { standard: 'fixture-user' } })
      expect(scopeModels('project', root, home, env)).toEqual({
        claude: { standard: 'fixture-team' },
      })
      const context = {
        root,
        home,
        store: join(dir, 'state/wholeloop'),
        scope: 'user' as const,
        env,
        models: scopeModels('user', root, home, env),
      }
      const input = {
        context,
        targets: ['claude'],
        canonical: new Map(
          [...canonical].filter(([path]) =>
            ['harness/agents/verifier.md', 'harness/skills/next/SKILL.md'].includes(path),
          ),
        ),
        core,
        version: '1.0.0',
      }
      manageInstallation('install', input)
      const agent = readFileSync(join(home, '.claude/agents/wl-verifier.md'), 'utf8')
      expect(frontmatter(agent)?.model).toBe('fixture-user')
      expect(inspectInstallation(input).status).toBe('current')
      const { models: _models, ...unmapped } = context
      expect(inspectInstallation({ ...input, context: unmapped }).status).toBe('stale')
      writeFileSync(userFile, "version: 1\nanswers:\n  'model:claude:standard': 'two words'\n")
      expect(() => scopeModels('user', root, home, env)).toThrow('not a client model identifier')
    }))
})

it('remembers a model choice through the compiled setup command', () =>
  temporary((dir) => {
    const env = { ...process.env, XDG_CONFIG_HOME: join(dir, 'config'), XDG_STATE_HOME: dir }
    const run = (...args: string[]) =>
      spawnSync(process.execPath, [resolve('dist/wl.mjs'), 'setup', ...args], {
        cwd: dir,
        env,
        encoding: 'utf8',
      })
    const saved = run('--models', 'codex:standard=fixture-model', '--scope', 'user', '--json')
    expect(saved.status).toBe(0)
    expect(JSON.parse(saved.stdout)).toMatchObject({
      applied: true,
      values: { answers: { 'model:codex:standard': 'fixture-model' } },
    })
    const refused = run('--models', 'codex:standard', '--scope', 'user')
    // Same exit as every other invalid setup value, such as an unknown profile.
    expect(refused.status).toBe(4)
    expect(refused.stderr).toContain('--models <client>:<tier>=<model>')
  }))
