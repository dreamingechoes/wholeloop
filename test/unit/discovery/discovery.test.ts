import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bundledCanonical } from '../../../src/adapters/canonical.js'
import { resolveSlot } from '../../../src/discovery/resolve.js'
import { scan } from '../../../src/discovery/scan.js'
import { discover, readInventory } from '../../../src/discovery/tree.js'
import { FlowEngine } from '../../../src/flow/engine.js'
import { isEntrypoint, markEntrypoint } from '../../../src/harness/entrypoints.js'
import { manageInstallation } from '../../../src/installation/manage.js'
import { installationPlan } from '../../../src/installation/plan.js'
import { canonicalPath } from '../../../src/state/paths.js'
import { StateStore } from '../../../src/state/store.js'
import fixtures from '../../fixtures/discovery/repos.json' with { type: 'json' }

describe('repository capability maps', () => {
  for (const [name, files] of Object.entries(fixtures))
    it(`scans ${name} deterministically`, () => {
      const map = scan(new Map(Object.entries(files)))
      expect(map.problems).toEqual([])
      expect(map).toMatchSnapshot()
      expect(scan(new Map(Object.entries(files).reverse()))).toEqual(map)
    })
  it('inherits the workspace package manager without executing scripts', () => {
    const map = scan(new Map(Object.entries(fixtures['js-monorepo'])))
    expect(
      map.commands.find((command) => command.ref === 'packages/web/package.json#test')?.argv,
    ).toEqual(['pnpm', 'run', 'test'])
    expect(resolveSlot('verify.suite', map).selected?.ref).toBe('package.json#check')
  })

  it('terminates package-manager lookup at an absolute filesystem root', () => {
    const map = scan(
      new Map([['/home/test/project/package.json', '{"scripts":{"test":"exit 99"}}']]),
    )
    expect(map.commands[0]?.argv).toEqual(['npm', 'run', 'test'])
  })
  it('does not mistake inherited object keys for known task names', () => {
    expect(
      scan(
        new Map([['package.json', '{"scripts":{"constructor":"exit 99","toString":"exit 99"}}']]),
      ).commands,
    ).toEqual([])
  })
  it('prefers explicit bindings, then repo tags, repo rules, user skills and defaults', () => {
    const repo = scan(new Map(Object.entries(fixtures.mixed)))
    const user = scan(
      new Map([
        [
          '.agents/skills/ui-kit/SKILL.md',
          '---\nname: ui-kit\ndescription: UI\nmetadata:\n  wholeloop.slot: build.frontend\n---\n',
        ],
      ]),
    )
    const selected = resolveSlot('build.frontend', repo, { user })
    expect(selected.selected?.ref).toBe('.agents/skills/web-guide/SKILL.md')
    expect(
      selected.candidates
        .filter((candidate) => !candidate.selected)
        .every((candidate) => candidate.outcome.includes('Lost')),
    ).toBe(true)
    expect(
      resolveSlot('build.frontend', repo, { binding: 'default', user }).selected,
    ).toMatchObject({ ref: 'default', origin: 'config' })
    expect(resolveSlot('build.frontend', scan(new Map()), { user }).selected?.origin).toBe('user')
    expect(resolveSlot('build.mobile', scan(new Map())).selected?.origin).toBe('harness')
    expect(selected).toMatchSnapshot()
  })
  it('asks on equal candidates or description-only matches instead of choosing by filename', () => {
    const skill = (name: string, description: string) =>
      `---\nname: ${name}\ndescription: ${description}\n---\n`
    const tied = scan(
      new Map([
        ['.agents/skills/frontend-one/SKILL.md', skill('frontend-one', 'UI')],
        ['.claude/skills/frontend-two/SKILL.md', skill('frontend-two', 'UI')],
      ]),
    )
    expect(resolveSlot('build.frontend', tied).selected).toBeNull()
    expect(resolveSlot('build.frontend', tied).questions[0]?.options).toHaveLength(2)
    const weak = scan(
      new Map([['.agents/skills/guide/SKILL.md', skill('guide', 'Our frontend patterns')]]),
    )
    expect(resolveSlot('build.frontend', weak).questions).toHaveLength(1)
  })
  it('reports invalid metadata and package files, and refuses resolution over a partial scan', () => {
    const map = scan(
      new Map([
        ['package.json', '{broken'],
        ['.agents/skills/guide/SKILL.md', '---\nmetadata:\n  wholeloop.slot: unknown.slot\n---\n'],
      ]),
    )
    expect(map.problems).toHaveLength(2)
    expect(() => resolveSlot('build.frontend', map)).toThrow('discovery problems')
    expect(() => resolveSlot('unknown.slot', scan(new Map()))).toThrow('Unknown slot')
  })
})

