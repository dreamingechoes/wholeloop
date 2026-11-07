import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { releaseNotes, versionBump } from '../../../src/release/notes.js'

describe('version changes follow the range impact', () => {
  it.each([
    ['1.0.0', '2.0.0', 'major', true],
    ['1.0.0', '1.1.0', 'major', false],
    ['1.0.0', '1.1.0-rc.1', 'major', false],
    ['1.0.0', '2.0.0-rc.1', 'major', true],
    ['1.0.0', '1.1.0', 'minor', true],
    ['1.0.0', '1.0.1', 'minor', false],
    ['1.0.0', '1.0.1', 'patch', true],
    ['1.0.0', '1.0.1', 'none', true],
    ['1.0.0', '1.0.0', 'patch', false],
    ['1.1.0', '1.0.5', 'patch', false],
    ['1.0.0-rc.1', '1.0.0-rc.2', 'major', true],
    ['1.0.0-rc.1', '1.0.0', 'major', true],
    ['1.0.0-rc.2', '1.0.0-rc.2', 'patch', false],
    ['0.3.0', '0.4.0', 'major', true],
    ['0.3.0', '0.3.1', 'major', false],
  ] as const)('%s → %s with a %s range is allowed=%s', (previous, next, impact, allowed) => {
    expect(versionBump(previous, next, impact).allowed).toBe(allowed)
  })

  it('keeps a breaking range under a minor version in review', () => {
    const notes = releaseNotes(
      [{ sha: 'a'.repeat(40), message: 'feat(cli)!: drop the old flag\n\nBreaking for scripts.' }],
      '1.1.0',
      { previous: '1.0.0' },
    )
    expect(notes).toMatchObject({
      impact: 'major',
      status: 'needs-review',
      bump: { previous: '1.0.0', required: 'major', allowed: false },
    })
    expect(
      releaseNotes([{ sha: 'b'.repeat(40), message: 'fix: keep the flag' }], '1.0.1', {
        previous: '1.0.0',
      }).status,
    ).toBe('draft')
  })
})

describe('generated changelog', () => {
  it('is built from release tags, checked, and accepts the untagged next version', () => {
    const root = mkdtempSync(join(tmpdir(), 'wl-changelog-'))
    try {
      const git = (...args: string[]) => {
        const result = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
          cwd: root,
          encoding: 'utf8',
          env: {
            ...process.env,
            GIT_AUTHOR_NAME: 'Fixture',
            GIT_AUTHOR_EMAIL: 'fixture@example.com',
            GIT_COMMITTER_NAME: 'Fixture',
            GIT_COMMITTER_EMAIL: 'fixture@example.com',
            GIT_COMMITTER_DATE: '2026-11-01T00:00:00Z',
          },
        })
        if (result.status) throw new Error(result.stderr)
      }
      const commit = (subject: string) => {
        writeFileSync(join(root, 'file.txt'), subject)
        git('add', '.')
        git('commit', '-q', '-m', subject, '-m', 'Fixture body explaining the change.')
      }
      git('init', '-q', '-b', 'main')
      writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '1.1.0' }))
      commit('feat: add the first command')
      git('tag', 'v1.0.0-rc.1')
      commit('fix: correct the first command')
      git('tag', 'v1.0.0')
      commit('feat: add a second command')
      const script = (...args: string[]) =>
        spawnSync(
          process.execPath,
          [
            resolve('scripts/changelog.mjs'),
            '--root',
            root,
            '--cli',
            resolve('dist/wl.mjs'),
            ...args,
          ],
          { encoding: 'utf8' },
        )
      expect(script('--check').status).toBe(1)
      expect(script().status).toBe(0)
      const text = readFileSync(join(root, 'CHANGELOG.md'), 'utf8')
      expect(text.indexOf('## 1.0.0\n')).toBeLessThan(text.indexOf('## 1.0.0-rc.1\n'))
      expect(text).toContain('correct the first command')
      expect(text).not.toContain('add a second command')
      expect(script('--check').status).toBe(0)
      writeFileSync(join(root, 'CHANGELOG.md'), `${text}Hand edit.\n`)
      expect(script('--check').status).toBe(1)
      expect(script('--next').status).toBe(0)
      const next = readFileSync(join(root, 'CHANGELOG.md'), 'utf8')
      expect(next.startsWith(text.slice(0, text.indexOf('## ')))).toBe(true)
      expect(next).toContain('## 1.1.0\n')
      expect(next).toContain('add a second command')
      expect(script('--check').status).toBe(0)
      // Merging the release pull request and tagging it must not invalidate the file.
      git('tag', 'v1.1.0')
      expect(script('--check').status).toBe(0)
      expect(readFileSync(join(root, 'CHANGELOG.md'), 'utf8')).toBe(next)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
