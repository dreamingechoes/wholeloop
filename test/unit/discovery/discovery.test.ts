import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveSlot } from '../../../src/discovery/resolve.js'
import { scan } from '../../../src/discovery/scan.js'
import { discover, readInventory } from '../../../src/discovery/tree.js'
import { FlowEngine } from '../../../src/flow/engine.js'
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
