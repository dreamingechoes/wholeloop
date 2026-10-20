import { spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { parse as toml } from 'smol-toml'
import { describe, expect, it } from 'vitest'
import { bundledCanonical } from '../../../src/adapters/canonical.js'
import { adapterFor, generateAdapter } from '../../../src/adapters/generate.js'
import { frontmatter } from '../../../src/harness/frontmatter.js'

const core = '#!/usr/bin/env node\nconsole.log("fixture core")\n'
const sources = new Map([
  [
    'harness/skills/next/SKILL.md',
    '---\nname: next\ndescription: Continue fixture work.\n---\n# Next\n\nCall wl next --json.\n',
  ],
  [
    'harness/agents/reviewer.md',
    '---\nname: reviewer\ndescription: Observe the assigned fixture.\nmetadata:\n  wholeloop.capabilities: read shell web\n  wholeloop.tier: deep\n---\n# Review\n\nReturn concrete evidence.\n',
  ],
  ['harness/protocols/core-invariants.md', '# Core invariants\n\nRetain evidence.\n'],
])
function fixture(run: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-targets-'))
  try {
    run(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('additional tier-A render targets', () => {
  it.each(['codex', 'opencode', 'copilot'])('%s matches its native golden tree', (id) => {
    const generated = generateAdapter(id, sources, core, '0.0.0')
    expect(Object.fromEntries(generated.files)).toMatchSnapshot()
    expect(generated.manifest.skills).toEqual(['wl-next'])
    expect(generated.manifest.agents).toEqual(['wl-reviewer'])
    expect(generated.manifest.capabilities).toMatchObject({
      conformance: 'unverified',
      hooks: id === 'codex' ? 'git-fallback' : 'native-and-git-fallback',
      engines: ['headless', 'sequential'],
    })
  })
  it.each(['codex', 'opencode', 'copilot'])(
    'refuses %s skill names that overflow after namespacing',
    (id) => {
      const name = 'a'.repeat(64)
      const changed = new Map(sources)
      changed.delete('harness/skills/next/SKILL.md')
      changed.set(
        `harness/skills/${name}/SKILL.md`,
        (sources.get('harness/skills/next/SKILL.md') ?? '').replace('name: next', `name: ${name}`),
      )
      expect(() => generateAdapter(id, changed, core, '0.0.0')).toThrow(/64-character/)
    },
  )
  it('uses portable root manifests without leaking native component path fields', () => {
    for (const id of ['codex', 'copilot']) {
      const files = generateAdapter(id, sources, core, '0.0.0').files
      const manifest = JSON.parse(files.get('plugin.json')?.content ?? '{}')
      expect(manifest.$schema).toBe('https://agent-plugins.org/schemas/1.0.0/plugin.schema.json')
      expect(
        Object.keys(manifest).every((key) =>
          [
            '$schema',
            'name',
            'version',
            'description',
            'author',
            'homepage',
            'repository',
            'license',
            'keywords',
            'extensions',
          ].includes(key),
        ),
      ).toBe(true)
      expect(files.has(adapterFor(id).paths('skill', 'next'))).toBe(true)
    }
  })
  it('keeps Codex permission inheritance explicit instead of emitting a false per-role sandbox', () => {
    const adapter = adapterFor('codex')
    const files = generateAdapter('codex', sources, core, '0.0.0').files
    const agent = toml(files.get(adapter.paths('agent', 'reviewer'))?.content ?? '')
    expect(agent).toMatchObject({
      name: 'wl-reviewer',
      features: {
        shell_tool: false,
        apps: false,
        plugins: false,
        memories: false,
        request_permissions_tool: false,
      },
    })
    expect(agent).not.toHaveProperty('sandbox_mode')
    expect(agent).not.toHaveProperty('approval_policy')
    expect(agent).not.toHaveProperty('model')
    expect(agent.developer_instructions).toContain('cannot obtain a separate native sandbox')
    expect(adapter.capabilities().readOnly).toBe('inherited-parent-and-checked-headless')
  })
  it.each(['opencode', 'copilot'])(
    'removes shell/write channels from %s observers and retains explicit writer capabilities',
    (id) => {
      const adapter = adapterFor(id)
      const observer = frontmatter(
        adapter.renderAgent('reviewer', sources.get('harness/agents/reviewer.md') ?? '').content,
      )
      const writer = frontmatter(
        adapter.renderAgent(
          'builder',
          (sources.get('harness/agents/reviewer.md') ?? '')
            .replace('name: reviewer', 'name: builder')
            .replace('read shell web', 'read write shell'),
        ).content,
      )
      if (id === 'opencode') {
        expect(observer?.permission).toMatchObject({ '*': 'deny', read: 'allow' })
        expect(observer?.permission).not.toHaveProperty('bash')
        expect(observer?.permission).not.toHaveProperty('edit')
        expect(writer?.permission).toMatchObject({ bash: 'allow', edit: 'allow' })
      } else {
        expect(observer?.tools).toEqual(['view', 'glob', 'grep', 'web_fetch'])
        expect(observer).toMatchObject({ 'include-custom-instructions': true, infer: false })
        expect(writer?.tools).toContain('bash')
        expect(writer?.tools).toContain('apply_patch')
      }
    },
  )
  it('applies one canonical change to all four target outputs without dropping coverage', () => {
    const changed = new Map(sources)
    changed.set(
      'harness/skills/next/SKILL.md',
      `${changed.get('harness/skills/next/SKILL.md')}\nRetain the unique changed contract.\n`,
    )
    for (const id of ['claude', 'codex', 'opencode', 'copilot']) {
      const before = generateAdapter(id, sources, core, '0.0.0')
      const after = generateAdapter(id, changed, core, '0.0.0')
      expect(after.manifest.source).not.toBe(before.manifest.source)
      expect(after.manifest.skills).toHaveLength(1)
      expect(after.manifest.agents).toHaveLength(1)
      expect(after.files.get(adapterFor(id).paths('skill', 'next'))?.content).toContain(
        'unique changed contract',
      )
    }
  })
  it.each(['codex', 'opencode', 'copilot'])(
    'executes %s skill launchers and symlinked overlays outside the artifact tree',
    (id) =>
      fixture((dir) => {
        const output = join(dir, 'artifact with spaces')
        const env = {
          ...process.env,
          XDG_CONFIG_HOME: join(dir, 'config'),
          XDG_STATE_HOME: join(dir, 'state'),
          WL_WORKSPACE: '',
        }
        const build = spawnSync(
          process.execPath,
          [resolve('dist/wl.mjs'), 'build', '--target', id, '--out', output, '--json'],
          { cwd: dir, env, encoding: 'utf8' },
        )
        expect(build.stderr).toBe('')
        expect(build.status).toBe(0)
        const skill = dirname(adapterFor(id).paths('skill', 'next'))
        const installed = join(dir, 'installed', 'wl-next')
        mkdirSync(dirname(installed), { recursive: true })
        symlinkSync(join(output, skill), installed, 'dir')
        const launcher = join(installed, 'scripts/wl.mjs')
        const call = (...args: string[]) =>
          spawnSync(process.execPath, [launcher, ...args, '--json'], {
            cwd: dir,
            env,
            encoding: 'utf8',
          })
        const root = call('adapter', 'root')
        expect(root.stderr).toBe('')
        expect(root.status).toBe(0)
        expect(JSON.parse(root.stdout)).toMatchObject({
          root: realpathSync(output),
          target: id,
          version: '0.0.0',
        })
        const next = call('next', 'Launch from a real path', '--owner', 'Alex')
        expect(next.status).toBe(0)
        expect(JSON.parse(next.stdout).contract.subject.id).toMatch(/^init-/)
        const file = join(output, 'wholeloop-artifacts.json')
        const manifest = JSON.parse(readFileSync(file, 'utf8'))
        manifest.core = 'a'.repeat(64)
        writeFileSync(file, JSON.stringify(manifest))
        const corrupted = call('adapter', 'root')
        expect(corrupted.status).toBe(3)
        expect(JSON.parse(corrupted.stdout).message).toContain('matching')
      }),
    15000,
  )
  it('refuses artifact-root claims from a source-checkout executable', () => {
    const result = spawnSync(
      process.execPath,
      [resolve('dist/wl.mjs'), 'adapter', 'root', '--json'],
      { encoding: 'utf8' },
    )
    expect(result.status).toBe(3)
    expect(JSON.parse(result.stdout).schema).toBe('wholeloop/error@1')
  })
  it('renders all canonical roles and skills for each target from the same embedded catalog', () => {
    for (const id of ['claude', 'codex', 'opencode', 'copilot']) {
      const generated = generateAdapter(id, bundledCanonical(), core, '0.0.0')
      expect(generated.manifest.skills).toHaveLength(17)
      expect(generated.manifest.agents).toHaveLength(8)
      expect(generated.manifest.files.every((file) => file.sha256.length === 64)).toBe(true)
    }
  })
})
