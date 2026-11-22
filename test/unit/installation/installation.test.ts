import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { bundledCanonical } from '../../../src/adapters/canonical.js'
import { artifactDigest } from '../../../src/adapters/generate.js'
import invocationSchema from '../../../src/cli/schemas/adapter-invocation-v1.json' with {
  type: 'json',
}
import { validate } from '../../../src/config/schema.js'
import { doctor } from '../../../src/diagnostics/doctor.js'
import { frontmatter } from '../../../src/harness/frontmatter.js'
import {
  INSTALL_RECEIPT_BYTES,
  metadata,
  type Receipt,
  TARGETS,
} from '../../../src/installation/contracts.js'
import { inspectInstallation } from '../../../src/installation/inspect.js'
import { type InstallInput, manageInstallation } from '../../../src/installation/manage.js'
import {
  type InstallContext,
  installationPlan,
  installedName,
  installLocations,
} from '../../../src/installation/plan.js'
import { installationScope, readReceipt, saveReceipt } from '../../../src/installation/receipts.js'
import { VERSION } from '../../../src/version.js'

const targets = ['claude', 'codex', 'opencode', 'copilot']
const currentCore = () => readFileSync(resolve('dist/wl.mjs'), 'utf8')
function tree(root: string): unknown[] {
  if (!existsSync(root)) return []
  return readdirSync(root)
    .sort()
    .flatMap((name) => {
      const path = join(root, name)
      const stat = lstatSync(path)
      return stat.isDirectory()
        ? [[name, 'directory'], ...tree(path).map((entry) => [name, entry])]
        : [[name, stat.mode & 0o777, artifactDigest(readFileSync(path, 'utf8'))]]
    })
}
function fixture(
  run: (context: {
    dir: string
    context: InstallContext
    env: NodeJS.ProcessEnv
    input: (selected?: string[], scope?: 'user' | 'project', full?: boolean) => InstallInput
  }) => void,
) {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-install-'))
  const root = join(dir, 'project with spaces')
  const home = join(dir, 'home')
  mkdirSync(root)
  mkdirSync(home)
  const env = {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: join(home, '.config'),
    XDG_STATE_HOME: join(dir, 'state'),
    CODEX_HOME: join(home, '.codex'),
    CLAUDE_CONFIG_DIR: join(home, '.claude'),
    OPENCODE_CONFIG_DIR: join(home, '.config/opencode'),
    COPILOT_HOME: join(home, '.copilot'),
    GEMINI_CLI_HOME: home,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: join(dir, 'no-global-config'),
  }
  const context: InstallContext = {
    root,
    home,
    store: join(dir, 'state/wholeloop'),
    scope: 'user',
    env,
  }
  const initialized = spawnSync('git', ['-c', 'init.templateDir=', 'init', '-b', 'main'], {
    cwd: root,
    env,
    encoding: 'utf8',
  })
  if (initialized.status !== 0) throw new Error('Fixture Git init failed')
  writeFileSync(join(root, 'README.md'), '# Fixture project\n')
  const input = (
    selected = targets,
    scope: 'user' | 'project' = 'user',
    full = false,
  ): InstallInput => ({
    context: { ...context, scope },
    targets: selected,
    // Ownership edge cases need a small authored tree; full catalogs are exercised separately.
    canonical: new Map(
      [...bundledCanonical()].filter(
        ([path]) =>
          full ||
          [
            'harness/skills/next/SKILL.md',
            'harness/skills/frame-problem/SKILL.md',
            'harness/agents/builder.md',
            'harness/agents/conductor.md',
            'harness/protocols/core-invariants.md',
            'harness/protocols/guards.md',
          ].includes(path),
      ),
    ),
    core: currentCore(),
    version: VERSION,
  })
  try {
    run({ dir, context, env, input })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
function installed(input: InstallInput) {
  const result = manageInstallation('install', input)
  if (!('artifacts' in result)) throw new Error('Expected artifact paths')
  return result
}

describe('owned native installation and retained external history', () => {
  it('retains a complete seven-client recovery catalog while bounding receipt reads and writes', () =>
    fixture(({ context }) => {
      const scope = installationScope(context)
      const components = TARGETS.map((target) =>
        metadata(
          installationPlan(
            target,
            scope.context,
            scope.artifact(target),
            bundledCanonical(),
            currentCore(),
            VERSION,
          ),
        ),
      )
      const receipt: Receipt = {
        schema: 'wholeloop/install-receipt@1',
        identity: scope.identity,
        scope: 'user',
        components,
        directories: [],
        pending: {
          kind: 'install',
          targets: [...TARGETS],
          before: components,
          after: components,
          backup: 'backups/00000000-0000-0000-0000-000000000000',
        },
      }
      saveReceipt(scope.control, scope.receiptPath, receipt)
      const saved = scope.control.read(scope.receiptPath) ?? ''
      expect(Buffer.byteLength(saved)).toBeGreaterThan(1024 * 1024)
      expect(
        readReceipt(
          scope.control,
          scope.receiptPath,
          scope.context,
          scope.identity,
          scope.artifact,
        ),
      ).toEqual(receipt)
      expect(() =>
        saveReceipt(scope.control, scope.receiptPath, {
          ...receipt,
          directories: ['x'.repeat(INSTALL_RECEIPT_BYTES)],
        }),
      ).toThrow('bounded receipt budget')
      expect(scope.control.read(scope.receiptPath)).toBe(saved)
      scope.control.atomic('oversized.json', ' '.repeat(INSTALL_RECEIPT_BYTES + 1))
      expect(() =>
        readReceipt(scope.control, 'oversized.json', scope.context, scope.identity, scope.artifact),
      ).toThrow('Unsafe installation receipt')
    }))
  it.each(['user', 'project'] as const)(
    'round-trips all four targets at %s scope without touching existing settings',
    (scope) =>
      fixture(({ context, input }) => {
        mkdirSync(join(context.home, '.claude'), { recursive: true })
        writeFileSync(join(context.home, '.claude/settings.json'), '{}\n')
        const beforeHome = tree(context.home)
        const beforeProject = tree(context.root)
        const result = installed(input(targets, scope, true))
        expect(result.status).toBe('installed')
        expect(result.conformance).toBe('unverified')
        expect(result.authenticated).toBe(false)
        expect(installed(input(targets, scope, true)).status).toBe('already-correct')
        for (const target of targets) {
          const locations = installLocations(target, { ...context, scope })
          expect(existsSync(join(locations.skills, 'wl-next/SKILL.md'))).toBe(true)
          expect(
            readdirSync(locations.skills).filter((name) => name.startsWith('wl-')),
          ).toHaveLength(17)
          expect(
            readdirSync(locations.agents).filter((name) => name.startsWith('wl-')),
          ).toHaveLength(target === 'codex' ? 8 : 9)
        }
        expect(manageInstallation('uninstall', input(targets, scope, true)).status).toBe(
          'uninstalled',
        )
        expect(tree(context.home)).toEqual(beforeHome)
        expect(tree(context.root)).toEqual(beforeProject)
        expect(manageInstallation('uninstall', input(targets, scope, true)).status).toBe(
          'already-absent',
        )
        expect(existsSync(context.store)).toBe(true)
      }),
    30000,
  )
  it(
    'shares directory ownership across separate target installs and removes only the last empty parents',
    () =>
      fixture(({ context, input }) => {
        const before = tree(context.home)
        installed(input(['claude']))
        installed(input(['codex']))
        manageInstallation('uninstall', input(['claude']))
        expect(existsSync(join(context.home, '.codex/agents/wl-builder.toml'))).toBe(true)
        manageInstallation('uninstall', input(['codex']))
        expect(tree(context.home)).toEqual(before)
      }),
    15000,
  )
  it('dry-runs the same complete plan without creating native files, locks or runtime receipts', () =>
    fixture(({ context, input }) => {
      const baseline = tree(context.home)
      const result = manageInstallation('install', { ...input(['codex']), dryRun: true })
      expect(result.status).toBe('planned')
      expect(result.files?.some((path) => path.endsWith('SKILL.md'))).toBe(true)
      expect(tree(context.home)).toEqual(baseline)
      expect(existsSync(context.store)).toBe(false)
      installed(input(['codex']))
      const before = tree(context.home)
      expect(manageInstallation('uninstall', { ...input(['codex']), dryRun: true }).status).toBe(
        'planned',
      )
      expect(tree(context.home)).toEqual(before)
    }))
  it(
    'inspects managed currentness without writes and exposes scoped diagnosis through doctor',
    () =>
      fixture(({ context, input }) => {
        const selected = input(['codex'])
        expect(inspectInstallation(selected).status).toBe('absent')
        expect(existsSync(context.store)).toBe(false)
        const result = installed(selected)
        const baseline = tree(context.store)
        expect(inspectInstallation(selected).status).toBe('current')
        expect(tree(context.store)).toEqual(baseline)
        const managed = {
          canonical: selected.canonical,
          core: selected.core,
          version: selected.version,
        }
        const report = (override: Partial<typeof managed> = {}) =>
          doctor({
            root: context.root,
            home: context.home,
            store: context.store,
            userFile: join(context.home, '.config/wholeloop/config.yml'),
            env: context.env ?? {},
            targets: ['codex'],
            probe: (binary) => ({
              status: 'observed',
              version: binary === 'git' ? '2.49.0' : '1.2.3',
            }),
            managed: { ...managed, ...override },
          })
        expect(report().checks.find((check) => check.id === 'installation.user')?.status).toBe(
          'pass',
        )
        const future = `${selected.core}\n// Future runtime.\n`
        expect(inspectInstallation({ ...selected, core: future })).toMatchObject({
          status: 'stale',
          installed: [selected.version],
        })
        // Untouched but outdated files are named as such, with the plain install as the repair.
        const upgraded = report({ core: future, version: '9.9.9' }).checks.find(
          (check) => check.id === 'installation.user',
        )
        expect(upgraded).toMatchObject({ status: 'fail', version: selected.version })
        expect(upgraded?.summary).toBe(
          `Owned installation was written by wholeloop ${selected.version}, and this is 9.9.9; none of its files were edited, so updating it is safe.`,
        )
        expect(upgraded?.repair?.command.slice(0, 2)).toEqual(['wl', 'install'])
        expect(upgraded?.repair?.command).not.toContain('--dry-run')
        expect(
          report({ core: future }).checks.find((check) => check.id === 'installation.user')
            ?.summary,
        ).toContain(`a different build of wholeloop ${selected.version};`)
        const receipt = JSON.parse(readFileSync(result.receipt, 'utf8'))
        const file = receipt.components[0].files[0]
        writeFileSync(file.path, 'Edited generated file\n')
        expect(inspectInstallation(selected)).toMatchObject({
          status: 'changed',
          changed: [{ path: file.path, state: 'edited' }],
        })
        const changed = report().checks.find((check) => check.id === 'installation.user')
        expect(changed?.status).toBe('fail')
        // The repair names the edited file and confirms with an install dry run.
        expect(changed?.repair?.instruction).toContain(`${file.path} (edited)`)
        expect(changed?.repair?.command.slice(0, 2)).toEqual(['wl', 'install'])
        expect(changed?.repair?.command).toContain('--dry-run')
        expect(report().authenticated).toBe(false)
      }),
    15000,
  )
  it('names a backup only when one was written and a hook repository only at project scope', () =>
    fixture(({ context, input }) => {
      const first = installed(input(['codex']))
      expect(first).not.toHaveProperty('backup')
      expect(first.activation?.command).toContain('<repository>')
      expect(first.activation?.command).not.toContain(realpathSync(context.root))
      const removed = manageInstallation('uninstall', input(['codex']))
      expect(typeof removed.backup === 'string' && existsSync(removed.backup)).toBe(true)
      expect(removed.removal?.command).toContain('<repository>')
      const project = installed(input(['codex'], 'project'))
      // The installer reports the canonical path, which on macOS resolves /var to /private/var.
      expect(project.activation?.command).toContain(realpathSync(context.root))
      expect(project.activation?.command).not.toContain('<repository>')
    }))
  it('preflights every requested target before writing and preserves unowned native files', () =>
    fixture(({ context, input }) => {
      const existing = join(context.home, '.copilot/agents/wl-builder.agent.md')
      mkdirSync(dirname(existing), { recursive: true })
      writeFileSync(existing, 'Personal role\n')
      const before = tree(context.home)
      expect(() => installed(input())).toThrow('without this installation ownership')
      expect(tree(context.home)).toEqual(before)
      expect(existsSync(join(context.home, '.claude/skills/wl-next'))).toBe(false)
    }))
  it('preserves edited owned files and extra private files on install and uninstall', () =>
    fixture(({ context, input }) => {
      installed(input(['codex']))
      const file = join(context.home, '.codex/agents/wl-builder.toml')
      const original = readFileSync(file, 'utf8')
      writeFileSync(file, 'Personal edited role\n')
      expect(() => manageInstallation('uninstall', input(['codex']))).toThrow('edited')
      expect(readFileSync(file, 'utf8')).toBe('Personal edited role\n')
      writeFileSync(file, original)
      const extra = join(context.home, '.agents/skills/wl-next/personal.md')
      writeFileSync(extra, 'Keep this file\n')
      expect(() => installed(input(['codex']))).toThrow('Unowned')
      expect(() => manageInstallation('uninstall', input(['codex']))).toThrow('Unowned')
      expect(readFileSync(extra, 'utf8')).toBe('Keep this file\n')
    }))
  it('refuses changed modes/symlinks and escaped project/store destinations before mutation', () =>
    fixture(({ context, input, dir }) => {
      installed(input(['codex']))
      const file = join(context.home, '.codex/agents/wl-builder.toml')
      chmodSync(file, 0o755)
      expect(() => installed(input(['codex']))).toThrow('edited')
      chmodSync(file, 0o644)
      rmSync(file)
      symlinkSync(join(context.root, 'README.md'), file)
      expect(() => manageInstallation('uninstall', input(['codex']))).toThrow()
      const escaped = join(dir, 'outside')
      mkdirSync(escaped)
      symlinkSync(escaped, join(context.root, '.github'))
      expect(() => installed(input(['copilot'], 'project'))).toThrow('escapes')
      expect(readdirSync(escaped)).toEqual([])
      expect(() =>
        manageInstallation('install', {
          ...input(['claude']),
          context: { ...context, store: join(context.root, 'runtime') },
        }),
      ).toThrow('outside git')
    }))
  it(
    'upgrades matching owned files with external backups and retains other targets',
    () =>
      fixture(({ context, input }) => {
        const original = input(['codex', 'opencode'])
        const first = installed(original)
        const receipt = JSON.parse(readFileSync(first.receipt, 'utf8'))
        const old = receipt.components
          .find((component: { target: string }) => component.target === 'codex')
          .files.find((file: { path: string }) => file.path.endsWith('bin/wl.mjs'))
        const changed = new Map(original.canonical)
        const skill = changed.get('harness/skills/next/SKILL.md')
        if (!skill) throw new Error('Expected next skill')
        changed.set(
          'harness/skills/next/SKILL.md',
          `${skill}\nKeep the current fixture evidence.\n`,
        )
        const result = installed({
          ...input(['codex']),
          canonical: changed,
          core: `${currentCore()}\n// Fixture upgrade.\n`,
        })
        expect(result.status).toBe('installed')
        expect(
          typeof result.backup === 'string' &&
            existsSync(join(result.backup, `${artifactDigest(old.path)}-${old.sha256}`)),
        ).toBe(true)
        expect(
          readFileSync(join(context.home, '.agents/skills/wl-next/SKILL.md'), 'utf8'),
        ).toContain('Keep the current fixture')
        expect(
          readFileSync(join(context.home, '.config/opencode/skills/wl-next/SKILL.md'), 'utf8'),
        ).not.toContain('Keep the current fixture')
        manageInstallation('uninstall', input())
        expect(tree(context.home)).toEqual([])
      }),
    20000,
  )
  it('accepts already missing owned files during uninstall without deleting other native data', () =>
    fixture(({ context, input }) => {
      installed(input(['codex']))
      rmSync(join(context.home, '.codex/agents/wl-builder.toml'))
      writeFileSync(join(context.home, '.codex/agents/personal.toml'), 'name = "personal"\n')
      expect(manageInstallation('uninstall', input(['codex'])).status).toBe('uninstalled')
      expect(readFileSync(join(context.home, '.codex/agents/personal.toml'), 'utf8')).toBe(
        'name = "personal"\n',
      )
    }))
  it('rejects forged receipts/config-root changes and preserves every existing file', () =>
    fixture(({ context, input, dir }) => {
      const result = installed(input(['codex']))
      const original = readFileSync(result.receipt, 'utf8')
      const forged = JSON.parse(original)
      const outside = join(dir, 'keep.txt')
      writeFileSync(outside, 'Keep outside data\n')
      forged.components[0].files[0].path = outside
      writeFileSync(result.receipt, JSON.stringify(forged))
      expect(() => manageInstallation('uninstall', input(['codex']))).toThrow('escapes')
      expect(readFileSync(outside, 'utf8')).toBe('Keep outside data\n')
      writeFileSync(result.receipt, original)
      expect(() =>
        manageInstallation('uninstall', {
          ...input(['codex']),
          context: { ...context, env: { ...context.env, CODEX_HOME: join(dir, 'other-home') } },
        }),
      ).toThrow('roots changed')
    }))
  it('recovers known pending output only through uninstall and refuses blind install retries', () =>
    fixture(({ input }) => {
      const result = installed(input(['codex']))
      const receipt = JSON.parse(readFileSync(result.receipt, 'utf8'))
      const component = receipt.components[0]
      const changed = new Map(input(['codex']).canonical)
      const next = changed.get('harness/skills/next/SKILL.md')
      if (!next) throw new Error('Expected next skill')
      changed.set('harness/skills/next/SKILL.md', `${next}\nSynthetic interrupted upgrade.\n`)
      const plan = installationPlan(
        'codex',
        input(['codex']).context,
        component.artifact,
        changed,
        currentCore(),
        VERSION,
      )
      const after = {
        ...component,
        source: plan.source,
        files: plan.files.map((file) => ({
          path: file.path,
          mode: file.mode,
          sha256: artifactDigest(file.content),
          component: file.component,
        })),
      }
      const modified = plan.files.find((file) => file.path.endsWith('/skills/wl-next/SKILL.md'))
      if (!modified) throw new Error('Expected native next skill')
      writeFileSync(modified.path, modified.content)
      receipt.pending = {
        kind: 'install',
        targets: ['codex'],
        before: [component],
        after: [after],
        backup: 'backups/00000000-0000-4000-8000-000000000000',
      }
      writeFileSync(result.receipt, JSON.stringify(receipt))
      expect(inspectInstallation(input(['codex'])).status).toBe('pending')
      expect(() => installed(input(['codex']))).toThrow('pending')
      expect(() => manageInstallation('uninstall', input(['opencode']))).toThrow(
        'Recover all pending',
      )
      expect(manageInstallation('uninstall', input(['codex'])).status).toBe('uninstalled')
    }))
  it(
    'escapes native filesystem paths as module URLs and keeps shell metacharacters literal',
    () =>
      fixture(({ dir, context, input, env }) => {
        const bin = join(dir, 'bin')
        mkdirSync(bin)
        const marker = join(dir, 'unexpected-command')
        const fake = join(bin, 'wholeloop-unsafe-probe')
        writeFileSync(
          fake,
          `#!/usr/bin/env node\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)},'unexpected')\n`,
        )
        chmodSync(fake, 0o755)
        const selected = {
          ...input(['claude', 'opencode']),
          context: { ...context, store: join(dir, "state's # ? % $(wholeloop-unsafe-probe)") },
        }
        installed(selected)
        const launcher = join(context.home, '.claude/wholeloop/wl.mjs')
        const root = spawnSync(process.execPath, [launcher, 'adapter', 'root', '--json'], {
          cwd: context.root,
          env,
          encoding: 'utf8',
        })
        expect(root.status, root.stderr).toBe(0)
        const metadata = frontmatter(
          readFileSync(join(context.home, '.claude/skills/wl-next/SKILL.md'), 'utf8'),
        )
        const hooks = metadata?.hooks as { PreToolUse: { hooks: { command: string }[] }[] }
        const command = hooks.PreToolUse[0]?.hooks[0]?.command ?? ''
        const result = spawnSync('/bin/sh', ['-c', command], {
          cwd: context.root,
          input: JSON.stringify({
            cwd: context.root,
            tool_name: 'Read',
            tool_input: { file_path: 'README.md' },
          }),
          env: { ...env, PATH: `${bin}:${process.env.PATH ?? ''}` },
          encoding: 'utf8',
        })
        expect(result.status, result.stderr).toBe(0)
        expect(result.stdout).toBe('')
        expect(existsSync(marker)).toBe(false)
        const plugin = join(context.home, '.config/opencode/plugins/wholeloop.mjs')
        writeFileSync(plugin, readFileSync(join(dirname(plugin), 'wholeloop.js')))
        const imported = spawnSync(
          process.execPath,
          [
            '--input-type=module',
            '-e',
            `const plugin=await import(${JSON.stringify(pathToFileURL(plugin).href)});if(typeof plugin.Wholeloop!=='function')process.exit(1)`,
          ],
          { cwd: context.root, env, encoding: 'utf8' },
        )
        expect(imported.status, imported.stderr).toBe(0)
      }),
    15000,
  )
  it(
    'respects absolute native roots and rejects ambiguous relative overrides without native writes',
    () =>
      fixture(({ dir, context, input }) => {
        const env = {
          ...context.env,
          CODEX_HOME: join(dir, 'custom-codex'),
          CLAUDE_CONFIG_DIR: join(dir, 'custom-claude'),
        }
        const selected = { ...input(['claude', 'codex']), context: { ...context, env } }
        installed(selected)
        expect(existsSync(join(env.CODEX_HOME, 'agents/wl-builder.toml'))).toBe(true)
        manageInstallation('uninstall', selected)
        expect(existsSync(env.CODEX_HOME)).toBe(false)
        expect(existsSync(env.CLAUDE_CONFIG_DIR)).toBe(false)
        expect(() =>
          installed({
            ...input(['codex']),
            context: { ...context, env: { ...env, CODEX_HOME: 'relative-native-root' } },
          }),
        ).toThrow('must be absolute')
        expect(tree(context.home)).toEqual([])
      }),
    15000,
  )
  it('refuses a changed external recovery backup before removing native output', () =>
    fixture(({ input }) => {
      const result = installed(input(['codex']))
      const receipt = JSON.parse(readFileSync(result.receipt, 'utf8'))
      const component = receipt.components[0]
      receipt.pending = {
        kind: 'install',
        targets: ['codex'],
        before: [component],
        after: [component],
        backup: 'backups/00000000-0000-4000-8000-000000000000',
      }
      writeFileSync(result.receipt, JSON.stringify(receipt))
      const file = component.files[0]
      const backup = join(
        dirname(result.receipt),
        receipt.pending.backup,
        `${artifactDigest(file.path)}-${file.sha256}`,
      )
      mkdirSync(dirname(backup), { recursive: true })
      writeFileSync(backup, 'Changed backup\n')
      expect(() => manageInstallation('uninstall', input(['codex']))).toThrow('backup changed')
      expect(existsSync(file.path)).toBe(true)
      expect(readFileSync(backup, 'utf8')).toBe('Changed backup\n')
    }))
  it.each(TARGETS)(
    'executes the installed %s launcher and returns checked context with the first normal command',
    (target) =>
      fixture(({ context, input, env }) => {
        const result = installed(input([target], 'user', true))
        const locations = installLocations(target, context)
        const skill = readdirSync(locations.skills).find((name) => name.endsWith('frame-problem'))
        expect(skill).toBeDefined()
        const launcher = join(dirname(locations.skills), 'wholeloop/wl.mjs')
        expect(
          readFileSync(join(locations.skills, skill ?? 'missing', 'SKILL.md'), 'utf8'),
        ).toContain(`installed launcher at ${launcher}`)
        const frame = spawnSync(
          process.execPath,
          [
            launcher,
            '--with-context',
            'step',
            'begin',
            'frame-problem',
            '--input',
            'Find a past fixture order',
            '--owner',
            'Owner',
            '--json',
          ],
          { cwd: context.root, env, encoding: 'utf8' },
        )
        expect(frame.status, frame.stderr).toBe(0)
        const invocation = JSON.parse(frame.stdout)
        expect(validate(invocation, invocationSchema)).toEqual([])
        expect(invocation.context.target).toBe(target)
        expect(invocation.result.schema).toBe('wholeloop/step-begin@1')
        const manifest = JSON.parse(
          readFileSync(join(invocation.context.root, 'wholeloop-artifacts.json'), 'utf8'),
        )
        expect(invocation.context.source).toBe(manifest.source)
        expect(Object.values(invocation.context.roles).sort()).toEqual(
          Object.keys(invocation.context.roles)
            .map((role) => installedName(target, 'agent', role))
            .sort(),
        )
        expect(Object.keys(invocation.context.roles)).toHaveLength(manifest.agents.length)
        const names = readdirSync(locations.agents)
        for (const name of Object.values(invocation.context.roles))
          expect(names.some((file) => file.startsWith(`${name}.`))).toBe(true)
        expect(
          existsSync(join(invocation.context.root, 'resources/protocols/worker-handoffs.md')),
        ).toBe(true)
        if (target === 'codex') expect(invocation.context.roles.launcher).toBeUndefined()
        const plain = spawnSync(process.execPath, [launcher, 'status', '--json'], {
          cwd: context.root,
          env,
          encoding: 'utf8',
        })
        expect(plain.status, plain.stderr).toBe(0)
        expect(JSON.parse(plain.stdout).schema).toBe('wholeloop/status@1')
        if (target === 'claude') {
          const plugin = spawnSync(
            process.execPath,
            [join(invocation.context.root, 'bin/wl.mjs'), '--with-context', 'status', '--json'],
            { cwd: context.root, env, encoding: 'utf8' },
          )
          expect(plugin.status, plugin.stderr).toBe(0)
          expect(JSON.parse(plugin.stdout).context.roles.researcher).toBe('wholeloop:researcher')
          expect(invocation.context.roles.researcher).toBe('wl-researcher')
        }
        if (target === 'codex') {
          writeFileSync(
            join(invocation.context.root, 'wholeloop-artifacts.json'),
            JSON.stringify({ ...manifest, agents: 'invalid' }),
          )
          const refused = spawnSync(
            process.execPath,
            [
              launcher,
              '--with-context',
              'answer',
              'decision.fixture=yes',
              '--remember',
              'run',
              '--for',
              invocation.result.subject.id,
              '--by',
              'Owner',
              '--channel',
              'fixture',
              '--json',
            ],
            { cwd: context.root, env, encoding: 'utf8' },
          )
          const response = JSON.parse(refused.stdout)
          expect(refused.status).not.toBe(0)
          expect(response.context.target).toBe('codex')
          expect(response.context.roles).toEqual({})
          expect(response.result.message).toContain('An agent cannot supply person attribution')
        }
        expect(result.conformance).toBe('unverified')
      }),
    10000,
  )
  it.each(['claude', 'copilot', 'opencode'])(
    'executes the installed %s hook binding with native deny and default allow',
    (target) =>
      fixture(({ dir, context, input, env }) => {
        installed(input([target], 'project'))
        const scoped = { ...context, scope: 'project' as const }
        const locations = installLocations(target, scoped)
        if (target === 'opencode') {
          if (!locations.hooks) throw new Error('Expected plugin directory')
          const copied = join(locations.hooks, 'wholeloop.mjs')
          writeFileSync(copied, readFileSync(join(locations.hooks, 'wholeloop.js')))
          const script = join(dir, 'plugin-test.mjs')
          writeFileSync(
            script,
            `const {Wholeloop}=await import(${JSON.stringify(pathToFileURL(copied).href)});const handlers=await Wholeloop({directory:${JSON.stringify(context.root)}});try{await handlers['tool.execute.before']({tool:'write'},{args:{filePath:'.wholeloop/runtime/item'}});process.exit(9)}catch(error){if(!error.message.includes('runtime'))process.exit(8)};await handlers['tool.execute.before']({tool:'read'},{args:{filePath:'README.md'}})\n`,
          )
          const result = spawnSync(process.execPath, [script], {
            cwd: context.root,
            env,
            encoding: 'utf8',
          })
          expect(result.status, result.stderr).toBe(0)
        } else {
          let args: string[]
          if (target === 'claude') {
            const metadata = frontmatter(
              readFileSync(join(locations.skills, 'wl-next/SKILL.md'), 'utf8'),
            )
            const hooks = metadata?.hooks as { PreToolUse: { hooks: { command: string }[] }[] }
            const command = hooks.PreToolUse[0]?.hooks[0]?.command ?? ''
            // biome-ignore lint/suspicious/noTemplateCurlyInString: Native project-root substitution must remain literal.
            expect(command).toContain('${CLAUDE_PROJECT_DIR}')
            args = ['-c', command]
          } else {
            if (!locations.hooks) throw new Error('Expected hook directory')
            const config = JSON.parse(readFileSync(join(locations.hooks, 'wholeloop.json'), 'utf8'))
            args = config.hooks.preToolUse[0].args
          }
          const invoke = (tool: string, path: string) =>
            spawnSync(target === 'claude' ? '/bin/sh' : process.execPath, args, {
              cwd: context.root,
              input: JSON.stringify({
                tool_name: tool,
                tool_input: { file_path: path },
                cwd: context.root,
              }),
              env: { ...env, CLAUDE_PROJECT_DIR: context.root },
              encoding: 'utf8',
            })
          const denied = invoke('Write', '.wholeloop/runtime/item')
          expect(denied.status, denied.stderr).toBe(0)
          const output = JSON.parse(denied.stdout)
          expect(
            target === 'claude'
              ? output.hookSpecificOutput.permissionDecision
              : output.permissionDecision,
          ).toBe('deny')
          const allowed = invoke('Read', 'README.md')
          expect(allowed.status, allowed.stderr).toBe(0)
          expect(allowed.stdout).toBe('')
        }
      }),
    10000,
  )
  it(
    'keeps project launchers and hook paths valid after copying the intended distribution',
    () =>
      fixture(({ context, input, dir, env }) => {
        installed(input(['claude', 'copilot'], 'project'))
        const relocated = join(dir, 'relocated')
        mkdirSync(relocated)
        const copied = spawnSync('cp', ['-R', `${context.root}/.`, relocated], { encoding: 'utf8' })
        expect(copied.status, copied.stderr).toBe(0)
        const launcher = join(relocated, '.github/skills/wl-next/scripts/wl.mjs')
        const result = spawnSync(process.execPath, [launcher, 'adapter', 'root', '--json'], {
          cwd: relocated,
          env,
          encoding: 'utf8',
        })
        expect(result.status, result.stderr).toBe(0)
        expect(JSON.parse(result.stdout).root).toContain('relocated')
        const config = JSON.parse(
          readFileSync(join(relocated, '.github/hooks/wholeloop.json'), 'utf8'),
        )
        expect(config.hooks.preToolUse[0].args[0]).toBe(
          '.wholeloop/distribution/copilot/hooks/run.mjs',
        )
        expect(
          readFileSync(join(relocated, '.claude/skills/wl-next/SKILL.md'), 'utf8'),
        ).not.toContain(context.root)
      }),
    10000,
  )
  it(
    'runs compiled scoped install/dry-run/uninstall and preserves a temporary HOME exactly',
    () =>
      fixture(({ context, env }) => {
        const call = (action: string, extra: string[] = []) =>
          spawnSync(
            process.execPath,
            [
              resolve('dist/wl.mjs'),
              action,
              '--target',
              'all',
              '--scope',
              'user',
              '--store',
              context.store,
              '--json',
              ...extra,
            ],
            {
              cwd: context.root,
              env,
              encoding: 'utf8',
              timeout: 45000,
              maxBuffer: 2 * 1024 * 1024,
            },
          )
        const planned = call('install', ['--dry-run'])
        expect(planned.status, planned.stderr).toBe(0)
        expect(JSON.parse(planned.stdout).status).toBe('planned')
        expect(tree(context.home)).toEqual([])
        const applied = call('install')
        expect(applied.status, applied.stderr).toBe(0)
        expect(JSON.parse(applied.stdout).status).toBe('installed')
        const bin = join(dirname(context.home), 'version-bin')
        mkdirSync(bin)
        const fake = join(bin, 'codex')
        writeFileSync(fake, "#!/usr/bin/env node\nconsole.log('codex-cli 1.2.3')\n")
        chmodSync(fake, 0o755)
        const diagnosed = spawnSync(
          process.execPath,
          [
            resolve('dist/wl.mjs'),
            'doctor',
            '--target',
            'codex',
            '--store',
            context.store,
            '--json',
          ],
          {
            cwd: context.root,
            env: { ...env, PATH: `${bin}:${process.env.PATH ?? ''}` },
            encoding: 'utf8',
            timeout: 10000,
            maxBuffer: 65536,
          },
        )
        expect(
          JSON.parse(diagnosed.stdout).checks.find(
            (check: { id: string }) => check.id === 'installation.user',
          ).status,
        ).toBe('pass')
        const removed = call('uninstall')
        expect(removed.status, removed.stdout || removed.stderr).toBe(0)
        expect(JSON.parse(removed.stdout).status).toBe('uninstalled')
        expect(tree(context.home)).toEqual([])
        // A user-scope handoff names no repository; the person supplies the one to retire.
        const handoff = (JSON.parse(removed.stdout).removal.command as string[]).map((word) =>
          word === '<repository>' ? context.root : word,
        )
        expect(handoff[0]).toBe('node')
        expect(handoff[1] && existsSync(handoff[1])).toBe(true)
        const retired = spawnSync(handoff[0] ?? '', handoff.slice(1), {
          cwd: context.root,
          env,
          encoding: 'utf8',
          timeout: 10000,
        })
        expect(retired.status, retired.stderr).toBe(0)
        expect(JSON.parse(retired.stdout).status).toBe('already-absent')
      }),
    // The complete six-client catalog performs durable per-file writes and removal.
    90000,
  )
})
