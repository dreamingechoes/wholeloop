// Source choices must precede workers, stay client-scoped and survive through explicit preferences.

import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { bundledCanonical } from '../../../src/adapters/canonical.js'
import { ADAPTERS, generateAdapter } from '../../../src/adapters/generate.js'
import { EXIT } from '../../../src/cli/io.js'
import { validate } from '../../../src/config/schema.js'
import { writeSetting } from '../../../src/config/write.js'
import { FlowEngine } from '../../../src/flow/engine.js'
import choiceSchema from '../../../src/research/schemas/sources-v1.json' with { type: 'json' }
import { ResearchWorkflow } from '../../../src/research/workflow.js'
import { withClientAttribution } from '../../../src/state/attribution-context.js'
import { StateStore } from '../../../src/state/store.js'
import { completeResearch } from '../../support/research.js'

function fixture(action: (value: ReturnType<typeof context>) => void) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-source-choice-')))
  try {
    action(context(directory))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}
function context(directory: string) {
  const root = join(directory, 'repo'),
    home = join(directory, 'home'),
    bin = join(directory, 'bin')
  for (const path of [root, home, bin]) mkdirSync(path, { recursive: true })
  const userFile = join(home, 'wholeloop/config.yml')
  const engine = new FlowEngine(new StateStore(join(directory, 'store')), root, userFile, home)
  const workflow = new ResearchWorkflow(engine)
  const started = engine.begin('research', {
    input: 'How does this repository handle empty input?',
    owner: 'Fixture owner',
  })
  const subject = started.payload.subject?.id ?? ''
  const options = { client: 'codex', env: {}, path: bin }
  const write = (path: string, body: string) => {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, body)
  }
  const choose = (sources: string[], remember?: string) => {
    const plan = workflow.plan(subject, { ...options, sources, ...(remember ? { remember } : {}) })
    if (plan.status !== 'planned') throw new Error('Expected selected plan')
    return plan
  }
  const finish = () => {
    const plan = workflow.plan(subject, options)
    if (plan.status !== 'planned') throw new Error('Expected selected plan')
    for (const job of plan.jobs)
      workflow.submit(subject, {
        angle: job.angle.id,
        status: 'unavailable',
        claims: [],
        openQuestions: [],
        reason: 'Synthetic host has no evidence',
      })
    completeResearch(workflow, subject)
    engine.begin('research', { subject, input: 'A second question about this repository' })
  }
  return {
    directory,
    root,
    home,
    bin,
    userFile,
    engine,
    workflow,
    subject,
    options,
    write,
    choose,
    finish,
  }
}

it('offers native defaults without pinning any source or dispatching a worker', () =>
  fixture(({ engine, workflow, subject, options }) => {
    const before = engine.store.events()
    const preview = workflow.plan(subject, options)
    expect(preview.status).toBe('needs-sources')
    expect(preview.schema).toBe('wholeloop/research-sources@1')
    expect(validate(preview, choiceSchema)).toEqual([])
    expect(preview.angles).toEqual([])
    expect(preview.jobs).toEqual([])
    expect(preview.examinations).toEqual([])
    if (preview.status !== 'needs-sources') throw new Error('Expected source question')
    expect(preview.suggested).toEqual(['native-code', 'native-web'])
    expect(preview.candidates.slice(0, 2).map(({ id, access }) => ({ id, access }))).toEqual([
      { id: 'native-code', access: 'native' },
      { id: 'native-web', access: 'native' },
    ])
    expect(engine.store.events()).toEqual(before)
    expect(() => workflow.submit(subject, {})).toThrow()
    expect(() => workflow.complete(subject)).toThrow('Plan research')
  }))

