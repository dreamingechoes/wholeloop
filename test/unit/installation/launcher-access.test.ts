// Install shows, never writes, the narrowest rule that lets each client run its wl launchers (P9-21).
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parse as parseToml } from 'smol-toml'
import { describe, expect, it } from 'vitest'
import { bundledCanonical } from '../../../src/adapters/canonical.js'
import { TARGETS } from '../../../src/installation/contracts.js'
import {
  installedLauncherAccess,
  type LauncherAccess,
  launcherAccess,
} from '../../../src/installation/launcher-access.js'

const launchers = [
  '/home/p/.x/skills/wl-next/scripts/wl.mjs',
  '/home/p/.x/skills/wl-a/scripts/wl.mjs',
]
const shown = (target: string, scope: 'user' | 'project' = 'user', paths = launchers) =>
  launcherAccess({ target, scope, root: '/repo', base: '/home/p/.x', launchers: paths })

describe('launcher allow rules', () => {
  it.each([
    ['claude', 'user', '/home/p/.x/settings.json'],
    ['claude', 'project', '/home/p/.x/settings.local.json'],
    ['opencode', 'user', '/home/p/.x/opencode.json'],
    ['opencode', 'project', '/repo/opencode.json'],
    ['gemini', 'user', '/home/p/.x/policies/wholeloop.toml'],
    ['codex', 'project', '/home/p/.x/rules/wholeloop.rules'],
    ['cursor', 'user', '/home/p/.x/cli-config.json'],
    ['cursor', 'project', '/home/p/.x/cli.json'],
    ['copilot', 'user', null],
  ] as const)('%s at %s scope is shown for %s and never applied', (target, scope, file) => {
    expect(shown(target, scope)).toMatchObject({
      target,
      file,
      rules: 2,
      applied: false,
      verified: false,
    })
  })

  it('names each launcher exactly, sorted, in the client format', () => {
    const [a, next] = [...launchers].sort()
    expect(JSON.parse(shown('claude').snippet ?? '')).toEqual({
      permissions: { allow: [`Bash(${a}:*)`, `Bash(${next}:*)`] },
    })
    expect(JSON.parse(shown('opencode').snippet ?? '')).toEqual({
      permission: { bash: { [`${a} *`]: 'allow', [`${next} *`]: 'allow' } },
    })
    expect(parseToml(shown('gemini').snippet ?? '')).toEqual({
      rule: [a, next].map((commandPrefix) => ({
        toolName: 'run_shell_command',
        commandPrefix,
        decision: 'allow',
        priority: 100,
      })),
    })
    expect(shown('codex').snippet).toBe(
      [a, next].map((path) => `prefix_rule(pattern = ["${path}"], decision = "allow")`).join('\n'),
    )
    expect(JSON.parse(shown('cursor').snippet ?? '')).toEqual({
      permissions: { allow: [`Shell(${a})`, `Shell(${next})`] },
    })
    expect(shown('copilot').snippet).toBe(
      `--allow-tool 'shell(${a})' \\\n--allow-tool 'shell(${next})'`,
    )
  })

  it.each([
    ['antigravity', launchers, 'No command-level allow rule is known'],
    ['claude', [], 'No launcher was installed'],
    ['claude', ['/home/my files/wl.mjs'], 'pattern syntax'],
    ['opencode', ['/home/p/*/wl.mjs'], 'pattern syntax'],
    ['gemini', ['relative/wl.mjs'], 'pattern syntax'],
    ['cursor', ['/home/p/x\u001b/wl.mjs'], 'pattern syntax'],
  ] as const)('%s withholds a rule for %j', (target, paths, note) => {
    const access: LauncherAccess = shown(target, 'user', [...paths])
    expect(access).toMatchObject({ file: null, snippet: null, rules: 0, applied: false })
    expect(access.note).toContain(note)
  })
})

describe('installed launchers', () => {
  it('match the launchers install writes, and install changes no client settings', () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-launcher-access-')))
    const home = join(dir, 'home'),
      root = join(dir, 'repo')
    mkdirSync(home)
    mkdirSync(root)
    const env = {
      ...process.env,
      HOME: home,
      CODEX_HOME: join(home, '.codex'),
      XDG_CONFIG_HOME: join(home, '.config'),
      XDG_STATE_HOME: join(home, '.local/state'),
      CLAUDE_CONFIG_DIR: undefined,
      COPILOT_HOME: undefined,
      GEMINI_CLI_HOME: undefined,
      OPENCODE_CONFIG_DIR: undefined,
    }
    try {
      const result = spawnSync(
        process.execPath,
        [resolve('dist/wl.mjs'), 'install', '--target', 'all', '--scope', 'user', '--json'],
        { cwd: root, env, encoding: 'utf8' },
      )
      expect(result.status, result.stderr).toBe(0)
      const access = JSON.parse(result.stdout).launcherAccess as LauncherAccess[]
      expect(access.map(({ target }) => target)).toEqual([...TARGETS])
      expect(
        installedLauncherAccess(
          TARGETS,
          { root, home, store: join(home, '.local/state/wholeloop'), scope: 'user', env },
          bundledCanonical(),
        ),
      ).toEqual(access)
      for (const entry of access) {
        expect(entry.applied).toBe(false)
        if (entry.file) expect(existsSync(entry.file), entry.file).toBe(false)
        if (!entry.snippet) continue
        const paths = [...entry.snippet.matchAll(/\/[^\s"'()*]+\/scripts\/wl\.mjs/g)].map(
          (match) => match[0],
        )
        expect(paths).toHaveLength(17)
        for (const path of paths) expect(existsSync(path), path).toBe(true)
      }
      expect(access.find(({ target }) => target === 'antigravity')?.snippet).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
