// Synthetic command observations keep human output coverage independent of native accounts.
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { emitCommand } from '../../../src/cli/presentation.js'
import { commandText, openText } from '../../../src/display/commands.js'
import { humanLines } from '../../../src/display/render.js'
import { StateStore } from '../../../src/state/store.js'

const examples: [string, unknown][] = [
  [
    'next',
    {
      questions: [
        {
          prompt: 'Which item should continue?',
          options: [
            { label: 'Search', value: 'init-01234567' },
            { label: 'Browse', value: 'init-89abcdef' },
          ],
        },
      ],
      action: null,
    },
  ],
  [
    'next',
    {
      subject: 'slice-01234567',
      stop: 'Complete the recorded dependencies before continuing this work.',
      blockedBy: ['slice-89abcdef'],
    },
  ],
  [
    'setup',
    {
      questions: [
        {
          prompt: 'Where should these choices be remembered?',
          options: [
            { value: 'run', label: 'This run' },
            { value: 'project', label: 'This project' },
          ],
        },
      ],
    },
  ],
  [
    'setup',
    {
      scope: 'run',
      applied: false,
      file: null,
      override: { profile: { preset: 'pair' }, providers: { docs: 'local-docs' } },
    },
  ],
  [
    'resume',
    {
      subject: { id: 'init-01234567', title: 'Search records', owner: 'Owner', status: 'open' },
      totalItems: 3,
      unreadCount: 2,
      items: [{ title: 'Browse', status: 'open' }],
      notes: ['Use the saved criteria.'],
      artifacts: [{ path: 'items/init-01234567/spec.md' }],
      flow: { pending: [] },
      next: 'wl open init-01234567',
      truncated: true,
    },
  ],
  [
    'config show',
    {
      values: { profile: { preset: 'pair', pace: 'guided' }, providers: { sources: [] } },
      sources: { 'profile.pace': 'project' },
    },
  ],
  [
    'profile show',
    {
      profile: { preset: 'pair', pace: 'guided', verbosity: 'balanced' },
      style: 'PRIVATE_STYLE_BLOCK',
    },
  ],
  [
    'overview',
    {
      health: { status: 'healthy', problems: [] },
      headline: 'waiting-input',
      unreadCount: 0,
      items: [
        {
          id: 'init-01234567',
          kind: 'initiative',
          parent: null,
          status: 'open',
          flow: { next: 'write-spec', available: true, completed: [], pending: [] },
        },
      ],
      attention: [
        {
          target: { kind: 'item', id: 'init-01234567' },
          reason: 'item-decision',
          next: [{ argv: ['wl', 'step', 'plan', '--for', 'init-01234567'] }],
        },
      ],
      counts: { items: 1 },
      omitted: { items: 0 },
    },
  ],
  [
    'overview',
    {
      health: { status: 'unavailable', problems: ['store-unreadable'] },
      headline: 'unavailable',
      counts: null,
      unreadCount: null,
    },
  ],
  [
    'worktree open',
    {
      record: { path: '/tmp/workspace', branch: 'feat/search', status: 'active' },
      tested: false,
      environment: { PORT: '4300' },
      commands: [],
      stop: 'Opening does not record human testing.',
    },
  ],
  [
    'provider list',
    {
      providers: [
        {
          manifest: {
            id: 'code',
            name: 'Code',
            description: 'Read the selected repository.',
            capabilities: ['source.code'],
          },
        },
      ],
      probe: 'Not performed; verify availability and authentication in the client.',
      problems: [],
    },
  ],
  [
    'delivery worker-schema',
    { schema: 'wholeloop/delivery-worker-schema@1', workerSchema: { $id: 'PRIVATE_SCHEMA_BODY' } },
  ],
  [
    'delivery runner-status',
    {
      status: 'blocked',
      unknowns: ['Provider read unavailable.'],
      effects: { applied: false },
      budget: { remaining: 0 },
    },
  ],
]

