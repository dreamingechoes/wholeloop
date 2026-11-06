import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { observePlanBases } from '../../../src/delivery/plan.js'
import { StoreFiles } from '../../../src/state/files.js'
import { canonicalPath } from '../../../src/state/paths.js'
import { withReadObservation } from '../../../src/state/read-observation.js'
import { git, namedBase, repository, repositoryBase } from '../../../src/worktrees/git.js'

vi.mock('node:child_process', async (original) => {
  const process = await original<typeof import('node:child_process')>()
  return { ...process, spawnSync: vi.fn(process.spawnSync) }
})
const roots: string[] = []
afterEach(() => {
  vi.mocked(spawnSync).mockClear()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function run(cwd: string, ...args: string[]) {
  const result = vi.mocked(spawnSync).getMockImplementation()?.('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 'F',
      GIT_AUTHOR_EMAIL: 'f@example.invalid',
      GIT_COMMITTER_NAME: 'F',
      GIT_COMMITTER_EMAIL: 'f@example.invalid',
    },
  }) as { status: number; stdout: string } | undefined
  if (result?.status !== 0) throw new Error(`fixture git ${args[0]} failed`)
  return result.stdout
}
/** The former separate queries, verbatim, as the reference result for every fixture. */
function original(root: string, target: string) {
  const query = (args: string[]) => {
    const result = run(root, ...args)
    return result
  }
  const outcome = <T>(read: () => T) => {
    try {
      return { value: read() }
    } catch {
      return { refused: true }
    }
  }
  return {
    repository: outcome(() => {
      const path = canonicalPath(query(['rev-parse', '--show-toplevel']).trim())
      const commonDir = canonicalPath(
        resolve(root, query(['rev-parse', '--git-common-dir']).trim()),
      )
      return { path, commonDir }
    }),
    base: outcome(() => {
      if (!target.trim() || target.startsWith('-') || /[\n\r\0]/.test(target)) throw new Error()
      const ref = query([
        'rev-parse',
        '--verify',
        '--symbolic-full-name',
        '--end-of-options',
        target,
      ]).trim()
      if (!/^refs\/(heads|remotes)\/.+/.test(ref) || /[\n\r]/.test(ref)) throw new Error()
      return {
        ref,
        sha: query(['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]).trim(),
      }
    }),
  }
}
function current(root: string, target: string) {
  const outcome = <T>(read: () => T) => {
    try {
      return { value: read() }
    } catch {
      return { refused: true }
    }
  }
  return {
    repository: outcome(() => {
      const { path, commonDir } = repository(root)
      return { path, commonDir }
    }),
    base: outcome(() => namedBase(root, target)),
    joined: outcome(() => {
      const { path, commonDir, ref, sha } = repositoryBase(root, target)
      return { path, commonDir, ref, sha }
    }),
  }
}
function repo(name = 'repo') {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-joined-git-')))
  roots.push(parent)
  const root = join(parent, name)
  mkdirSync(root)
  run(root, 'init', '-q', '-b', 'main')
  run(root, 'commit', '-q', '--allow-empty', '-m', 'base')
  return { parent, root }
}

describe('joined repository and base queries (ADR-0243)', () => {
  const cases: [string, () => { root: string; target: string }][] = [
    ['primary checkout', () => ({ root: repo().root, target: 'refs/heads/main' })],
    ['path with spaces', () => ({ root: repo(' spaced repo ').root, target: 'refs/heads/main' })],
    ['path with a newline', () => ({ root: repo('line\nbreak').root, target: 'refs/heads/main' })],
    [
      'linked worktree',
      () => {
        const { parent, root } = repo()
        run(root, 'branch', 'feature')
        run(root, 'worktree', 'add', '-q', join(parent, 'tree'), 'feature')
        return { root: join(parent, 'tree'), target: 'refs/heads/feature' }
      },
    ],
    ['missing target', () => ({ root: repo().root, target: 'refs/heads/absent' })],
    [
      'only a nested ambiguous name exists',
      () => {
        const { root } = repo()
        run(root, 'update-ref', 'refs/heads/refs/heads/ghost', 'HEAD')
        return { root, target: 'refs/heads/ghost' }
      },
    ],
    [
      'remote-tracking target',
      () => {
        const { root } = repo()
        run(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
        return { root, target: 'refs/remotes/origin/main' }
      },
    ],
    [
      'tag instead of a branch',
      () => {
        const { root } = repo()
        run(root, 'tag', '-a', 'v1', '-m', 'tag')
        return { root, target: 'refs/tags/v1' }
      },
    ],
    [
      'branch pointing to an annotated tag',
      () => {
        const { root } = repo()
        run(root, 'tag', '-a', 'v1', '-m', 'tag')
        // Git refuses this through update-ref; a loose ref file still creates it.
        writeFileSync(join(root, '.git/refs/heads/tagged'), run(root, 'rev-parse', 'v1'))
        return { root, target: 'refs/heads/tagged' }
      },
    ],
    ['option-like target', () => ({ root: repo().root, target: '--all' })],
    [
      'bare repository',
      () => {
        const { parent } = repo()
        const bare = join(parent, 'bare.git')
        mkdirSync(bare)
        run(bare, 'init', '-q', '--bare')
        return { root: bare, target: 'refs/heads/main' }
      },
    ],
    [
      'subdirectory of a checkout',
      () => {
        const { root } = repo()
        mkdirSync(join(root, 'nested'))
        writeFileSync(join(root, 'nested', 'file'), 'x')
        return { root: join(root, 'nested'), target: 'refs/heads/main' }
      },
    ],
  ]

  it.each(cases)('matches the separate queries: %s', (_name, build) => {
    const { root, target } = build(),
      expected = original(root, target),
      actual = current(root, target)
    expect(actual.repository).toEqual(expected.repository)
    expect(actual.base).toEqual(expected.base)
    const joined =
      'value' in expected.repository && 'value' in expected.base
        ? { value: { ...expected.repository.value, ...expected.base.value } }
        : { refused: true }
    expect(actual.joined).toEqual(joined)
  })

  it('uses one process for repository identity and three for a remote-bound plan base', () => {
    const { root } = repo()
    run(root, 'remote', 'add', 'origin', 'https://github.com/fixture/app.git')
    const head = run(root, 'rev-parse', 'HEAD').trim()
    vi.mocked(spawnSync).mockClear()
    repository(root)
    expect(spawnSync).toHaveBeenCalledTimes(1)
    vi.mocked(spawnSync).mockClear()
    observePlanBases([
      {
        id: 'app',
        root,
        target: 'refs/heads/main',
        base: head,
        remote: { name: 'origin', url: 'https://github.com/fixture/app' },
      } as never,
    ])
    expect(spawnSync).toHaveBeenCalledTimes(3)
    expect(() =>
      observePlanBases([
        { id: 'app', root, target: 'refs/heads/main', base: '0'.repeat(40) } as never,
      ]),
    ).toThrow()
  })

  it('keeps the separate queries when a newline makes the joined output ambiguous', () => {
    const { root } = repo('line\nbreak')
    vi.mocked(spawnSync).mockClear()
    repository(root)
    expect(spawnSync).toHaveBeenCalledTimes(3)
  })

  it('observes plan bases once per synchronous decision and renews after effects (ADR-0243)', async () => {
    const { root, parent } = repo()
    const head = run(root, 'rev-parse', 'HEAD').trim(),
      repos = [{ id: 'app', root, target: 'refs/heads/main', base: head } as never],
      files = new StoreFiles(join(parent, 'store'))
    const processes = () => vi.mocked(spawnSync).mock.calls.length
    vi.mocked(spawnSync).mockClear()
    observePlanBases(repos)
    observePlanBases(repos)
    expect(processes()).toBe(2)
    await Promise.resolve()
    await new Promise((resolve) => setImmediate(resolve))
    observePlanBases(repos)
    expect(processes()).toBe(4)
    git(root, ['update-ref', 'refs/heads/side', head])
    const afterWrite = processes()
    observePlanBases(repos)
    expect(processes()).toBe(afterWrite + 2)
    files.atomic('fact.json', '{}\n')
    observePlanBases(repos)
    expect(processes()).toBe(afterWrite + 4)
    // A refusal is never reused, and a sealed observation uses its own reads.
    run(root, 'commit', '-q', '--allow-empty', '-m', 'advance')
    await new Promise((resolve) => setImmediate(resolve))
    expect(() => observePlanBases(repos)).toThrow('stale-or-missing-base')
    expect(() => observePlanBases(repos)).toThrow('stale-or-missing-base')
    const advanced = [
      {
        id: 'app',
        root,
        target: 'refs/heads/main',
        base: run(root, 'rev-parse', 'HEAD').trim(),
      } as never,
    ]
    observePlanBases(advanced)
    const before = processes()
    await withReadObservation(new AbortController().signal, async () => {
      observePlanBases(advanced)
      observePlanBases(advanced)
    })
    expect(processes()).toBeGreaterThan(before)
  })
})
