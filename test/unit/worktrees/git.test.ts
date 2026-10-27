import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { registeredWorktrees, repository } from '../../../src/worktrees/git.js'

function command(root: string, args: string[]) {
  const result = spawnSync(
    'git',
    ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', ...args],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
    },
  )
  if (result.status !== 0) throw new Error(result.stderr)
}
describe('actual shared Git ownership paths', () => {
  it('resolves the common directory from the command cwd and preserves NUL-delimited names', () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-git-ownership-'))),
      root = join(dir, 'root space é'),
      linked = join(dir, 'linked\nworktree'),
      nested = join(root, 'nested')
    mkdirSync(nested, { recursive: true })
    try {
      command(root, ['init', '--quiet', '--initial-branch=main'])
      command(root, ['config', 'user.name', 'Fixture'])
      command(root, ['config', 'user.email', 'fixture@example.test'])
      writeFileSync(join(nested, 'app.txt'), 'Original committed bytes.\n')
      command(root, ['add', '.'])
      command(root, ['commit', '--quiet', '-m', 'test: seed Git ownership'])
      command(root, ['worktree', 'add', '--quiet', '-b', 'fixture', linked])
      const main = repository(root)
      expect(main.commonDir).toBe(join(root, '.git'))
      expect(repository(nested)).toEqual(main)
      expect(repository(linked)).toMatchObject({
        path: linked,
        commonDir: main.commonDir,
        key: main.key,
      })
      expect(registeredWorktrees(root)).toEqual([
        { path: root, branch: 'refs/heads/main', locked: false },
        { path: linked, branch: 'refs/heads/fixture', locked: false },
      ])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