it('keeps a foreign Notion MCP and a PATH-only psql out of the suggested sources', () =>
  fixture(({ workflow, subject, options, home, bin, write, choose }) => {
    write(
      join(home, '.claude.json'),
      JSON.stringify({
        mcpServers: { notion: { command: 'fixture-not-run', sentinel: 'private-value' } },
      }),
    )
    write(join(bin, 'psql'), 'This fixture must never be executed.\n')
    chmodSync(join(bin, 'psql'), 0o755)
    const preview = workflow.plan(subject, options)
    if (preview.status !== 'needs-sources') throw new Error('Expected choices')
    expect(preview.candidates.find(({ id }) => id === 'notion')).toMatchObject({
      access: 'configured in another client',
      available: false,
      configuredClients: ['claude'],
    })
    expect(preview.candidates.find(({ id }) => id === 'postgresql')).toMatchObject({
      access: 'executable only',
      available: false,
    })
    expect(preview.suggested).toEqual(['native-code', 'native-web'])
    expect(JSON.stringify(preview)).not.toContain('private-value')
    const plan = choose(['postgresql', 'notion'])
    expect(plan.angles.every((angle) => !angle.available)).toBe(true)
    expect(plan.angles.find((angle) => angle.provider === 'postgresql')?.evidence).toContain(
      'connection',
    )
  }))

const mcpPaths = {
  claude: ['.claude.json', 'mcpServers'],
  codex: ['.codex/config.toml', 'mcp_servers'],
  opencode: ['.config/opencode/opencode.json', 'mcp'],
  copilot: ['.copilot/mcp-config.json', 'mcpServers'],
  gemini: ['.gemini/settings.json', 'mcpServers'],
  cursor: ['.cursor/mcp.json', 'mcpServers'],
  antigravity: ['.gemini/config/mcp_config.json', 'mcpServers'],
} as const
it.each(Object.entries(mcpPaths))(
  'counts MCP declarations only for the current %s client',
  (client, [file, field]) =>
    fixture(({ workflow, subject, options, home, write }) => {
      write(
        join(home, file),
        field === 'mcp_servers'
          ? '[mcp_servers.notion]\ncommand = "fixture-not-run"\n'
          : JSON.stringify({ [field]: { notion: { command: 'fixture-not-run' } } }),
      )
      const view = workflow.plan(subject, { ...options, client })
      if (view.status !== 'needs-sources') throw new Error('Expected choices')
      expect(view.candidates.find(({ id }) => id === 'notion')).toMatchObject({
        access: 'available in this client',
        available: true,
      })
      expect(view.suggested).not.toContain('notion')
      const other = workflow.plan(subject, {
        ...options,
        client: client === 'codex' ? 'cursor' : 'codex',
      })
      if (other.status !== 'needs-sources') throw new Error('Expected choices')
      expect(other.candidates.find(({ id }) => id === 'notion')?.access).toBe(
        'configured in another client',
      )
    }),
)

it('lists an unmapped MCP once with its clients and provider guide', () =>
  fixture(({ workflow, subject, options, home, root, write }) => {
    const body = JSON.stringify({
      mcpServers: { 'fixture-unmapped': { command: 'fixture-not-run', sentinel: 'private-value' } },
    })
    write(join(home, '.cursor/mcp.json'), body)
    write(join(root, '.cursor/mcp.json'), body)
    write(join(home, '.claude.json'), body)
    const view = workflow.plan(subject, options)
    if (view.status !== 'needs-sources') throw new Error('Expected choices')
    expect(view.unusable).toEqual([
      {
        server: 'fixture-unmapped',
        label: 'not usable yet',
        reason: 'No validated source query provider',
        clients: ['claude', 'cursor'],
        guide: 'docs/extending/providers.md',
      },
    ])
    expect(JSON.stringify(view)).not.toContain('private-value')
  }))