it.each(examples)('%s has a bounded human view', (command, payload) => {
  const output = commandText(command, payload)
  expect(output).toMatchSnapshot()
  expect(output).not.toContain('PRIVATE_')
  expect(output).not.toMatch(/^\s*[{[]/)
  expect(output).not.toContain('\u001b')
  for (const line of output.split('\n')) expect(line.length).toBeLessThanOrEqual(80)
})

it('serializes machine results once and never invokes their JSON conversion for human output', () => {
  let conversions = 0
  const value = {
    schema: 'wholeloop/config-show@1',
    values: { depth: 'technical' },
    toJSON() {
      conversions++
      return { schema: this.schema, values: this.values }
    },
  }
  const output: string[] = []
  const io = { out: (value: string) => output.push(value), err: () => {} }
  emitCommand('config show', value, io, false)
  expect(conversions).toBe(0)
  expect(output[0]).toContain('technical')
  emitCommand('config show', value, io, true)
  expect(conversions).toBe(1)
  expect(JSON.parse(output[1] ?? '')).toEqual({ schema: value.schema, values: value.values })
})

it('keeps ordinary prose between horizontal rules and removes actual metadata only', () => {
  const item = {
    id: 'init-01234567',
    title: 'Search records',
    owner: 'Owner',
    status: 'open',
    body: '---\nOrdinary prose\n---\nBody',
    notes: [{ text: 'Use the saved criteria.' }],
    links: ['https://example.invalid/source'],
  }
  expect(openText(item)).toContain('Ordinary prose')
  const result = openText({
    ...item,
    body: '---\nschema: wholeloop/spec@1\nprivate: hidden\n---\n# Search records\n\nReadable document.',
  })
  expect(result).toMatchSnapshot()
  expect(result).not.toContain('private: hidden')
  expect(result).toContain('Use the saved criteria.')
  expect(result).toContain('https://example.invalid/source')
})

it('bounds authored indentation, strips controls and wraps wide text at terminal cells', () => {
  const result = humanLines(' '.repeat(100) + '界'.repeat(70) + '\u001b[31m')
  expect(result).not.toContain('\u001b')
  for (const line of result.split('\n'))
    expect([...line].reduce((n, c) => n + (c === '界' ? 2 : 1), 0)).toBeLessThanOrEqual(80)
})

it('preserves unresolved action arguments as explicit templates rather than dropping them', () => {
  const output = commandText('overview', {
    health: { status: 'healthy' },
    attention: [
      {
        target: { id: 'init-01234567' },
        reason: 'item-decision',
        next: [
          {
            argv: [
              'wl',
              'answer',
              { input: 'outcome', prefix: 'decision.approve-spec=' },
              '--by',
              { input: 'operator' },
            ],
            inputs: [
              { name: 'outcome', kind: 'choice', values: ['approved', 'rejected'] },
              { name: 'operator', kind: 'person' },
            ],
          },
        ],
      },
    ],
  })
  expect(output).toContain('decision.approve-spec=<outcome> --by <operator>')
})

it('ordinary handlers cannot reintroduce implicit JSON serialization', () => {
  const raw = /io\.out\(\s*JSON\.stringify\([\s\S]{0,1000}?\bjson\s*\?\s*undefined\s*:\s*2/
  expect(raw.test('io.out(JSON.stringify(payload, null, json ? undefined : 2))')).toBe(true)
  for (const file of readdirSync(resolve('src/cli')).filter(
    (file) => file.endsWith('.ts') && file !== 'guard.ts',
  ))
    expect(raw.test(readFileSync(resolve('src/cli', file), 'utf8')), file).toBe(false)
})

describe('compiled human command routes', () => {
  it('keeps machine contracts and read-only views separate, with raw metadata opt-in', () => {
    const root = mkdtempSync(join(tmpdir(), 'wholeloop-human-'))
    const env = {
      ...process.env,
      HOME: root,
      XDG_CONFIG_HOME: join(root, 'config'),
      XDG_STATE_HOME: join(root, 'state'),
      WL_WORKSPACE: '',
      NO_COLOR: '1',
      FORCE_COLOR: undefined,
    }
    const invoke = (args: string[]) =>
      spawnSync(process.execPath, [resolve('dist/wl.mjs'), ...args], {
        cwd: root,
        env,
        encoding: 'utf8',
      })
    try {
      for (const args of [
        ['next'],
        ['setup'],
        ['overview'],
        ['config', 'show'],
        ['profile', 'show'],
        ['provider', 'list'],
        ['template', 'list'],
      ]) {
        const human = invoke(args),
          machine = invoke([...args, '--json'])
        expect(human.status, args.join(' ')).toBe(machine.status)
        expect(human.stderr).toBe('')
        expect(human.stdout, args.join(' ')).not.toMatch(/^\s*[{[]/)
        const payload = JSON.parse(machine.stdout)
        expect(payload.schema).toMatch(/^wholeloop\/.+@\d+$/)
        if (args[0] === 'next' && payload.contract)
          expect(payload.contract.display.text).toBe(human.stdout.trimEnd())
        expect(human.stdout).not.toContain('"schema":')
        for (const line of human.stdout.split('\n')) expect(line.length).toBeLessThanOrEqual(80)
      }
      const store = new StateStore(join(root, 'state/wholeloop'))
      const item = store.create({
        kind: 'initiative',
        title: 'Search records',
        owner: 'Owner',
        body: '---\nschema: wholeloop/spec@1\nprivate: hidden\n---\n# Readable document\n\nEvidence stays visible.',
      })
      store.note(item.id, 'Retain the source.')
      store.link(item.id, 'https://example.invalid/source')
      const before = store.events()
      const opened = invoke(['open', item.id]),
        raw = invoke(['open', item.id, '--raw']),
        machine = invoke(['open', item.id, '--json']),
        resumed = invoke(['resume', item.id])
      expect(opened.status).toBe(0)
      expect(opened.stdout).toContain('Open · Search records')
      expect(opened.stdout).toContain('Evidence stays visible.')
      expect(opened.stdout).not.toContain('private: hidden')
      expect(raw.stdout.trimEnd()).toBe(JSON.parse(machine.stdout).content.trimEnd())
      expect(raw.stdout).toContain('private: hidden')
      expect(resumed.status).toBe(0)
      expect(resumed.stdout).toContain('Resume · Search records')
      const overview = invoke(['overview'])
      expect(overview.status).toBe(0)
      expect(overview.stdout).toContain(item.id)
      expect(overview.stdout).not.toContain('Search records')
      expect(invoke(['open', item.id, '--raw', '--json']).status).toBe(4)
      expect(store.events()).toEqual(before)
      const file = join(root, 'incomplete.md')
      writeFileSync(file, '# Incomplete\n')
      const checked = invoke(['spec', 'check', 'incomplete.md']),
        json = JSON.parse(invoke(['spec', 'check', 'incomplete.md', '--json']).stdout)
      expect(checked.status).toBe(4)
      for (const problem of json.problems)
        expect(checked.stdout.replace(/\s+/g, ' ')).toContain(`incomplete.md: ${problem}`)
      expect(checked.stdout.trimEnd()).toBe(json.display.text)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('opens a real local fixture worktree without claiming human testing', () => {
    const root = mkdtempSync(join(tmpdir(), 'wholeloop-human-worktree-')),
      repo = join(root, 'repo')
    mkdirSync(repo)
    const env = {
      ...process.env,
      HOME: root,
      XDG_CONFIG_HOME: join(root, 'config'),
      XDG_STATE_HOME: join(root, 'state'),
      WL_WORKSPACE: '',
      NO_COLOR: '1',
      FORCE_COLOR: undefined,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_TERMINAL_PROMPT: '0',
    }
    const git = (args: string[]) => {
      const result = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
        cwd: repo,
        env,
        encoding: 'utf8',
      })
      expect(result.status, result.stderr).toBe(0)
    }
    const invoke = (args: string[]) =>
      spawnSync(process.execPath, [resolve('dist/wl.mjs'), ...args], {
        cwd: root,
        env,
        encoding: 'utf8',
      })
    try {
      git(['init', '-b', 'main'])
      writeFileSync(join(repo, 'README.md'), '# Fixture\n')
      git(['add', '.'])
      git([
        '-c',
        'user.name=Fixture Owner',
        '-c',
        'user.email=fixture@example.invalid',
        'commit',
        '-m',
        'chore: seed fixture repository',
        '-m',
        'Keep local presentation evidence independent of personal history.',
      ])
      const store = new StateStore(join(root, 'state/wholeloop'))
      const item = store.create({
        kind: 'slice',
        title: 'Read an owned record',
        owner: 'Owner',
        body: 'Return the selected record.',
        repository: repo,
      })
      const created = invoke([
        'worktree',
        'create',
        item.id,
        '--repo',
        repo,
        '--base',
        'main',
        '--json',
      ])
      expect(created.status, created.stdout + created.stderr).toBe(0)
      const human = invoke(['worktree', 'open', item.id]),
        machine = invoke(['worktree', 'open', item.id, '--json'])
      expect(human.status, human.stderr).toBe(0)
      const payload = JSON.parse(machine.stdout)
      expect(payload.tested).toBe(false)
      expect(human.stdout).toContain('Not recorded by opening the workspace')
      expect(human.stdout.replace(/\s/g, '')).toContain(payload.record.path.replace(/\s/g, ''))
      expect(human.stdout).toContain(payload.record.branch)
      for (const line of human.stdout.split('\n')) expect(line.length).toBeLessThanOrEqual(80)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
