import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { harnessAssets } from '../../../scripts/harness-assets.mjs'
import { bundledCanonical, canonicalDigest } from '../../../src/adapters/canonical.js'
import { generateAdapter } from '../../../src/adapters/generate.js'
import { writeAdapter } from '../../../src/adapters/write.js'
import { frontmatter } from '../../../src/harness/frontmatter.js'
import { readHarnessTree } from '../../../src/harness/tree.js'

const core = '#!/usr/bin/env node\nconsole.log("fixture core")\n'
const skill =
  '---\nname: next\ndescription: Continue recorded fixture work.\n---\n# Next\n\nRead core-invariants.\nCall `wl next --json`.\n'
const agent =
  '---\nname: reviewer\ndescription: Observe one assigned fixture.\nmetadata:\n  wholeloop.capabilities: read shell\n  wholeloop.tier: deep\n---\n# Review\n\nRead core-invariants.\nReturn observed evidence.\n'
const canonical = new Map([
  ['harness/skills/next/SKILL.md', skill],
  ['harness/agents/reviewer.md', agent],
  ['harness/protocols/core-invariants.md', '# Core invariants\n\nUse recorded facts.\n'],
])
function fixture(run: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-adapter-'))
  try {
    run(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('canonical client artifact generation', () => {
  it('renders the Claude golden tree and keeps the core executable', () => {
    const generated = generateAdapter('claude', canonical, core, '0.0.0')
    expect(Object.fromEntries(generated.files)).toMatchSnapshot()
    expect(generated.manifest.capabilities).toMatchObject({
      conformance: 'unverified',
      hooks: 'native-and-git-fallback',
    })
    expect(frontmatter(generated.files.get('agents/reviewer.md')?.content ?? '')).toMatchObject({
      tools: 'Read, Glob, Grep, Bash',
      permissionMode: 'plan',
      disallowedTools: 'Write, Edit, NotebookEdit, mcp__*',
      model: 'opus',
    })
    expect(generated.files.get('bin/wl.mjs')?.mode).toBe(0o755)
  })
  it('embeds the current canonical tree without relying on the source checkout at runtime', () => {
    const source = new Map(
      [...readHarnessTree(resolve('.')).files].filter(([path]) => /\.(md|json|ya?ml)$/.test(path)),
    )
    expect(bundledCanonical()).toEqual(source)
    const generated = generateAdapter('claude', bundledCanonical(), core, '0.0.0')
    expect(generated.manifest.skills).toHaveLength(17)
    expect(generated.manifest.agents).toHaveLength(8)
    expect(generated.files.get('skills/next/SKILL.md')?.content).toContain(
      `node "\${CLAUDE_PLUGIN_ROOT}/bin/wl.mjs" next`,
    )
    expect([...generated.files.keys()].some((path) => path.endsWith('.ts'))).toBe(false)
  })
  it('rejects symlinked or oversized build-time resources and excludes workflow source', () =>
    fixture((dir) => {
      const root = join(dir, 'harness')
      mkdirSync(root)
      writeFileSync(join(root, 'workflow.ts'), 'export const fixture = true\n')
      writeFileSync(join(root, 'protocol.md'), '# Fixture protocol\n')
      expect(harnessAssets(dir)).toEqual({ 'harness/protocol.md': '# Fixture protocol\n' })
      symlinkSync(join(root, 'protocol.md'), join(root, 'linked.md'))
      expect(() => harnessAssets(dir)).toThrow(/symlinks/)
      rmSync(join(root, 'linked.md'))
      writeFileSync(join(root, 'large.md'), 'x'.repeat(1024 * 1024 + 1))
      expect(() => harnessAssets(dir)).toThrow(/1 MiB/)
    }))
  it('produces stable output independent of map insertion order and changes hashes for canonical edits', () => {
    const first = generateAdapter('claude', canonical, core, '0.0.0')
    expect(generateAdapter('claude', new Map([...canonical].reverse()), core, '0.0.0')).toEqual(
      first,
    )
    const changed = new Map(canonical)
    changed.set('harness/skills/next/SKILL.md', `${skill}\nRetain uncertainty.\n`)
    const second = generateAdapter('claude', changed, core, '0.0.0')
    expect(second.manifest.source).not.toBe(first.manifest.source)
    expect(second.files.get('skills/next/SKILL.md')).not.toEqual(
      first.files.get('skills/next/SKILL.md'),
    )
    expect(canonicalDigest(changed)).toBe(second.manifest.source)
  })
  it('maps declared write/tools/model tiers without granting write tools to observers', () => {
    for (const [capabilities, tier, model] of [
      ['read', 'fast', 'haiku'],
      ['read shell web', 'standard', 'sonnet'],
      ['read write shell', 'deep', 'opus'],
    ]) {
      const changed = new Map(canonical)
      changed.set(
        'harness/agents/reviewer.md',
        agent.replace('read shell', capabilities ?? '').replace('deep', tier ?? ''),
      )
      const rendered =
        generateAdapter('claude', changed, core, '0.0.0').files.get('agents/reviewer.md')
          ?.content ?? ''
      const metadata = frontmatter(rendered)
      expect(metadata?.model).toBe(model)
      expect(String(metadata?.tools).includes('Edit')).toBe(capabilities?.includes('write'))
      expect(metadata?.permissionMode).toBe(capabilities?.includes('write') ? undefined : 'plan')
    }
  })
  it('rejects invalid canonical paths/front matter/budgets and unsupported targets', () => {
    expect(() => generateAdapter('other', canonical, core, '0.0.0')).toThrow(/Choose/)
    expect(() => generateAdapter('claude', canonical, 'not a built executable', '0.0.0')).toThrow(
      /built executable/,
    )
    for (const [path, content] of [
      ['harness/../escape.md', 'Escape'],
      ['harness/skills/next/SKILL.md', skill.replace('name: next', 'name: wrong')],
      ['harness/agents/reviewer.md', agent.replace('read shell', 'unknown')],
      ['harness/protocols/too-long.md', 'line\n'.repeat(81)],
    ]) {
      const changed = new Map(canonical)
      changed.set(path ?? '', content ?? '')
      expect(() => generateAdapter('claude', changed, core, '0.0.0')).toThrow()
    }
  })
  it('writes an owned tree idempotently and preserves the prior version on upgrade', () =>
    fixture((dir) => {
      const output = join(dir, 'nested', 'plugin with spaces')
      const first = generateAdapter('claude', canonical, core, '0.0.0')
      expect(writeAdapter(output, first).status).toBe('written')
      expect(writeAdapter(output, first).status).toBe('already-correct')
      const changed = new Map(canonical)
      changed.set('harness/skills/next/SKILL.md', `${skill}\nKeep the fixture note.\n`)
      const upgraded = writeAdapter(output, generateAdapter('claude', changed, core, '0.0.1'))
      expect(upgraded.backup).toBeTruthy()
      expect(readFileSync(join(upgraded.backup ?? '', 'skills/next/SKILL.md'), 'utf8')).toBe(
        first.files.get('skills/next/SKILL.md')?.content,
      )
      expect(readFileSync(join(output, 'skills/next/SKILL.md'), 'utf8')).toContain(
        'Keep the fixture note',
      )
    }))
  it.each([
    'body',
    'mode',
    'missing',
    'outside-symlink',
    'root-symlink',
    'broken-root',
    'unowned',
    'manifest-symlink',
  ])('refuses %s output without losing user files', (kind) =>
    fixture((dir) => {
      const output = join(dir, 'plugin')
      const generated = generateAdapter('claude', canonical, core, '0.0.0')
      const sentinel = join(dir, 'sentinel')
      writeFileSync(sentinel, 'Preserve this file')
      if (kind === 'broken-root') symlinkSync(join(dir, 'missing-target'), output)
      else if (kind === 'root-symlink') symlinkSync(sentinel, output)
      else if (kind === 'unowned') {
        mkdirSync(output)
        writeFileSync(join(output, 'notes.md'), 'Unowned notes')
      } else {
        writeAdapter(output, generated)
        const path = join(output, 'skills/next/SKILL.md')
        if (kind === 'manifest-symlink') {
          const manifest = join(output, 'wholeloop-artifacts.json')
          const outside = join(dir, 'outside-manifest.json')
          writeFileSync(outside, readFileSync(manifest))
          rmSync(manifest)
          symlinkSync(outside, manifest)
        } else if (kind === 'body') writeFileSync(path, 'Human edit')
        else if (kind === 'mode') chmodSync(path, 0o600)
        else if (kind === 'missing') rmSync(path)
        else {
          rmSync(path)
          symlinkSync(sentinel, path)
        }
      }
      expect(() => writeAdapter(output, generated)).toThrow()
      expect(readFileSync(sentinel, 'utf8')).toBe('Preserve this file')
    }),
  )
  it('rejects a forged previous manifest path before reading or replacing outside content', () =>
    fixture((dir) => {
      const output = join(dir, 'plugin')
      const generated = generateAdapter('claude', canonical, core, '0.0.0')
      writeAdapter(output, generated)
      const manifest = {
        ...generated.manifest,
        files: [{ path: '../outside', sha256: 'a'.repeat(64), mode: 0o644 }],
      }
      writeFileSync(join(output, 'wholeloop-artifacts.json'), JSON.stringify(manifest))
      expect(() => writeAdapter(output, generated)).toThrow(/unsafe/)
    }))
  it(
    'builds from the compiled standalone CLI, executes its bundled core and preserves routing',
    () =>
      fixture((dir) => {
        const output = join(dir, 'plugin')
        const cli = (...args: string[]) =>
          spawnSync(process.execPath, [resolve('dist/wl.mjs'), ...args, '--json'], {
            cwd: dir,
            encoding: 'utf8',
            env: {
              ...process.env,
              XDG_CONFIG_HOME: join(dir, 'config'),
              XDG_STATE_HOME: join(dir, 'state'),
              WL_WORKSPACE: '',
            },
          })
        const dry = cli('build', '--target', 'claude', '--out', output, '--dry-run')
        expect(dry.status).toBe(0)
        expect(existsSync(output)).toBe(false)
        const built = cli('build', '--target', 'claude', '--out', output)
        expect(built.stderr).toBe('')
        expect(built.status).toBe(0)
        expect(JSON.parse(built.stdout).manifest.skills).toHaveLength(17)
        expect(JSON.parse(cli('build', '--target', 'claude', '--out', output).stdout).status).toBe(
          'already-correct',
        )
        const version = spawnSync(process.execPath, [join(output, 'bin/wl.mjs'), '--version'], {
          cwd: dir,
          encoding: 'utf8',
        })
        expect(version.status).toBe(0)
        expect(version.stdout.trim()).toBe('0.0.0')
        const next = spawnSync(
          process.execPath,
          [join(output, 'bin/wl.mjs'), 'next', 'Fixture idea', '--owner', 'Alex', '--json'],
          {
            cwd: dir,
            encoding: 'utf8',
            env: {
              ...process.env,
              XDG_CONFIG_HOME: join(dir, 'config'),
              XDG_STATE_HOME: join(dir, 'state'),
              WL_WORKSPACE: '',
            },
          },
        )
        expect(next.status).toBe(0)
        expect(JSON.parse(next.stdout).contract.subject.id).toMatch(/^init-/)
        expect(cli('build', 'schema').status).toBe(0)
      }),
    15000,
  )
})
