import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkCommit, parseConventionalSubject } from '../../../src/git/commit.js'
import { releaseHistory } from '../../../src/release/history.js'
import { releaseNotes } from '../../../src/release/notes.js'

const commit = (message: string, digit = 'a') => ({ sha: digit.repeat(40), message })
describe('Conventional Commit release drafts', () => {
  it('shares the existing subject grammar without relaxing commit hygiene', () => {
    expect(parseConventionalSubject('feat(api)!: replace a field')).toEqual({
      type: 'feat',
      scope: 'api',
      breaking: true,
      description: 'replace a field',
    })
    expect(
      checkCommit(
        'feat(api)!: replace a field\n\nPreserve a consistent contract. Verified fixtures.',
      ),
    ).toEqual([])
    expect(checkCommit('feat: add a field')).not.toEqual([])
    for (const subject of ['feat: Uppercase', 'feat: trailing period.', 'feature: add a field'])
      expect(parseConventionalSubject(subject)).toBeUndefined()
  })
  it('groups changes and detects breaking intent without copying bodies or attribution trailers', () => {
    const notes = releaseNotes(
      [
        commit('feat(api): add a field\n\nBody-only fixture detail.'),
        commit('fix(core)!: remove obsolete behavior\n\nPreserve the supported path.', 'b'),
        commit(
          'refactor(core): rename a field\n\nBREAKING CHANGE: Body-only migration detail.',
          'c',
        ),
        commit('docs: explain the new field\n\nBody-only note.', 'd'),
      ],
      '1.0.0',
    )
    expect(notes.impact).toBe('major')
    expect(notes.groups.map((group) => group.title)).toEqual([
      'Breaking changes',
      'Features',
      'Documentation',
    ])
    expect(notes.markdown).not.toContain('Body-only')
    expect(notes.count).toBe(4)
    expect(notes.publication).toBe('not-performed')
  })
  it.each([
    { subject: 'feat: add support', impact: 'minor' },
    { subject: 'fix: correct output', impact: 'patch' },
    { subject: 'perf: reduce allocations', impact: 'patch' },
    { subject: 'revert: restore behavior', impact: 'patch' },
    { subject: 'chore: maintain fixtures', impact: 'none' },
  ])('classifies $subject without changing the version', ({ subject, impact }) => {
    const notes = releaseNotes([commit(subject)], '0.0.0')
    expect(notes).toMatchObject({ impact, version: '0.0.0', status: 'draft' })
  })
  it('reports rejected identities without copying unsafe subjects into the draft', () => {
    const notes = releaseNotes(
      [commit('legacy fixture subject'), commit('docs: generated with helper', 'b')],
      '1.0.0',
    )
    expect(notes.status).toBe('needs-review')
    expect(notes.rejected.map((item) => item.reason)).toEqual([
      'non-conventional-subject',
      'tool-attribution',
    ])
    expect(notes.markdown).not.toContain('legacy fixture subject')
    expect(notes.markdown).not.toContain('generated with')
  })
  it('escapes historical markup and accepts semantic prerelease/build labels', () => {
    const notes = releaseNotes([commit('feat: add <b>[field]</b>')], '1.0.0-rc.1+build.2')
    expect(notes.markdown).toContain('\\<b\\>\\[field\\]\\</b\\>')
    expect(releaseNotes([], '1.0.0').markdown).toContain('No changes')
  })
  it.each(['1.0', '01.0.0', '1.0.0-01', '1.0.0-a..b', '1.0.0\ninjected'])(
    'refuses invalid release label %s',
    (version) => {
      expect(() => releaseNotes([], version)).toThrow(/semantic release version/)
    },
  )
  it('rejects duplicate, malformed and oversized input without leaking contents', () => {
    expect(() =>
      releaseNotes([commit('feat: add support'), commit('fix: correct output')], '1.0.0'),
    ).toThrow(/duplicate/)
    expect(() =>
      releaseNotes([{ sha: 'unknown', message: 'private fixture body' }], '1.0.0'),
    ).toThrow(/contents omitted/)
    expect(() => releaseNotes([commit('x'.repeat(65537))], '1.0.0')).toThrow(/oversized/)
    expect(() => releaseNotes(Array(1001).fill(commit('feat: add support')), '1.0.0')).toThrow(
      /bounded/,
    )
  })
})

