import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bundledCanonical } from '../../../src/adapters/canonical.js'
import { generateAdapter } from '../../../src/adapters/generate.js'
import { writeAdapter } from '../../../src/adapters/write.js'
import type { PreparedConformance, Scenario } from '../../../src/conformance/contracts.js'
import { conformanceInput, conformanceRecipe } from '../../../src/conformance/recipes.js'
import { doctor } from '../../../src/diagnostics/doctor.js'
import { normalizeTool } from '../../../src/guards/normalize.js'
import { lineCount } from '../../../src/harness/files.js'
import { frontmatter } from '../../../src/harness/frontmatter.js'
import { inspectInstallation } from '../../../src/installation/inspect.js'
import { manageInstallation } from '../../../src/installation/manage.js'
import { installLocations } from '../../../src/installation/plan.js'
import { canonicalPath } from '../../../src/state/paths.js'

const minimal = new Map([
  [
    'harness/skills/next/SKILL.md',
    '---\nname: next\ndescription: Continue fixture work.\n---\n# Next\n\nCall wl next --json.\n',
  ],
  [
    'harness/agents/reviewer.md',
    '---\nname: reviewer\ndescription: Observe assigned evidence.\nmetadata:\n  wholeloop.capabilities: read shell web\n  wholeloop.tier: deep\n---\n# Review\n\nReport observed evidence.\n',
  ],
])
const core = () => readFileSync(resolve('dist/wl.mjs'), 'utf8')
function fixture(operation: (dir: string) => void) {
  const dir = canonicalPath(mkdtempSync(join(tmpdir(), 'wl-agy-')))
  try {
    operation(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
const command = (path: string) =>
  JSON.parse(readFileSync(path, 'utf8'))['wholeloop-guard'].PreToolUse[0].hooks[0].command as string
function hook(path: string, root: string, home: string, payload: unknown) {
  const result = spawnSync('/bin/sh', ['-c', command(path)], {
    cwd: root,
    env: {
      ...process.env,
      HOME: home,
      XDG_STATE_HOME: join(home, 'state'),
      XDG_CONFIG_HOME: join(home, 'config'),
    },
    input: JSON.stringify(payload),
    encoding: 'utf8',
    timeout: 15000,
  })
  expect(result.status, result.stderr).toBe(0)
  expect(result.stderr).toBe('')
  return JSON.parse(result.stdout)
}

describe('Antigravity native adapter and transport', () => {
  it('renders a closed plugin manifest, strict observer tools and stable native golden', () => {
    const generated = generateAdapter('antigravity', minimal, '#!/usr/bin/env node\n', '0.0.0')
    expect(Object.fromEntries(generated.files)).toMatchSnapshot()
    expect(JSON.parse(generated.files.get('plugin.json')?.content ?? '{}')).toEqual({
      name: 'wholeloop',
      description: expect.any(String),
    })
    const complete = generateAdapter('antigravity', bundledCanonical(), core(), '0.0.0')
    expect(complete.manifest.skills).toHaveLength(17)
    expect(complete.manifest.agents).toHaveLength(9)
    for (const [path, file] of complete.files) {
      if (path.endsWith('SKILL.md')) {
        expect(lineCount(file.content), path).toBeLessThanOrEqual(120)
        expect(frontmatter(file.content)?.name).toBe(path.split('/')[1])
      }
      if (!path.startsWith('agents/')) continue
      expect(lineCount(file.content), path).toBeLessThanOrEqual(60)
      const header = frontmatter(file.content)
      expect(Object.keys(header ?? {}).sort()).toEqual([
        'commandExecutionPolicy',
        'description',
        'mainAgent',
        'model',
        'name',
        'subagent',
        'tools',
      ])
      expect(header).toMatchObject({ mainAgent: false, subagent: true, model: 'inherit' })
      if (!/wl-agy-(builder|conductor)\.md$/.test(path)) {
        expect(header?.commandExecutionPolicy).toBe('off')
        expect(header?.tools).not.toEqual(expect.arrayContaining(['run_command']))
        expect(header?.tools).not.toEqual(expect.arrayContaining(['write_to_file']))
      }
      expect(file.content).toContain('sequential main-session handoff')
    }
  })
  it.each(['user', 'project'] as const)(
    'round-trips %s ownership, namespaced coexistence and actual guarded core',
    (scope) =>
      fixture((dir) => {
        const root = join(dir, "repository ' # root")
        const home = join(dir, "home ' # path")
        mkdirSync(root)
        mkdirSync(home)
        expect(spawnSync('git', ['init'], { cwd: root, encoding: 'utf8' }).status).toBe(0)
        const context = { root, home, store: join(dir, 'store'), scope, env: {} }
        const input = {
          context,
          targets: ['codex', 'antigravity'],
          canonical: minimal,
          core: core(),
          version: '0.0.0',
        }
        const installed = manageInstallation('install', input)
        const locations = installLocations('antigravity', context)
        expect(existsSync(join(locations.skills, 'wl-agy-next/SKILL.md'))).toBe(true)
        expect(
          existsSync(join(installLocations('codex', context).skills, 'wl-next/SKILL.md')),
        ).toBe(true)
        const launcher = join(locations.skills, 'wl-agy-next/scripts/wl.mjs')
        const launched = spawnSync(process.execPath, [launcher, 'adapter', 'root', '--json'], {
          cwd: root,
          encoding: 'utf8',
          timeout: 15000,
        })
        expect(launched.status, launched.stderr).toBe(0)
        expect(JSON.parse(launched.stdout).target).toBe('antigravity')
        const path = join(locations.hooks ?? '', 'hooks.json')
        const payload = (name: string, args: object, workspacePaths = [root]) => ({
          toolCall: { name, args },
          workspacePaths,
        })
        expect(
          hook(path, root, home, payload('view_file', { AbsolutePath: join(root, 'README.md') })),
        ).toEqual({ decision: 'allow' })
        expect(
          hook(
            path,
            root,
            home,
            payload('write_to_file', {
              TargetFile: join(root, '.wholeloop/state/private.json'),
              CodeContent: 'PRIVATE_BODY',
            }),
          ),
        ).toMatchObject({ decision: 'deny', reason: expect.stringContaining('runtime artifacts') })
        expect(
          hook(
            path,
            root,
            home,
            payload('run_command', { Cwd: root, CommandLine: 'git push origin main' }),
          ).decision,
        ).toBe('deny')
        expect(
          hook(path, root, home, payload('view_file', { AbsolutePath: 'relative' })).decision,
        ).toBe('deny')
        expect(hook(path, root, home, payload('view_file', {}, [root, home])).decision).toBe('deny')
        expect(hook(path, root, home, { private: 'PRIVATE_BODY' }).reason).not.toContain(
          'PRIVATE_BODY',
        )
        expect(
          hook(
            path,
            root,
            home,
            payload('write_to_file', { TargetFile: join(dir, 'external-draft.md') }),
          ),
        ).toEqual({ decision: 'allow' })
        expect(inspectInstallation({ ...input, targets: ['antigravity'] }).status).toBe('current')
        expect(manageInstallation('install', input).status).toBe('already-correct')
        if (locations.plugin) {
          const unknown = join(locations.plugin, 'personal.txt')
          writeFileSync(unknown, 'Preserve this unowned fixture.')
          expect(() => manageInstallation('install', input)).toThrow('Unowned')
          expect(() => manageInstallation('uninstall', input)).toThrow('Unowned')
          expect(readFileSync(unknown, 'utf8')).toBe('Preserve this unowned fixture.')
          unlinkSync(unknown)
        }
        const artifact = installed.artifacts.find((path) => path.endsWith('/antigravity'))
        if (!artifact) throw new Error('Missing artifact')
        writeFileSync(join(artifact, 'bin/wl.mjs'), '#!/usr/bin/env node\n')
        expect(
          hook(path, root, home, payload('view_file', { AbsolutePath: join(root, 'README.md') }))
            .decision,
        ).toBe('deny')
        // Restore the exact owned bytes before exercising receipt-based removal.
        writeFileSync(join(artifact, 'bin/wl.mjs'), input.core)
        expect(manageInstallation('uninstall', input).status).toBe('uninstalled')
        expect(readdirSync(home)).toEqual([])
      }),
    30000,
  )
  it('refuses an existing shared project hook before installing any requested client', () =>
    fixture((dir) => {
      const root = join(dir, 'repo')
      const home = join(dir, 'home')
      mkdirSync(join(root, '.agents'), { recursive: true })
      mkdirSync(home)
      const path = join(root, '.agents/hooks.json')
      writeFileSync(path, '{"personal":{}}\n')
      const input = {
        context: { root, home, store: join(dir, 'store'), scope: 'project' as const, env: {} },
        targets: ['codex', 'antigravity'],
        canonical: minimal,
        core: core(),
        version: '0.0.0',
      }
      expect(() => manageInstallation('install', input)).toThrow()
      expect(readFileSync(path, 'utf8')).toBe('{"personal":{}}\n')
      expect(existsSync(join(root, '.agents/skills'))).toBe(false)
    }))
  it('runs a relocated standalone plugin hook at the documented native user root', () =>
    fixture((dir) => {
      const root = join(dir, 'repo')
      const home = join(dir, 'home')
      mkdirSync(root)
      mkdirSync(home)
      const original = join(dir, 'original')
      const native = join(home, '.gemini/antigravity-cli/plugins/wholeloop')
      writeAdapter(original, generateAdapter('antigravity', minimal, core(), '0.0.0'))
      mkdirSync(join(native, '..'), { recursive: true })
      renameSync(original, native)
      expect(
        hook(join(native, 'hooks.json'), root, home, {
          toolCall: { name: 'view_file', args: { AbsolutePath: join(root, 'README.md') } },
          workspacePaths: [root],
        }),
      ).toEqual({ decision: 'allow' })
    }))
  it('normalizes documented native targets and refuses missing or relative workspace context', () => {
    for (const [name, key, kind] of [
      ['run_command', 'Cwd', 'shell'],
      ['write_to_file', 'TargetFile', 'write'],
      ['replace_file_content', 'TargetFile', 'write'],
      ['multi_replace_file_content', 'TargetFile', 'write'],
      ['view_file', 'AbsolutePath', 'read'],
      ['list_dir', 'DirectoryPath', 'read'],
      ['find_by_name', 'SearchDirectory', 'read'],
      ['grep_search', 'SearchPath', 'read'],
    ]) {
      const result = normalizeTool(
        {
          toolCall: {
            name,
            args: { [key ?? '']: '/workspace/project/file', CommandLine: 'npm test' },
          },
          workspacePaths: ['/workspace/project'],
        },
        '/workspace/project',
      )
      expect(result.kind).toBe(kind)
      if (kind === 'write') expect(result.paths).toEqual(['/workspace/project/file'])
    }
    expect(() =>
      normalizeTool(
        {
          toolCall: { name: 'run_command', args: { Cwd: 'relative', CommandLine: 'PRIVATE' } },
          workspacePaths: ['/workspace/project'],
        },
        '/workspace/project',
      ),
    ).toThrow('absolute')
  })
  it('uses the agy executable, JSONL user event and explicit doctor selection', () =>
    fixture((dir) => {
      const run = {
        target: 'antigravity',
        root: dir,
        skill: join(dir, 'wl-agy-frame-problem/SKILL.md'),
        launcher: join(dir, 'wl.mjs'),
        artifact: join(dir, 'draft.md'),
        state: join(dir, 'state'),
      } as PreparedConformance
      const scenario = {
        input: 'Synthetic idea',
        owner: 'FixtureOwner',
        facts: [],
      } as unknown as Scenario
      expect(conformanceRecipe(run)).toEqual({
        command: 'agy',
        cwd: dir,
        args: ['--input-format', 'stream-json', '--output-format', 'stream-json'],
      })
      expect(JSON.parse(conformanceInput(run, scenario))).toMatchObject({
        event: 'user',
        message: { content: expect.stringContaining('wl-agy-frame-problem') },
      })
      const calls: string[] = []
      doctor({
        root: dir,
        home: join(dir, 'home'),
        store: join(dir, 'store'),
        targets: ['antigravity'],
        env: {},
        probe: (binary) => {
          calls.push(binary)
          return { status: 'observed', version: '1.4.2' }
        },
      })
      expect(calls).toContain('agy')
      expect(calls).not.toContain('antigravity')
    }))
})
