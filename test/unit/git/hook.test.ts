import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('real commit-msg hook', () => {
  it('rejects an invalid PR commit through the exact CI range checker', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wholeloop-history-'))
    try {
      execFileSync('git', ['init', '-q', dir])
      const git = (args: string[], input = '') =>
        execFileSync('git', args, { cwd: dir, input, encoding: 'utf8' }).trim()
      const tree = git(['mktree'])
      const identity = [
        '-c',
        'user.name=Test Author',
        '-c',
        'user.email=test@example.com',
        '-c',
        'commit.gpgsign=false',
      ]
      const first = git(
        [...identity, 'commit-tree', tree],
        'test: create history fixture\n\nExercise the range checker in isolation.\n',
      )
      const valid = git(
        [...identity, 'commit-tree', tree, '-p', first],
        'fix: validate new messages\n\nKeep public history consistent.\n',
      )
      const invalid = git(
        [...identity, 'commit-tree', tree, '-p', valid],
        'invalid commit subject\n\nCheck CI rejection.\n',
      )
      const script = resolve('scripts/check-commits.mjs')
      expect(spawnSync(process.execPath, [script, `${first}..${valid}`], { cwd: dir }).status).toBe(
        0,
      )
      const eventFile = join(dir, 'event.json')
      writeFileSync(
        eventFile,
        JSON.stringify({ pull_request: { base: { sha: valid }, head: { sha: invalid } } }),
      )
      const result = spawnSync(process.execPath, [script], {
        cwd: dir,
        env: { ...process.env, GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: eventFile },
        encoding: 'utf8',
      })
      expect(result.status).toBe(4)
      expect(result.stderr).toContain(`commits: rejected ${invalid}`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
  it('rejects attribution and accepts a valid commit in an isolated repository', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wholeloop-hook-'))
    try {
      execFileSync('git', ['init', '-q', dir])
      const file = join(dir, 'message')
      const args = [
        '-c',
        `core.hooksPath=${resolve('.githooks')}`,
        '-c',
        'user.name=Test Author',
        '-c',
        'user.email=test@example.com',
        '-c',
        'commit.gpgsign=false',
        'commit',
        '--allow-empty',
        '--file',
        file,
      ]
      writeFileSync(
        file,
        'feat: test hook\n\nCheck rejection.\n\nCo-Authored-By: Claude <bot@example.com>\n',
      )
      const rejected = spawnSync('git', args, { cwd: dir, encoding: 'utf8' })
      expect(rejected.status).not.toBe(0)
      expect(rejected.stderr).toContain('Remove tool attribution')
      writeFileSync(
        file,
        'test: exercise commit validation\n\nPrevent attribution in history. Verified by the real hook.\n',
      )
      const accepted = spawnSync('git', args, { cwd: dir, encoding: 'utf8' })
      expect(accepted.stderr).toContain('commit-msg: valid')
      expect(accepted.status).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