it('pins only chosen sources and keeps a run choice immutable without reusable settings', () =>
  fixture(({ choose, workflow, subject, options, engine, root, userFile, finish }) => {
    const plan = choose(['native-code'])
    expect(plan.angles.map((angle) => angle.provider)).toEqual(['native-code'])
    expect(plan.jobs).toHaveLength(1)
    expect(workflow.plan(subject, options)).toEqual(plan)
    expect(() => choose(['native-web'])).toThrow('already pinned')
    expect(engine.store.events().filter((event) => event.type === 'research.planned')).toHaveLength(
      1,
    )
    expect(existsSync(join(root, '.wholeloop/config.yml'))).toBe(false)
    expect(existsSync(userFile)).toBe(false)
    engine.store.rebuild()
    expect(workflow.plan(subject, options)).toEqual(plan)
    finish()
    expect(workflow.plan(subject, options).status).toBe('needs-sources')
  }))

it.each(['project', 'repository', 'user'])(
  'remembers an explicit %s choice and replaces detection on the next run',
  (scope) =>
    fixture(({ choose, root, userFile, finish, workflow, subject, options, home, write }) => {
      write(join(home, '.codex/config.toml'), '[mcp_servers.notion]\ncommand="fixture-not-run"\n')
      const plan = choose(['native-code'], scope)
      const file = scope === 'user' ? userFile : join(root, '.wholeloop/config.yml')
      expect(plan.remembered).toEqual({ scope: scope === 'repository' ? 'project' : scope, file })
      expect(readFileSync(file, 'utf8')).toContain('native-code')
      finish()
      const next = workflow.plan(subject, options)
      expect(next.status).toBe('planned')
      expect(next.angles.map((angle) => angle.provider)).toEqual(['native-code'])
    }),
)

it('treats an explicitly configured empty list as an empty selection, not a detection fallback', () =>
  fixture(({ root, workflow, subject, options }) => {
    writeSetting(join(root, '.wholeloop/config.yml'), ['providers', 'sources'], [])
    const plan = workflow.plan(subject, options)
    expect(plan.status).toBe('planned')
    expect(plan.angles).toEqual([])
    expect(plan.jobs).toEqual([])
  }))

it('validates offered IDs and scopes before writing any preference or plan', () =>
  fixture(({ choose, engine, root, userFile }) => {
    const before = engine.store.events()
    for (const sources of [['missing'], ['native-code', 'native-code'], ['local-docs']])
      expect(() => choose(sources, 'project')).toThrow('Select unique source IDs')
    expect(() => choose(['native-code'], 'initiative')).toThrow('Remember sources')
    expect(engine.store.events()).toEqual(before)
    expect(existsSync(join(root, '.wholeloop/config.yml'))).toBe(false)
    expect(existsSync(userFile)).toBe(false)
  }))

it('does not let an adapter claim another client through an override', () =>
  fixture(({ workflow, subject, options }) => {
    expect(() =>
      withClientAttribution({ client: 'codex', source: 'declared' }, () =>
        workflow.plan(subject, { ...options, client: 'claude' }),
      ),
    ).toThrow('must match')
  }))

it('ignores broken other-client declarations but refuses broken current-client configuration', () =>
  fixture(({ home, write, workflow, subject, options }) => {
    write(join(home, '.cursor/mcp.json'), '{broken')
    expect(workflow.plan(subject, options).status).toBe('needs-sources')
    write(join(home, '.codex/config.toml'), 'broken = [')
    expect(() => workflow.plan(subject, options)).toThrow('current client')
  }))

it.each(ADAPTERS)(
  '$id asks once before workers and keeps the source choice explicit',
  (adapter) => {
    const generated = generateAdapter(
      adapter.id,
      bundledCanonical(),
      '#!/usr/bin/env node\n',
      '0.0.0',
    )
    const text = generated.files.get(adapter.paths('skill', 'research'))?.content ?? ''
    expect(text).toContain('needs-sources')
    expect(text).toContain('preselected')
    expect(text).toContain('--sources')
    expect(text).toContain('--remember')
    expect(text.indexOf('needs-sources')).toBeLessThan(text.indexOf('one `'))
  },
)