describe('complete local Git release history', () => {
  it('pins initial/ranged drafts, refuses incomplete history and keeps files/refs unchanged', () => {
    const root = mkdtempSync(join(tmpdir(), 'wholeloop-release-notes-'))
    const env = {
      ...process.env,
      GIT_CONFIG_GLOBAL: join(root, 'no-global'),
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 'Fixture',
      GIT_COMMITTER_NAME: 'Fixture',
      GIT_AUTHOR_EMAIL: 'fixture@example.com',
      GIT_COMMITTER_EMAIL: 'fixture@example.com',
    }
    const git = (...args: string[]) => {
      const result = spawnSync(
        'git',
        ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgSign=false', ...args],
        { cwd: root, env, encoding: 'utf8' },
      )
      if (result.status !== 0) throw new Error('Fixture Git failed')
      return result.stdout.trim()
    }
    const cli = (...args: string[]) =>
      spawnSync(process.execPath, [resolve('dist/wl.mjs'), 'release', 'notes', ...args], {
        cwd: root,
        env,
        encoding: 'utf8',
      })
    try {
      git('init', '-b', 'main')
      writeFileSync(join(root, 'README.md'), 'Release history fixture\n')
      git('add', '.')
      git(
        'commit',
        '-m',
        'feat: seed release fixture',
        '-m',
        'Pin an isolated repository for actual history checks.',
      )
      const first = git('rev-parse', 'HEAD')
      git(
        'commit',
        '--allow-empty',
        '-m',
        'fix(api): correct the response',
        '-m',
        'Keep response identity stable. Verified fixture behavior.',
      )
      const second = git('rev-parse', 'HEAD')
      const before = git('status', '--porcelain')
      const refs = git('show-ref')
      const history = releaseHistory(root, first)
      expect(history.from).toBe(first)
      expect(history.to).toBe(second)
      expect(history.commits.map((item) => item.sha)).toEqual([second])
      const draft = cli('--from', first, '--version', '1.0.0', '--json')
      expect(draft.status, draft.stdout + draft.stderr).toBe(0)
      expect(JSON.parse(draft.stdout)).toMatchObject({
        from: first,
        to: second,
        impact: 'patch',
        count: 1,
        version: '1.0.0',
      })
      const initial = cli('--initial', '--markdown')
      expect(initial.status, initial.stderr).toBe(0)
      expect(initial.stdout).toContain('seed release fixture')
      expect(initial.stdout).not.toContain('Verified fixture behavior')
      expect(releaseHistory(root, first, first).commits).toEqual([])
      expect(() => releaseHistory(root, second, first)).toThrow(/ancestor/)
      expect(() => releaseHistory(root, 'missing-fixture-ref')).toThrow(/diagnostics omitted/)
      expect(cli('--json').status).toBe(4)
      expect(cli('--initial', '--from', first, '--json').status).toBe(4)
      expect(cli('--initial', '--markdown', '--json').status).toBe(4)
      expect(git('status', '--porcelain')).toBe(before)
      expect(git('show-ref')).toBe(refs)
      expect(readFileSync(join(root, 'README.md'), 'utf8')).toBe('Release history fixture\n')
      writeFileSync(join(root, '.git/shallow'), `${first}\n`)
      expect(() => releaseHistory(root, undefined)).toThrow(/shallow clone/)
      unlinkSync(join(root, '.git/shallow'))
      git('config', 'remote.fixture.promisor', 'true')
      expect(() => releaseHistory(root, undefined)).toThrow(/lazy object fetching/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
