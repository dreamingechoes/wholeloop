import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { stringify } from 'yaml'
import { loadConfig } from '../../../src/config/load.js'
import { loadCatalog } from '../../../src/extensions/catalog.js'
import { lensAdapter, profileAdapter, templateAdapter } from '../../../src/extensions/kinds.js'
import { FlowEngine } from '../../../src/flow/engine.js'
import { FRAME_SECTIONS } from '../../../src/framing/contract.js'
import { StateStore } from '../../../src/state/store.js'

function fixture(run: (dir: string, put: (path: string, content: unknown) => void) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-extensions-'))
  const put = (path: string, content: unknown) => {
    const file = join(dir, path)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(
      file,
      typeof content === 'string'
        ? content
        : path.endsWith('.json')
          ? JSON.stringify(content)
          : stringify(content),
    )
  }
  try {
    run(dir, put)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
const profile = (id: string, depth: string) => ({ schema: 1, id, dials: { depth } })
const lens = (id: string, extra = {}) => ({
  schema: 1,
  id,
  gate: 'review',
  asks: 'Is this accessible?',
  'fail-safe': false,
  prompt: 'prompt.md',
  ...extra,
})
const template = (id: string, required: string[], extra = {}) =>
  `---\n${stringify({ schema: 1, id, sections: { required }, ...extra })}---\n# {{title}}\n\n${required.map((name) => `## ${name}\n\nSupply evidence.`).join('\n\n')}\n`

describe('layered manifest catalogs', () => {
  it('applies built-in, package, user and repository precedence with merge or replacement', () =>
    fixture((dir, put) => {
      put('node_modules/team-kit/package.json', {
        name: 'team-kit',
        version: '1.0.0',
        main: 'must-not-run.js',
      })
      put('node_modules/team-kit/must-not-run.js', "throw new Error('package code executed')")
      put('node_modules/team-kit/profiles/pair/profile.yml', profile('pair', 'product'))
      put('user/profiles/pair/profile.json', {
        schema: 1,
        id: 'pair',
        extends: 'pair',
        dials: { challenge: 'adversarial' },
      })
      const options = { root: dir, user: join(dir, 'user'), packages: ['team-kit@^1'] }
      let catalog = loadCatalog(profileAdapter, options)
      expect(catalog.problems).toEqual([])
      expect(catalog.entries.find((entry) => entry.manifest.id === 'pair')?.manifest.dials).toEqual(
        { depth: 'product', challenge: 'adversarial' },
      )
      put('.wholeloop/profiles/pair/profile.yml', {
        schema: 1,
        id: 'pair',
        extends: 'pair',
        dials: { pace: 'staged' },
      })
      catalog = loadCatalog(profileAdapter, options)
      expect(catalog.problems).toEqual([])
      expect(catalog.entries.find((entry) => entry.manifest.id === 'pair')).toMatchObject({
        origin: join(dir, '.wholeloop/profiles/pair/profile.yml'),
        manifest: { dials: { depth: 'product', challenge: 'adversarial', pace: 'staged' } },
      })
      put('.wholeloop/profiles/pair/profile.yml', profile('pair', 'technical'))
      expect(
        loadCatalog(profileAdapter, options).entries.find((entry) => entry.manifest.id === 'pair')
          ?.manifest.dials,
      ).toEqual({ depth: 'technical' })
    }))

  it('rejects removal of required sections and names the dependent step', () =>
    fixture((dir, put) => {
      put(
        '.wholeloop/templates/spec.md',
        template('spec', ['problem', 'users', 'stories', 'criteria', 'rollout'], {
          extends: 'builtin:spec',
        }),
      )
      const catalog = loadCatalog(templateAdapter, { root: dir, user: join(dir, 'user') })
      expect(catalog.problems[0]?.message).toBe(
        'Required section metrics cannot be removed; measure-impact depends on it',
      )
      expect(catalog.entries.find((entry) => entry.manifest.id === 'spec')?.origin).toBe(
        'builtin:spec',
      )
    }))

  it('retains inherited required sections after renaming and rejects empty headings', () =>
    fixture((dir, put) => {
      put(
        '.wholeloop/templates/custom.md',
        template(
          'custom',
          FRAME_SECTIONS.filter((name) => name !== 'Owner').map((name) => name.toLowerCase()),
          { extends: 'builtin:frame' },
        ),
      )
      let catalog = loadCatalog(templateAdapter, { root: dir, user: join(dir, 'user') })
      expect(catalog.problems[0]?.message).toContain(
        'owner cannot be removed; initiative ownership',
      )
      put(
        '.wholeloop/templates/custom.md',
        template(
          'custom',
          FRAME_SECTIONS.map((name) => name.toLowerCase()),
          { extends: 'builtin:frame' },
        ).replace('## owner\n\nSupply evidence.', '## owner'),
      )
      catalog = loadCatalog(templateAdapter, { root: dir, user: join(dir, 'user') })
      expect(catalog.problems[0]?.message).toContain('Missing or empty required section: owner')
    }))

  it('merges template maps, replaces section arrays and detects duplicate ids', () =>
    fixture((dir, put) => {
      put(
        '.wholeloop/templates/frame.md',
        template(
          'frame',
          [...FRAME_SECTIONS]
            .reverse()
            .map((name) => name.toLowerCase())
            .concat('risks'),
          { extends: 'builtin:frame' },
        ),
      )
      let catalog = loadCatalog(templateAdapter, { root: dir, user: join(dir, 'user') })
      expect(catalog.problems).toEqual([])
      expect(
        catalog.entries.find((entry) => entry.manifest.id === 'frame')?.manifest.sections.required,
      ).toEqual(
        [...FRAME_SECTIONS]
          .reverse()
          .map((name) => name.toLowerCase())
          .concat('risks'),
      )
      put('.wholeloop/templates/frame/template.md', template('frame', ['owner', 'problem']))
      catalog = loadCatalog(templateAdapter, { root: dir, user: join(dir, 'user') })
      expect(catalog.problems[0]?.message).toContain('Duplicate manifest id frame')
    }))

  it('preserves inherited resource origins and rejects escapes and oversized prompts', () =>
    fixture((dir, put) => {
      put('user/lenses/accessibility/lens.yml', lens('accessibility'))
      put('user/lenses/accessibility/prompt.md', 'Inspect keyboard navigation.\n')
      put('.wholeloop/lenses/accessibility/lens.yml', {
        schema: 1,
        id: 'accessibility',
        extends: 'accessibility',
        asks: 'Does focus remain visible?',
      })
      const options = { root: dir, user: join(dir, 'user') }
      let catalog = loadCatalog(lensAdapter, options)
      expect(catalog.problems).toEqual([])
      expect(catalog.entries[0]?.resources.prompt).toBe(
        join(dir, 'user/lenses/accessibility/prompt.md'),
      )
      put('.wholeloop/lenses/accessibility/lens.yml', lens('accessibility'))
      symlinkSync(
        join(dir, 'user/lenses/accessibility/prompt.md'),
        join(dir, '.wholeloop/lenses/accessibility/prompt.md'),
      )
      catalog = loadCatalog(lensAdapter, options)
      expect(catalog.problems[0]?.message).toContain('escapes')
      rmSync(join(dir, '.wholeloop/lenses/accessibility/prompt.md'))
      put('.wholeloop/lenses/accessibility/prompt.md', 'Check.\n'.repeat(41))
      expect(loadCatalog(lensAdapter, options).problems[0]?.message).toContain('exceeds 40 lines')
    }))

  it.each([
    { schema: 2, id: 'custom', dials: { depth: 'product' } },
    { schema: 1, id: 'custom', dials: { pace: 'fast' } },
    { schema: 1, id: 'custom', dials: { preset: 'pair' } },
    { schema: 1, id: 'custom', dials: {}, gates: { review: false } },
  ])('rejects invalid profile schema or coverage fields: %j', (value) => {
    expect(() => profileAdapter.validate(value)).toThrow()
  })

  it('reports cycles, missing bases and malformed files without partial manifests', () =>
    fixture((dir, put) => {
      put('.wholeloop/profiles/first/profile.yml', { schema: 1, id: 'first', extends: 'second' })
      put('.wholeloop/profiles/second/profile.yml', { schema: 1, id: 'second', extends: 'first' })
      put('.wholeloop/profiles/missing/profile.yml', {
        schema: 1,
        id: 'missing',
        extends: 'unknown',
      })
      put('.wholeloop/profiles/broken/profile.yml', 'id: broken\nid: duplicate\n')
      const catalog = loadCatalog(profileAdapter, { root: dir, user: join(dir, 'user') })
      expect(catalog.problems).toHaveLength(4)
      expect(catalog.problems.map((problem) => problem.message).join('\n')).toContain('cycle')
      expect(catalog.entries).toHaveLength(4)
    }))
})

describe('usable custom profiles and extension commands', () => {
  it('uses a repository override of the default preset without an explicit selection', () =>
    fixture((dir, put) => {
      put('.wholeloop/profiles/pair/profile.yml', {
        schema: 1,
        id: 'pair',
        extends: 'builtin:pair',
        dials: { depth: 'technical' },
      })
      expect(
        loadConfig({ root: dir, userFile: join(dir, 'user/config.yml') }).values.profile,
      ).toMatchObject({ preset: 'pair', depth: 'technical' })
    }))

  it('expands custom profiles at every scope and renders them in step preflights', () =>
    fixture((dir, put) => {
      put('.wholeloop/profiles/onboarding/profile.yml', {
        schema: 1,
        id: 'onboarding',
        extends: 'mentor',
        dials: { depth: 'product' },
      })
      put('.wholeloop/config.yml', 'version: 1\nprofile: {preset: onboarding}\n')
      const userFile = join(dir, 'user/config.yml')
      expect(loadConfig({ root: dir, userFile }).values.profile).toMatchObject({
        preset: 'onboarding',
        depth: 'product',
        teaching: 'on',
      })
      const engine = new FlowEngine(
        new StateStore(join(dir, 'state')),
        dir,
        userFile,
        join(dir, 'home'),
      )
      const begin = engine.begin('frame-problem', {
        input: 'Search orders',
        owner: 'Alex',
        profile: { verbosity: 'brief' },
      })
      expect(begin.code).toBe(0)
      expect(begin.payload.profile).toContain('product')
      put('user/config.yml', 'version: 1\nprofile: {preset: sparring}\n')
      expect(loadConfig({ root: dir, userFile }).values.profile).toMatchObject({
        preset: 'sparring',
        depth: 'technical',
        teaching: 'off',
      })
    }))

  it('loads a custom profile supplied by a configured npm manifest package', () =>
    fixture((dir, put) => {
      put('node_modules/team-kit/package.json', { name: 'team-kit', version: '1.0.0' })
      put('node_modules/team-kit/profiles/team/profile.yml', {
        schema: 1,
        id: 'team',
        extends: 'builtin:pair',
        dials: { depth: 'technical' },
      })
      put(
        '.wholeloop/config.yml',
        'version: 1\nextensions: [team-kit@^1]\nprofile: {preset: team}\n',
      )
      expect(
        loadConfig({ root: dir, userFile: join(dir, 'user.yml') }).values.profile,
      ).toMatchObject({ preset: 'team', depth: 'technical' })
    }))

  it('round-trips every scaffold through the compiled CLI and refuses overwrites', () =>
    fixture((dir) => {
      const cli = resolve('dist/wl.mjs')
      const env = {
        ...process.env,
        XDG_CONFIG_HOME: join(dir, 'config'),
        XDG_STATE_HOME: join(dir, 'state'),
      }
      const invoke = (...args: string[]) =>
        JSON.parse(
          execFileSync(process.execPath, [cli, ...args, '--json'], {
            cwd: dir,
            env,
            encoding: 'utf8',
          }),
        )
      for (const kind of ['template', 'profile', 'lens']) {
        const output = join(dir, '.wholeloop', kind === 'lens' ? 'lenses' : `${kind}s`, 'custom')
        const generated = invoke(kind, 'scaffold', 'custom', '--output', output)
        expect(generated.schema).toBe(`wholeloop/${kind}-scaffold@1`)
        expect(invoke(kind, 'test', 'custom').entries).toHaveLength(1)
        expect(
          invoke(kind, 'list').entries.some(
            (entry: { manifest: { id: string } }) => entry.manifest.id === 'custom',
          ),
        ).toBe(true)
        const again = spawnSync(
          process.execPath,
          [cli, kind, 'scaffold', 'custom', '--output', output, '--json'],
          { cwd: dir, env, encoding: 'utf8' },
        )
        expect(again.status).toBe(4)
        expect(JSON.parse(again.stdout).message).toContain('already exists')
      }
      expect(invoke('profile', 'preset', 'custom', '--scope', 'run').profile.depth).toBe(
        'technical',
      )
      expect(invoke('profile', 'preset', 'custom').profile.preset).toBe('custom')
      expect(readFileSync(join(dir, 'config/wholeloop/config.yml'), 'utf8')).toContain(
        'preset: custom',
      )
      expect(invoke('profile', 'show').profile.preset).toBe('custom')
    }))
})
