// Uses disposable permissions and client configuration to test recovery without granting any access.
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parse as parseToml } from 'smol-toml'
import { describe, expect, it } from 'vitest'
import { CliError } from '../../../src/cli/errors.js'
import { doctor } from '../../../src/diagnostics/doctor.js'
import {
  codexStoreAccess,
  inspectCodexStore,
  storeAccessMessage,
} from '../../../src/diagnostics/store-access.js'

function fixture(
  run: (value: {
    dir: string
    root: string
    home: string
    store: string
    state: string
    env: NodeJS.ProcessEnv
  }) => void,
) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-store-access-')))
  const root = join(dir, 'repo'),
    home = join(dir, 'home'),
    state = join(dir, 'state'),
    store = join(state, 'wholeloop')
  for (const path of [root, home, state, join(home, '.codex')]) mkdirSync(path, { recursive: true })
  const env = {
    ...process.env,
    HOME: home,
    XDG_STATE_HOME: state,
    XDG_CONFIG_HOME: join(home, '.config'),
    CODEX_HOME: join(home, '.codex'),
    CODEX_THREAD_ID: 'fixture',
    WL_WORKSPACE: '',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: join(home, '.gitconfig'),
  }
  try {
    run({ dir, root, home, state, store, env })
  } finally {
    chmodSync(state, 0o700)
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('store permission diagnostics', () => {
  it.each(['EACCES', 'EPERM'])(
    'recognizes %s through CLI wrappers and preserves unrelated failures',
    (code) =>
      fixture(({ root, store }) => {
        const error = Object.assign(new Error(`${code}: permission denied, mkdir '${store}'`), {
          code,
          path: store,
        })
        const message = storeAccessMessage(error, store, 'codex')
        expect(message).toContain(store)
        expect(message).toContain('sandbox_workspace_write.writable_roots')
        expect(storeAccessMessage(new CliError(error.message), store, 'codex')).toBe(message)
        expect(storeAccessMessage(new AggregateError([error]), store, 'codex')).toBe(message)
        expect(storeAccessMessage(new Error('outer', { cause: error }), store, 'codex')).toBe(
          message,
        )
        expect(
          storeAccessMessage(
            Object.assign(new Error(`${code}: denied, open '${root}/input'`), {
              code,
              path: join(root, 'input'),
            }),
            store,
          ),
        ).toBeUndefined()
        expect(
          storeAccessMessage(
            Object.assign(new Error(`${code}: denied, open '${store}-other'`), {
              code,
              path: `${store}-other`,
            }),
            store,
          ),
        ).toBeUndefined()
        expect(
          storeAccessMessage(
            Object.assign(new Error('missing'), { code: 'ENOENT', path: store }),
            store,
          ),
        ).toBeUndefined()
      }),
  )
  it.each([
    ['codex', 'writable_roots'],
    ['claude', '--add-dir'],
    ['opencode', 'permission.external_directory'],
    ['copilot', '--add-dir'],
    ['gemini', '--include-directories'],
    ['cursor', '--add-dir'],
    ['antigravity', 'write_file'],
  ])('names the %s setting without changing it', (client, setting) =>
    fixture(({ store, home }) => {
      expect(storeAccessMessage({ code: 'EPERM', path: store }, store, client)).toContain(setting)
      expect(existsSync(join(home, '.codex', 'config.toml'))).toBe(false)
    }),
  )
  // Root bypasses Unix mode bits, so only unprivileged processes can observe this refusal.
  it.skipIf(process.getuid?.() === 0).each([false, true])(
    'returns exit 3 with readable store guidance (json=%s)',
    (json) =>
      fixture(({ root, state, store, env }) => {
        const init = spawnSync('git', ['init', '--quiet'], { cwd: root, env, encoding: 'utf8' })
        expect(init.status).toBe(0)
        chmodSync(state, 0o500)
        const result = spawnSync(
          process.execPath,
          [
            resolve('dist/wl.mjs'),
            'step',
            'begin',
            'research',
            '--input',
            'How are titles normalized?',
            '--owner',
            'Example Owner',
            ...(json ? ['--json'] : []),
          ],
          { cwd: root, env, encoding: 'utf8', timeout: 15000 },
        )
        expect(result.status).toBe(3)
        const message = json
          ? (JSON.parse(result.stdout) as { schema: string; code: number; message: string }).message
          : result.stderr
        expect(message).toContain(store)
        expect(message).toContain('sandbox_workspace_write.writable_roots')
        expect(existsSync(store)).toBe(false)
      }),
  )
})

describe('Codex declared store configuration', () => {
  it.skipIf(process.getuid?.() === 0)(
    'gives the selected client a sandbox remedy before suggesting chmod',
    () =>
      fixture(({ root, home, store, state, env }) => {
        chmodSync(state, 0o500)
        const report = doctor({
          root,
          home,
          store,
          env,
          targets: ['codex'],
          userFile: join(home, '.config', 'wholeloop', 'config.yml'),
          probe: () => ({ status: 'observed', version: '2.49.0' }),
        })
        const repair = report.checks.find((check) => check.id === 'store')?.repair
        expect(repair?.instruction).toContain('sandbox_workspace_write.writable_roots')
        expect(repair?.instruction).toContain(store)
        expect(repair?.command[0]).toBe('wl')
      }),
  )

  it('prints a reviewable, escaped snippet and never writes it', () =>
    fixture(({ store, home, env }) => {
      const access = codexStoreAccess(`${store} with spaces`, home, env)
      expect(access.applied).toBe(false)
      expect(parseToml(access.snippet)).toEqual({
        sandbox_mode: 'workspace-write',
        sandbox_workspace_write: { writable_roots: [`${store} with spaces`] },
      })
      expect(existsSync(access.file)).toBe(false)
    }))
  it.each([
    ['missing', undefined, 'unknown'],
    ['no writable root', 'sandbox_mode = "workspace-write"', 'fail'],
    ['matching root', 'matching', 'pass'],
    ['parent root', 'parent', 'pass'],
    ['sibling root', 'sibling', 'fail'],
    ['read only', 'sandbox_mode = "read-only"', 'fail'],
    ['malformed', 'sandbox_mode = "unterminated', 'unknown'],
  ] as const)(
    'reports %s without claiming effective native permission',
    (_name, content, expected) =>
      fixture(({ root, home, store, state, env }) => {
        const file = join(home, '.codex', 'config.toml')
        const selected =
          content === 'matching'
            ? store
            : content === 'parent'
              ? state
              : content === 'sibling'
                ? `${state}-other`
                : undefined
        const text = selected
          ? `sandbox_mode = "workspace-write"\n[sandbox_workspace_write]\nwritable_roots = [${JSON.stringify(selected)}]`
          : content
        if (text) writeFileSync(file, text)
        expect(inspectCodexStore(store, root, home, env)).toMatchObject({
          id: 'store.codex',
          status: expected,
        })
        const report = doctor({
          root,
          home,
          store,
          env,
          targets: ['codex'],
          userFile: join(home, '.config', 'wholeloop', 'config.yml'),
          probe: () => ({ status: 'observed', version: '2.49.0' }),
        })
        expect(report.checks.find((check) => check.id === 'store.codex')?.status).toBe(expected)
        expect(existsSync(store)).toBe(false)
        if (text) expect(readFileSync(file, 'utf8')).toBe(text)
      }),
  )
  it('honors a project override instead of retaining a broader user grant', () =>
    fixture(({ root, home, store, env }) => {
      writeFileSync(join(home, '.codex', 'config.toml'), codexStoreAccess(store, home, env).snippet)
      mkdirSync(join(root, '.codex'))
      writeFileSync(
        join(root, '.codex', 'config.toml'),
        '[sandbox_workspace_write]\nwritable_roots = []\n',
      )
      expect(inspectCodexStore(store, root, home, env).status).toBe('fail')
    }))
  it.each([false, true])('includes the review snippet in an install dry run (json=%s)', (json) =>
    fixture(({ root, home, store, env }) => {
      const result = spawnSync(
        process.execPath,
        [
          resolve('dist/wl.mjs'),
          'install',
          '--target',
          'codex',
          '--scope',
          'project',
          '--store',
          store,
          '--dry-run',
          ...(json ? ['--json'] : []),
        ],
        { cwd: root, env, encoding: 'utf8', timeout: 15000 },
      )
      expect(result.status).toBe(0)
      if (json)
        expect(JSON.parse(result.stdout)).toMatchObject({
          storeAccess: { target: 'codex', store, applied: false },
        })
      else expect(result.stdout).toContain('writable_roots')
      expect(existsSync(join(home, '.codex', 'config.toml'))).toBe(false)
      expect(existsSync(join(root, '.codex'))).toBe(false)
    }),
  )
})