describe('discovery cache and step bindings', () => {
  it('invalidates a valid legacy inventory cache even when the marked source bytes are unchanged', () => {
    const dir = canonicalPath(mkdtempSync(join(tmpdir(), 'wl-entrypoint-cache-')))
    try {
      const root = join(dir, 'repo')
      const home = join(dir, 'home')
      mkdirSync(root)
      mkdirSync(home)
      const skill = join(root, '.agents/skills/frame-problem/SKILL.md')
      mkdirSync(dirname(skill), { recursive: true })
      writeFileSync(
        skill,
        markEntrypoint('---\nname: frame-problem\ndescription: Framing entrypoint\n---\n# Frame\n'),
      )
      const store = new StateStore(join(dir, 'state'))
      const first = discover(root, store.files, home)
      expect(first.repo.assets[0]?.entrypoint).toBe(true)
      const file = `cache/discovery/${readdirSync(store.files.path('cache/discovery'))[0]}`
      const legacy = JSON.parse(store.files.read(file) ?? '{}')
      for (const asset of legacy.repo.assets) delete asset.entrypoint
      const hash = (value: string) => createHash('sha256').update(value).digest('hex')
      const repo = readInventory(root)
      const user = readInventory(home, [
        '.agents/skills',
        '.claude/skills',
        '.codex/skills',
        '.opencode/skills',
        '.gemini/skills',
        '.cursor/skills',
        '.github/skills',
      ])
      legacy.fingerprint = hash(
        JSON.stringify({
          v: 1,
          repo: [...repo.files],
          user: [...user.files],
          warnings: [...repo.warnings, ...user.warnings],
        }),
      )
      legacy.checksum = hash(JSON.stringify([legacy.repo, legacy.user]))
      store.files.atomic(file, JSON.stringify(legacy))
      const current = discover(root, store.files, home)
      expect(current.cached).toBe(false)
      expect(current.repo.assets[0]?.entrypoint).toBe(true)
      expect(resolveSlot('frame.template', current.repo).selected?.origin).toBe('harness')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
  it('treats markers as routing hints while preserving fenced/quoted examples and explicit slot tags', () => {
    const marker = '<!-- wholeloop:entrypoint@1 -->'
    const content = '---\nname: frame-problem\ndescription: Real framing guide\n---\n# Guide\n'
    const file = '.agents/skills/frame-problem/SKILL.md'
    expect(isEntrypoint(`${content}\n\`\`\`html\n${marker}\n\`\`\`\n`)).toBe(false)
    expect(isEntrypoint(`${content}\n    ${marker}\n`)).toBe(false)
    const marked = markEntrypoint(content)
    expect(isEntrypoint(marked)).toBe(true)
    expect(markEntrypoint(marked)).toBe(marked)
    const map = scan(new Map([[file, marked]]))
    expect(map.assets[0]?.entrypoint).toBe(true)
    expect(resolveSlot('frame.template', map).excluded).toContainEqual({
      ref: file,
      origin: 'repo',
      reason: expect.stringContaining('entrypoint'),
    })
    const tagged = marked.replace(
      'description: Real framing guide',
      'description: Real framing guide\nmetadata:\n  wholeloop.slot: frame.template',
    )
    expect(resolveSlot('frame.template', scan(new Map([[file, tagged]]))).selected?.ref).toBe(file)
    const native = 'name = "wl-reviewer"\ndeveloper_instructions = "Read evidence"\n'
    expect(isEntrypoint(markEntrypoint(native, 'toml'), 'toml')).toBe(true)
    expect(
      isEntrypoint('developer_instructions = """\n# wholeloop:entrypoint@1\n"""\n', 'toml'),
    ).toBe(false)
    expect(isEntrypoint('broken = \n# wholeloop:entrypoint@1\n', 'toml')).toBe(false)
  })
  it.each(['user', 'project'] as const)(
    'begins real framing after a six-client %s install and still asks about genuine competing guides',
    (scope) => {
      const dir = canonicalPath(mkdtempSync(join(tmpdir(), 'wl-entrypoint-flow-')))
      try {
        const root = join(dir, 'repository')
        const home = join(dir, 'home')
        mkdirSync(root)
        mkdirSync(home)
        const canonical = new Map(
          [...bundledCanonical()].filter(([path]) =>
            ['harness/skills/frame-problem/SKILL.md', 'harness/agents/reviewer.md'].includes(path),
          ),
        )
        const context = { root, home, store: join(dir, 'state/wholeloop'), scope, env: {} }
        const binary = resolve('dist/wl.mjs')
        manageInstallation('install', {
          context,
          targets: ['claude', 'codex', 'opencode', 'copilot', 'gemini', 'antigravity'],
          canonical,
          core: readFileSync(binary, 'utf8'),
          version: '0.0.0',
        })
        const env: NodeJS.ProcessEnv = {
          ...process.env,
          HOME: home,
          USERPROFILE: home,
          XDG_CONFIG_HOME: join(home, '.config'),
          XDG_STATE_HOME: join(dir, 'state'),
          CODEX_HOME: join(home, '.codex'),
          CLAUDE_CONFIG_DIR: join(home, '.claude'),
          OPENCODE_CONFIG_DIR: join(home, '.config/opencode'),
          COPILOT_HOME: join(home, '.copilot'),
          GEMINI_CLI_HOME: home,
        }
        delete env.WL_WORKSPACE
        delete env.WL_SUBJECT
        const begin = (input: string) =>
          spawnSync(
            process.execPath,
            [
              binary,
              'step',
              'begin',
              'frame-problem',
              '--input',
              input,
              '--owner',
              'Fixture Owner',
              '--json',
            ],
            { cwd: root, env, encoding: 'utf8', timeout: 15000, maxBuffer: 1048576 },
          )
        const first = begin('Find the first synthetic order')
        expect(first.status, first.stdout + first.stderr).toBe(0)
        expect(JSON.parse(first.stdout).bindings['frame.template'].selected.origin).toBe('harness')
        const guide = (tool: string, name: string) => {
          const path = join(root, tool, 'skills', name, 'SKILL.md')
          mkdirSync(dirname(path), { recursive: true })
          writeFileSync(
            path,
            `---\nname: ${name}\ndescription: Team framing guide\nmetadata:\n  wholeloop.slot: frame.template\n---\n# Team guide\n`,
          )
        }
        guide('.agents', 'team-frame')
        const guided = begin('Find the second synthetic order')
        expect(guided.status, guided.stdout + guided.stderr).toBe(0)
        expect(JSON.parse(guided.stdout).bindings['frame.template'].selected.ref).toBe(
          '.agents/skills/team-frame/SKILL.md',
        )
        guide('.claude', 'other-frame')
        const ambiguous = begin('Find the third synthetic order')
        expect(ambiguous.status).toBe(2)
        expect(JSON.parse(ambiguous.stdout).questions[0].options).toHaveLength(2)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
    60000,
  )
  it('keeps coinstalled harness entrypoints out of heuristic guidance while retaining explicit repository choices', () => {
    const root = '/fixture/repository'
    const context = {
      root,
      home: '/fixture/home',
      store: '/fixture/state',
      scope: 'project' as const,
      env: {},
    }
    const files = new Map<string, string>()
    for (const target of ['claude', 'codex', 'opencode', 'copilot', 'gemini', 'antigravity']) {
      const plan = installationPlan(
        target,
        context,
        `${root}/.wholeloop/distribution/${target}`,
        bundledCanonical(),
        '#!/usr/bin/env node\nconsole.log("fixture")\n',
        '0.0.0',
      )
      for (const file of plan.files) files.set(relative(root, file.path), file.content)
    }
    const map = scan(files)
    expect(map.problems).toEqual([])
    const result = resolveSlot('frame.template', map)
    expect(result.selected?.origin).toBe('harness')
    expect(result.questions).toEqual([])
    files.set(
      '.agents/skills/team-frame/SKILL.md',
      '---\nname: team-frame\ndescription: Team framing template\nmetadata:\n  wholeloop.slot: frame.template\n---\n# Team guide\n',
    )
    expect(resolveSlot('frame.template', scan(files)).selected?.ref).toBe(
      '.agents/skills/team-frame/SKILL.md',
    )
    const explicit = resolveSlot('frame.template', map, {
      binding: '.claude/skills/wl-frame-problem/SKILL.md',
    })
    expect(explicit.selected?.origin).toBe('config')
  })
  it('ignores packaged native copies and their aliases without hiding installed overlays', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wholeloop-distribution-discovery-'))
    try {
      const installed = '.opencode/skills/wl-frame-problem/SKILL.md'
      const bundled = '.wholeloop/distribution/opencode/.opencode/skills/wl-frame-problem/SKILL.md'
      const content = '---\nname: wl-frame-problem\ndescription: Frame a problem\n---\n'
      for (const file of [installed, bundled]) {
        mkdirSync(dirname(join(dir, file)), { recursive: true })
        writeFileSync(join(dir, file), content)
      }
      symlinkSync(join(dir, '.wholeloop/distribution'), join(dir, 'packaged-alias'))
      expect([...readInventory(dir).files.keys()]).toEqual([installed])
      const map = scan(
        new Map([
          [installed, content],
          [bundled, content],
        ]),
      )
      expect(map.assets.map((asset) => asset.path)).toEqual([installed])
      expect(resolveSlot('frame.template', map).selected?.ref).toBe(installed)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
  it('invalidates on content changes, ignores dependencies and guards symlink boundaries', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wholeloop-discovery-'))
    try {
      const root = join(dir, 'repo')
      const home = join(dir, 'home')
      mkdirSync(root)
      mkdirSync(home)
      const store = new StateStore(join(dir, 'state'))
      writeFileSync(join(root, 'package.json'), '{"scripts":{"test":"exit 99"}}')
      mkdirSync(join(root, 'node_modules'))
      writeFileSync(join(root, 'node_modules/package.json'), 'broken')
      symlinkSync(home, join(root, 'outside'))
      writeFileSync(join(home, 'AGENTS.md'), 'Private instructions outside this repository')
      const first = discover(root, store.files, home)
      const second = discover(root, store.files, home)
      expect(first.cached).toBe(false)
      expect(second.cached).toBe(true)
      expect(second.repo).toEqual(first.repo)
      expect(second.repo.problems).toEqual([])
      expect(readInventory(root).files.has('outside/AGENTS.md')).toBe(false)
      writeFileSync(join(root, 'package.json'), '{"scripts":{"check":"exit 99"}}')
      const changed = discover(root, store.files, home)
      expect(changed.cached).toBe(false)
      expect(changed.fingerprint).not.toBe(first.fingerprint)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
  it('asks about ambiguous step slots and remembers an explicit repository choice', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wholeloop-bindings-'))
    try {
      const root = join(dir, 'repo')
      for (const tool of ['agents', 'claude']) {
        const file = join(root, `.${tool}/skills/frame-problem/SKILL.md`)
        mkdirSync(dirname(file), { recursive: true })
        writeFileSync(file, '---\nname: frame-problem\ndescription: Framing guide\n---\n')
      }
      const engine = new FlowEngine(
        new StateStore(join(dir, 'state')),
        root,
        join(dir, 'config/user.yml'),
        join(dir, 'home'),
      )
      const result = engine.begin('frame-problem', { input: 'Find orders', owner: 'Alex' })
      expect(result.code).toBe(2)
      expect(result.payload.questions[0]?.id).toBe('slot:frame.template')
      expect(engine.store.events()).toHaveLength(0)
      engine.answer('slot:frame.template', '.agents/skills/frame-problem/SKILL.md', {
        scope: 'project',
      })
      expect(engine.begin('frame-problem', { input: 'Find orders', owner: 'Alex' }).code).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
