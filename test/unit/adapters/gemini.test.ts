import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bundledCanonical } from '../../../src/adapters/canonical.js'
import { generateAdapter } from '../../../src/adapters/generate.js'
import { writeAdapter } from '../../../src/adapters/write.js'
import { doctor } from '../../../src/diagnostics/doctor.js'
import { lineCount } from '../../../src/harness/files.js'
import { frontmatter } from '../../../src/harness/frontmatter.js'
import { inspectInstallation } from '../../../src/installation/inspect.js'
import { manageInstallation } from '../../../src/installation/manage.js'
import { installLocations } from '../../../src/installation/plan.js'
import { BUILTINS } from '../../../src/providers/builtins.js'
import { detectMcp } from '../../../src/providers/detect.js'
import { renderMcp } from '../../../src/providers/mcp.js'
import { canonicalPath } from '../../../src/state/paths.js'

const core = '#!/usr/bin/env node\nconsole.log("fixture core")\n'
const minimal = new Map([
  [
    'harness/skills/next/SKILL.md',
    '---\nname: next\ndescription: Continue fixture work.\n---\n# Next\n\nCall wl next --json.\n',
  ],
  [
    'harness/agents/reviewer.md',
    '---\nname: reviewer\ndescription: Observe assigned evidence.\nmetadata:\n  wholeloop.capabilities: read shell web\n  wholeloop.tier: deep\n---\n# Review\n\nReport evidence without changing source.\n',
  ],
  ['harness/protocols/core-invariants.md', '# Core invariants\n\nKeep state external.\n'],
])
function fixture(operation: (dir: string) => void) {
  const dir = canonicalPath(mkdtempSync(join(tmpdir(), 'wl-gemini-')))
  try {
    operation(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('Gemini extension and native overlays', () => {
  it('renders unapplied HTTP/stdio recipes and detects only enabled metadata at explicit native roots', () => {
    fixture((dir) => {
      const root = join(dir, 'repo')
      const home = join(dir, 'home')
      const override = join(dir, 'override')
      for (const base of [root, home, override])
        mkdirSync(join(base, '.gemini'), { recursive: true })
      writeFileSync(
        join(override, '.gemini/settings.json'),
        JSON.stringify({
          mcpServers: {
            included: { httpUrl: 'https://example.invalid/mcp' },
            excluded: { httpUrl: 'https://example.invalid/mcp' },
          },
          mcp: { allowed: ['included', 'excluded'], excluded: ['excluded'] },
        }),
      )
      writeFileSync(
        join(root, '.gemini/settings.json'),
        JSON.stringify({
          mcpServers: { local: { command: 'fixture-mcp' }, disabled: { disabled: true } },
          mcp: { allowed: ['local'] },
        }),
      )
      const detected = detectMcp(root, home, { GEMINI_CLI_HOME: override })
      expect(detected.problems).toEqual([])
      expect(
        detected.declarations
          .filter((entry) => entry.target === 'gemini')
          .map(({ server, enabled }) => ({ server, enabled })),
      ).toEqual([
        { server: 'included', enabled: true },
        { server: 'excluded', enabled: false },
        { server: 'local', enabled: true },
        { server: 'disabled', enabled: false },
      ])
      expect(detectMcp(root, home, { GEMINI_CLI_HOME: 'relative' }).problems).toContainEqual({
        file: 'GEMINI_CLI_HOME',
        message: expect.stringContaining('absolute'),
      })
      const provider = BUILTINS.find(
        (provider) =>
          provider.access.mcp?.install.transport === 'http' &&
          provider.access.mcp.install.auth === 'oauth',
      )
      if (!provider) throw new Error('Missing OAuth fixture provider')
      const rendered = renderMcp(provider, 'gemini')
      expect(rendered.applied).toBe(false)
      const server = JSON.parse(rendered.snippet).mcpServers[provider.access.mcp?.server ?? '']
      expect(server).toMatchObject({
        httpUrl: provider.access.mcp?.install.url,
        oauth: { enabled: true },
      })
      expect(server.type).toBeUndefined()
      expect(server.url).toBeUndefined()
    })
  })
  it('matches the Gemini native golden tree with an explicit Git fallback', () => {
    const rendered = generateAdapter('gemini', minimal, core, '0.0.0')
    expect(Object.fromEntries(rendered.files)).toMatchSnapshot()
    expect(rendered.manifest.capabilities).toMatchObject({
      conformance: 'unverified',
      hooks: 'git-fallback',
      readOnly: 'read-tool-allowlist',
      engines: ['sequential'],
    })
    expect([...rendered.files.keys()]).not.toContain('hooks/hooks.json')
    expect(JSON.parse(rendered.files.get('gemini-extension.json')?.content ?? '{}')).toEqual({
      name: 'wholeloop',
      version: '0.0.0',
      description: expect.any(String),
    })
  })
  it('keeps the complete catalog within native budgets and reduces observer channels', () => {
    const rendered = generateAdapter('gemini', bundledCanonical(), core, '0.0.0')
    expect(rendered.manifest.skills).toHaveLength(17)
    expect(rendered.manifest.agents).toHaveLength(8)
    for (const [path, file] of rendered.files) {
      if (path.endsWith('SKILL.md')) {
        expect(lineCount(file.content), path).toBeLessThanOrEqual(120)
        expect(file.content).toContain('plain text and stop for explicit answers')
      }
      if (!path.startsWith('agents/')) continue
      expect(lineCount(file.content), path).toBeLessThanOrEqual(60)
      const native = frontmatter(file.content)
      expect(Object.keys(native ?? {}).sort()).toEqual(['description', 'kind', 'name', 'tools'])
      expect(native?.kind).toBe('local')
      expect(native?.model).toBeUndefined()
      const tools = native?.tools as string[]
      expect(
        tools.every(
          (tool) =>
            !tool.includes('*') &&
            !tool.startsWith('mcp_') &&
            !['save_memory', 'delegate_to_agent', 'ask_user'].includes(tool),
        ),
      ).toBe(true)
      if (!['agents/wl-builder.md', 'agents/wl-conductor.md'].includes(path)) {
        expect(tools).not.toContain('run_shell_command')
        expect(tools).not.toContain('write_file')
        expect(tools).not.toContain('replace')
        expect(file.content).toContain('observed command/provider evidence')
      } else
        expect(tools).toEqual(
          expect.arrayContaining(['write_file', 'replace', 'run_shell_command']),
        )
      expect(file.content).toContain('Gemini subagents cannot nest delegation')
    }
  })
  it('propagates a canonical change across the five supported generators', () => {
    const changed = new Map(minimal)
    changed.set(
      'harness/skills/next/SKILL.md',
      `${minimal.get('harness/skills/next/SKILL.md')}\nRetain the exact current owner.\n`,
    )
    for (const target of ['claude', 'codex', 'opencode', 'copilot', 'gemini']) {
      const before = generateAdapter(target, minimal, core, '0.0.0')
      const after = generateAdapter(target, changed, core, '0.0.0')
      expect(after.manifest.source).not.toBe(before.manifest.source)
      expect(
        [...after.files.values()].some((file) =>
          file.content.includes('Retain the exact current owner.'),
        ),
      ).toBe(true)
    }
  })
  it.each(['user', 'project'] as const)(
    'round-trips owned Gemini %s overlays with custom homes and native fallback text',
    (scope) => {
      fixture((dir) => {
        const root = join(dir, 'repository')
        const home = join(dir, "personal ' # home")
        const override = join(dir, 'alternate home')
        mkdirSync(root)
        mkdirSync(home)
        const context = {
          root,
          home,
          store: join(dir, 'store'),
          scope,
          env: { GEMINI_CLI_HOME: override },
        }
        const input = {
          context,
          targets: ['gemini'],
          canonical: minimal,
          core: readFileSync(resolve('dist/wl.mjs'), 'utf8'),
          version: '0.0.0',
        }
        const installed = manageInstallation('install', input)
        const locations = installLocations('gemini', context)
        expect(locations.skills).toBe(join(scope === 'user' ? override : root, '.gemini/skills'))
        expect(existsSync(join(locations.agents, 'wl-reviewer.md'))).toBe(true)
        expect(readFileSync(join(locations.skills, 'wl-next/SKILL.md'), 'utf8')).toContain(
          'plain text and stop for explicit answers',
        )
        const launcher = join(locations.skills, 'wl-next/scripts/wl.mjs')
        const result = spawnSync(process.execPath, [launcher, 'adapter', 'root', '--json'], {
          cwd: root,
          encoding: 'utf8',
          timeout: 15000,
        })
        expect(result.status, result.stderr).toBe(0)
        expect(JSON.parse(result.stdout)).toMatchObject({
          target: 'gemini',
          root: installed.artifacts[0],
        })
        expect(inspectInstallation(input).status).toBe('current')
        expect(manageInstallation('install', input).status).toBe('already-correct')
        expect(manageInstallation('uninstall', input).status).toBe('uninstalled')
        expect(readdirSync(root)).toEqual([])
        expect(readdirSync(home)).toEqual([])
        expect(manageInstallation('uninstall', input).status).toBe('already-absent')
        expect(() =>
          installLocations('gemini', {
            ...context,
            scope: 'user',
            env: { GEMINI_CLI_HOME: 'relative-home' },
          }),
        ).toThrow('absolute')
      })
    },
    30000,
  )
  it('builds a complete relocated extension and diagnoses it without requiring Gemini for default tier-A checks', () => {
    fixture((dir) => {
      const root = join(dir, 'repository')
      const home = join(dir, 'home')
      mkdirSync(root)
      mkdirSync(home)
      const binary = resolve('dist/wl.mjs')
      const original = join(dir, 'original extension')
      const output = join(dir, "relocated extension ' # root")
      const generated = generateAdapter(
        'gemini',
        bundledCanonical(),
        readFileSync(binary, 'utf8'),
        '0.0.0',
      )
      writeAdapter(original, generated)
      renameSync(original, output)
      const launcher = join(output, 'skills/wl-next/scripts/wl.mjs')
      const result = spawnSync(process.execPath, [launcher, 'adapter', 'root', '--json'], {
        cwd: root,
        encoding: 'utf8',
        timeout: 15000,
      })
      expect(result.status, result.stderr).toBe(0)
      expect(JSON.parse(result.stdout).target).toBe('gemini')
      const report = doctor({
        root,
        home,
        store: join(dir, 'state'),
        targets: ['gemini'],
        artifact: { path: output, target: 'gemini', expected: generated },
        probe: () => ({ status: 'observed', version: '2.49.0' }),
      })
      expect(report.checks.find((check) => check.id === 'cli.gemini')?.status).toBe('pass')
      expect(report.checks.find((check) => check.id === 'artifacts')?.status).toBe('pass')
      const defaultReport = doctor({
        root,
        home,
        store: join(dir, 'state'),
        probe: () => ({ status: 'observed', version: '2.49.0' }),
      })
      expect(defaultReport.checks.some((check) => check.id === 'cli.gemini')).toBe(false)
      const dry = spawnSync(
        process.execPath,
        [binary, 'build', '--target', 'gemini', '--out', join(dir, 'dry'), '--dry-run', '--json'],
        { cwd: root, encoding: 'utf8', timeout: 15000, maxBuffer: 1048576 },
      )
      expect(dry.status, dry.stderr).toBe(0)
      expect(existsSync(join(dir, 'dry'))).toBe(false)
      expect(JSON.parse(dry.stdout).manifest.target).toBe('gemini')
    })
  }, 30000)
})