it('keeps repeated preference writes idempotent', () =>
  fixture(({ choose, root }) => {
    choose(['native-web', 'native-code'], 'project')
    const file = join(root, '.wholeloop/config.yml')
    const before = statSync(file)
    choose(['native-code', 'native-web'], 'project')
    const after = statSync(file)
    expect(after.ino).toBe(before.ino)
    expect(after.mtimeMs).toBe(before.mtimeMs)
  }))

it('applies a user choice to a different repository', () =>
  fixture(({ choose, directory, engine, home, userFile, options }) => {
    choose(['native-web'], 'user')
    const root = join(directory, 'another-repo')
    mkdirSync(root)
    const nextEngine = new FlowEngine(engine.store, root, userFile, home)
    const start = nextEngine.begin('research', {
      input: 'A question for another repository',
      owner: 'Fixture owner',
    })
    const view = new ResearchWorkflow(nextEngine).plan(start.payload.subject?.id ?? '', options)
    expect(view.status).toBe('planned')
    expect(view.angles.map((angle) => angle.provider)).toEqual(['native-web'])
  }))

it('names the real external journal file for an explicit run choice', () =>
  fixture(({ choose, root, userFile }) => {
    const plan = choose(['native-code'], 'run')
    expect(plan.remembered?.scope).toBe('run')
    expect(plan.remembered?.file).toBe(plan.selection.file)
    expect(existsSync(plan.selection.file)).toBe(true)
    expect(existsSync(join(root, '.wholeloop/config.yml'))).toBe(false)
    expect(existsSync(userFile)).toBe(false)
  }))

it('accepts JSON source arrays through the CLI and validates IDs before remembering them', () =>
  fixture(({ root, home, directory, bin }) => {
    const env = {
      ...process.env,
      HOME: home,
      XDG_STATE_HOME: join(directory, 'cli-state'),
      XDG_CONFIG_HOME: join(home, '.config'),
      CODEX_HOME: join(home, '.codex'),
      COPILOT_HOME: join(home, '.copilot'),
      GEMINI_CLI_HOME: home,
      WL_WORKSPACE: '',
      PATH: bin,
    }
    const cli = (...args: string[]) =>
      spawnSync(process.execPath, [resolve('dist/wl.mjs'), ...args, '--json'], {
        cwd: root,
        env,
        encoding: 'utf8',
      })
    const start = cli(
      'step',
      'begin',
      'research',
      '--input',
      'A fixture CLI question',
      '--owner',
      'Fixture owner',
    )
    expect(start.status, start.stderr).toBe(0)
    const subject = JSON.parse(start.stdout).subject.id as string
    const preview = cli('research', 'plan', '--for', subject, '--client', 'codex')
    expect(preview.status, preview.stderr).toBe(0)
    expect(JSON.parse(preview.stdout).status).toBe('needs-sources')
    const invalid = cli(
      'research',
      'plan',
      '--for',
      subject,
      '--sources',
      '["missing"]',
      '--remember',
      'project',
    )
    expect(invalid.status).toBe(EXIT.shape)
    expect(JSON.parse(invalid.stdout)).toMatchObject({
      schema: 'wholeloop/error@1',
      code: EXIT.shape,
      message: 'Select unique source IDs offered by research plan',
    })
    expect(existsSync(join(root, '.wholeloop/config.yml'))).toBe(false)
    const selected = cli(
      'research',
      'plan',
      '--for',
      subject,
      '--sources',
      '[]',
      '--remember',
      'project',
    )
    expect(selected.status, selected.stderr).toBe(0)
    const plan = JSON.parse(selected.stdout)
    expect(plan.status).toBe('planned')
    expect(plan.angles).toEqual([])
    expect(plan.remembered.file).toBe(join(root, '.wholeloop/config.yml'))
  }))

