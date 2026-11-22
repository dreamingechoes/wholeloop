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
import { delimiter, dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bundledCanonical } from '../../../src/adapters/canonical.js'
import { cursorHook } from '../../../src/adapters/cursor-hook.js'
import { artifactDigest, generateAdapter } from '../../../src/adapters/generate.js'
import { writeAdapter } from '../../../src/adapters/write.js'
import type { PreparedConformance } from '../../../src/conformance/contracts.js'
import { conformanceRecipe } from '../../../src/conformance/recipes.js'
import { doctor } from '../../../src/diagnostics/doctor.js'
import { normalizeTool } from '../../../src/guards/normalize.js'
import { lineCount } from '../../../src/harness/files.js'
import { frontmatter } from '../../../src/harness/frontmatter.js'
import { inspectInstallation } from '../../../src/installation/inspect.js'
import { manageInstallation } from '../../../src/installation/manage.js'
import { installLocations, sharedLauncher } from '../../../src/installation/plan.js'
import { canonicalPath } from '../../../src/state/paths.js'
import { VERSION } from '../../../src/version.js'

// Golden trees are snapshots of a fixed version; renders that run the core
// use the package VERSION, which the core checks at launch.
const GOLDEN_VERSION = '0.0.0'

const minimal = new Map([
  [
    'harness/skills/next/SKILL.md',
    '---\nname: next\ndescription: Continue fixture work.\n---\n# Next\n\nRun wl next --json.\n',
  ],
  [
    'harness/agents/reviewer.md',
    '---\nname: reviewer\ndescription: Observe assigned evidence.\nmetadata:\n  wholeloop.capabilities: read shell web\n  wholeloop.tier: deep\n---\n# Review\n\nReport observed evidence without mutation.\n',
  ],
])
const core = () => readFileSync(resolve('dist/wl.mjs'), 'utf8')
function fixture(run: (dir: string) => void) {
  const dir = canonicalPath(mkdtempSync(join(tmpdir(), 'wl-cursor-')))
  try {
    run(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
function execute(
  command: string,
  root: string,
  home: string,
  input: unknown,
  overrides: NodeJS.ProcessEnv = {},
) {
  const result = spawnSync('/bin/sh', ['-c', command], {
    cwd: root,
    env: {
      ...process.env,
      HOME: home,
      XDG_STATE_HOME: join(home, 'state'),
      XDG_CONFIG_HOME: join(home, 'config'),
      CURSOR_PROJECT_DIR: root,
      PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ''}`,
      ...overrides,
    },
    input: JSON.stringify(input),
    encoding: 'utf8',
    timeout: 12000,
  })
  expect(result.status, result.stderr).toBe(0)
  expect(result.stdout).not.toContain('PRIVATE_BODY')
  return JSON.parse(result.stdout)
}
const payload = (root: string, tool_name: string, tool_input: object = {}) => ({
  hook_event_name: 'preToolUse',
  cwd: root,
  cursor_version: '2026.07.16-899851b',
  workspace_roots: [root],
  tool_name,
  tool_input,
})

describe('Cursor native contracts and managed overlays', () => {
  it('matches its dual manifests, readonly roles, opt-in rule and hook golden', () => {
    const generated = generateAdapter('cursor', minimal, '#!/usr/bin/env node\n', GOLDEN_VERSION)
    expect(Object.fromEntries(generated.files)).toMatchSnapshot()
    expect(
      JSON.parse(generated.files.get('.cursor-plugin/plugin.json')?.content ?? '{}'),
    ).toMatchObject({
      name: 'wholeloop',
      agents: './agents',
      rules: './rules',
      hooks: './hooks/hooks.json',
    })
    expect(JSON.parse(generated.files.get('plugin.json')?.content ?? '{}')).toEqual({
      name: 'wholeloop',
      version: GOLDEN_VERSION,
      description: expect.any(String),
      $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
    })
    expect(frontmatter(generated.files.get('rules/wholeloop.mdc')?.content ?? '')).toMatchObject({
      alwaysApply: false,
    })
    const complete = generateAdapter('cursor', bundledCanonical(), core(), VERSION)
    expect(complete.manifest.skills).toHaveLength(17)
    expect(complete.manifest.agents).toHaveLength(9)
    for (const [path, file] of complete.files) {
      if (path.endsWith('SKILL.md')) expect(lineCount(file.content), path).toBeLessThanOrEqual(120)
      if (!path.startsWith('agents/')) continue
      const header = frontmatter(file.content)
      expect(Object.keys(header ?? {}).sort()).toEqual([
        'description',
        'is_background',
        'model',
        'name',
        'readonly',
      ])
      expect(header).toMatchObject({
        model: 'inherit',
        is_background: false,
        readonly: !/wl-(builder|conductor)\.md$/.test(path),
      })
      expect(lineCount(file.content), path).toBeLessThanOrEqual(60)
    }
    const changed = new Map(minimal)
    changed.set(
      'harness/skills/next/SKILL.md',
      `${minimal.get('harness/skills/next/SKILL.md')}\nPreserve the current owner.\n`,
    )
    const updated = generateAdapter('cursor', changed, '#!/usr/bin/env node\n', VERSION)
    expect(updated.manifest.source).not.toBe(generated.manifest.source)
    expect(updated.files.get('skills/wl-next/SKILL.md')?.content).toContain(
      'Preserve the current owner.',
    )
  })
  it.each(['user', 'project'] as const)(
    'round-trips %s files and native guard responses without rewriting personal rules',
    (scope) =>
      fixture((dir) => {
        const root = join(dir, "repo ' # path")
        const home = join(dir, "home ' # path")
        mkdirSync(root)
        mkdirSync(home)
        expect(spawnSync('git', ['init'], { cwd: root, encoding: 'utf8' }).status).toBe(0)
        const context = { root, home, store: join(dir, 'store'), scope, env: {} }
        const locations = installLocations('cursor', context)
        if (!locations.rules || !locations.hooks) throw new Error('Missing native layout')
        mkdirSync(locations.rules, { recursive: true })
        const personal = join(locations.rules, 'team.mdc')
        writeFileSync(personal, '# Personal fixture rule\n')
        const input = {
          context,
          targets: ['cursor'],
          canonical: minimal,
          core: core(),
          version: VERSION,
        }
        const installed = manageInstallation('install', input)
        expect(inspectInstallation(input).status).toBe('current')
        expect(manageInstallation('install', input).status).toBe('already-correct')
        expect(existsSync(join(locations.rules, 'wl-wholeloop.mdc'))).toBe(true)
        expect(
          frontmatter(readFileSync(join(locations.agents, 'wl-reviewer.md'), 'utf8'))?.readonly,
        ).toBe(true)
        const launcher =
          sharedLauncher('cursor', context) ?? join(locations.skills, 'wl-next/scripts/wl.mjs')
        const launched = spawnSync(process.execPath, [launcher, 'adapter', 'root', '--json'], {
          cwd: root,
          encoding: 'utf8',
          timeout: 10000,
        })
        expect(launched.status, launched.stderr).toBe(0)
        expect(JSON.parse(launched.stdout)).toMatchObject({
          target: 'cursor',
          root: installed.artifacts[0],
        })
        const hook = JSON.parse(readFileSync(join(locations.hooks, 'hooks.json'), 'utf8')).hooks
          .preToolUse[0]
        expect(hook).toMatchObject({ failClosed: true, timeout: 15 })
        expect(
          execute(
            hook.command,
            root,
            home,
            payload(root, 'Read', { path: join(root, 'README.md') }),
          ),
        ).toEqual({})
        for (const tool of ['Write', 'Delete'])
          expect(
            execute(
              hook.command,
              root,
              home,
              payload(root, tool, {
                path: join(root, '.wholeloop/state/private.json'),
                contents: 'PRIVATE_BODY',
              }),
            ),
          ).toMatchObject({
            permission: 'deny',
            user_message: expect.stringContaining('runtime artifacts'),
          })
        expect(
          execute(
            hook.command,
            root,
            home,
            payload(root, 'Shell', { command: 'git push origin main', working_directory: root }),
          ).permission,
        ).toBe('deny')
        expect(
          execute(hook.command, root, home, { ...payload(root, 'Read'), workspace_roots: [] })
            .permission,
        ).toBe('deny')
        // Cursor 2026.11 sends an empty cwd for Shell: one root supplies it, two roots deny.
        expect(
          execute(hook.command, root, home, {
            ...payload(root, 'Shell', { command: 'git status' }),
            cwd: '',
          }),
        ).toEqual({})
        expect(
          execute(hook.command, root, home, {
            ...payload(root, 'Shell', { command: 'git push origin main' }),
            cwd: '',
          }).permission,
        ).toBe('deny')
        expect(
          execute(hook.command, root, home, {
            ...payload(root, 'Shell', { command: 'git status' }),
            cwd: '',
            workspace_roots: [root, home],
          }).permission,
        ).toBe('deny')
        expect(manageInstallation('uninstall', input).status).toBe('uninstalled')
        expect(readFileSync(personal, 'utf8')).toBe('# Personal fixture rule\n')
        expect(readdirSync(locations.rules)).toEqual(['team.mdc'])
        expect(manageInstallation('uninstall', input).status).toBe('already-absent')
      }),
  )
  it('refuses a shared unowned hook before writing any selected target', () =>
    fixture((dir) => {
      const root = join(dir, 'repo')
      const home = join(dir, 'home')
      mkdirSync(join(root, '.cursor'), { recursive: true })
      mkdirSync(home)
      const shared = join(root, '.cursor/hooks.json')
      writeFileSync(shared, '{"personal":true}\n')
      const input = {
        context: { root, home, store: join(dir, 'store'), scope: 'project' as const, env: {} },
        targets: ['codex', 'cursor'],
        canonical: minimal,
        core: core(),
        version: VERSION,
      }
      expect(() => manageInstallation('install', input)).toThrow()
      expect(readFileSync(shared, 'utf8')).toBe('{"personal":true}\n')
      expect(existsSync(join(root, '.agents/skills'))).toBe(false)
    }))
  it('pins a relocated standalone plugin through explicit root data and denies unavailable context', () =>
    fixture((dir) => {
      const root = join(dir, 'repo')
      const home = join(dir, 'home')
      const original = join(dir, 'original')
      const relocated = join(dir, "plugin ' # $(touch PWNED)")
      mkdirSync(root)
      mkdirSync(home)
      writeAdapter(original, generateAdapter('cursor', minimal, core(), VERSION))
      renameSync(original, relocated)
      const hook = JSON.parse(readFileSync(join(relocated, 'hooks/hooks.json'), 'utf8')).hooks
        .preToolUse[0]
      expect(hook.command).not.toContain(`\${CURSOR_PLUGIN_ROOT}`)
      const input = payload(root, 'Read', { path: join(root, 'README.md') })
      expect(execute(hook.command, root, home, input, { CURSOR_PLUGIN_ROOT: relocated })).toEqual(
        {},
      )
      expect(
        execute(hook.command, root, home, input, { CURSOR_PLUGIN_ROOT: undefined }).permission,
      ).toBe('deny')
      expect(
        execute(hook.command, root, home, input, { CURSOR_PLUGIN_ROOT: relocated, PATH: '' })
          .permission,
      ).toBe('deny')
      writeFileSync(join(relocated, 'bin/wl.mjs'), '#!/usr/bin/env node\n')
      expect(
        execute(hook.command, root, home, input, { CURSOR_PLUGIN_ROOT: relocated }).permission,
      ).toBe('deny')
      expect(existsSync(join(root, 'PWNED'))).toBe(false)
    }))
  it('relocates a project hook using native project-root data instead of an old absolute path', () =>
    fixture((dir) => {
      const original = join(dir, 'original')
      const moved = join(dir, "moved ' # project")
      const home = join(dir, 'home')
      mkdirSync(original)
      mkdirSync(home)
      const binary = core()
      writeAdapter(
        join(original, '.wholeloop/distribution/cursor'),
        generateAdapter('cursor', minimal, binary, VERSION),
      )
      const hook = cursorHook(artifactDigest(binary), { kind: 'project' }).hooks.preToolUse[0]
      if (!hook) throw new Error('Missing native hook')
      renameSync(original, moved)
      expect(execute(hook.command, moved, home, payload(moved, 'Read'))).toEqual({})
    }))
  it('normalizes the native shell directory and delete destination without alias ambiguity', () => {
    expect(
      normalizeTool(
        payload('/workspace', 'Shell', {
          command: 'git push origin main',
          working_directory: 'nested',
          cwd: '/ignored',
          workdir: '/ignored',
        }),
        '/workspace',
      ).cwd,
    ).toBe('/workspace/nested')
    expect(
      normalizeTool(payload('/workspace', 'Delete', { path: 'file.txt' }), '/workspace'),
    ).toMatchObject({ kind: 'write', paths: ['/workspace/file.txt'] })
    expect(() =>
      normalizeTool(
        { ...payload('/workspace', 'Read'), workspace_roots: ['relative'] },
        '/workspace',
      ),
    ).toThrow('workspace roots')
  })
  it('selects the actual agent executable and a fresh stdin sandbox recipe', () =>
    fixture((dir) => {
      expect(
        conformanceRecipe({
          target: 'cursor',
          root: dir,
          state: join(dir, 'state'),
        } as PreparedConformance),
      ).toEqual({
        command: 'agent',
        cwd: dir,
        args: [
          '--print',
          '--trust',
          '--output-format',
          'json',
          '--sandbox',
          'enabled',
          '--workspace',
          dir,
          '--add-dir',
          join(dir, 'state'),
        ],
      })
      const calls: string[] = []
      doctor({
        root: dir,
        home: join(dir, 'home'),
        store: join(dir, 'store'),
        targets: ['cursor'],
        env: {},
        probe: (binary) => {
          calls.push(binary)
          return { status: 'observed', version: '2026.07.16-899851b' }
        },
      })
      expect(calls).toContain('agent')
      expect(calls).not.toContain('cursor')
    }))
})