it.each([
  { access: { cli: { binary: 'fixture-source' } }, capabilities: ['source.web'] },
  { access: { native: true }, capabilities: ['source.knowledge'] },
  { access: { native: true }, capabilities: ['source.web', 'source.support'] },
])(
  'does not preselect an overridden native-web name with different access or coverage: %j',
  ({ access, capabilities }) =>
    fixture(({ write, root, bin, workflow, subject, options }) => {
      write(join(bin, 'fixture-source'), 'This fixture must never execute.\n')
      chmodSync(join(bin, 'fixture-source'), 0o755)
      write(
        join(root, '.wholeloop/providers/native-web/provider.json'),
        JSON.stringify({
          schema: 1,
          id: 'native-web',
          name: 'Fixture replacement',
          description: 'A replacement source with explicitly different access or coverage.',
          access,
          capabilities,
          operations: Object.fromEntries(
            capabilities.map((capability) => [`${capability}.query`, { tool: 'fixture-read' }]),
          ),
          degrade: Object.fromEntries(
            capabilities.map((capability) => [`${capability}.query`, 'open-question']),
          ),
        }),
      )
      const view = workflow.plan(subject, options)
      if (view.status !== 'needs-sources') throw new Error('Expected choices')
      expect(view.suggested).toEqual(['native-code'])
      expect(view.candidates.some((candidate) => candidate.id === 'native-web')).toBe(true)
    }),
)

it('asks rigor with the sources and pins the chosen coverage for the run (ADR-0258)', () =>
  fixture(({ workflow, subject, options, engine }) => {
    const preview = workflow.plan(subject, options)
    if (preview.status !== 'needs-sources') throw new Error('Expected source question')
    expect(preview.openQuestions.at(-1)).toMatchObject({
      question: 'Which rigor should this research use?',
      missing: expect.stringContaining('Proposed: standard.'),
    })
    const quick = workflow.plan(subject, { ...options, sources: ['native-code'], rigor: 'quick' })
    if (quick.status !== 'planned') throw new Error('Expected a plan')
    expect(quick.rigor).toMatchObject({ rigor: 'quick', proposed: 'quick', source: 'person' })
    expect(quick.rigor.coverage).toBe('Quick: claims are not independently verified')
    expect(engine.store.events().filter((event) => event.type === 'research.rigor')).toHaveLength(1)
    expect(() => workflow.plan(subject, { ...options, rigor: 'deep' })).toThrow(
      'Rigor is fixed at quick for this research run',
    )
    const job = quick.jobs[0]
    if (!job) throw new Error('Expected one investigation')
    workflow.submit(subject, {
      angle: job.angle.id,
      status: 'ok',
      claims: [
        {
          id: 'empty',
          text: 'Empty input is rejected.',
          confidence: 'high',
          loadBearing: true,
          evidence: [{ ref: 'https://example.com/fixture', excerpt: 'Synthetic observation' }],
        },
      ],
      openQuestions: [],
    })
    const after = workflow.plan(subject, options)
    if (after.status !== 'planned') throw new Error('Expected a plan')
    expect(after.examinations).toEqual([])
    expect(after.cost.workers).toBe(0)
    expect(() =>
      workflow.examine(subject, {
        claim: `${job.angle.id}:empty`,
        verifier: 1,
        outcome: 'confirm',
        reason: 'Observed',
        evidence: [],
      }),
    ).toThrow('Quick rigor leaves claims unverified')
    const context = workflow.complete(subject)
    if (!('report' in context)) throw new Error('Expected conclusion context')
    expect(JSON.stringify(context.report.openQuestions)).toContain(
      'Not independently verified: quick rigor was chosen for this run',
    )
    expect(context.certainty?.confidence).toBe('low')
  }))

it('raises research verification to five independent verifiers under deep', () =>
  fixture(({ workflow, subject, options }) => {
    const deep = workflow.plan(subject, { ...options, sources: ['native-code'], rigor: 'deep' })
    if (deep.status !== 'planned') throw new Error('Expected a plan')
    expect(deep).toMatchObject({ verifiers: 5, refutations: 3 })
    expect(deep.rigor.coverage).toBe('Deep: 5 independent verifiers per load-bearing claim')
  }))
