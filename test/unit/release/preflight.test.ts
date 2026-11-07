import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import pkg from '../../../package.json' with { type: 'json' }
import { releaseSource } from '../../../src/release/history.js'
import { releasePreflight } from '../../../src/release/preflight.js'

function inputs() {
  return {
    version: '1.0.0',
    builtVersion: '1.0.0',
    package: {
      name: 'wholeloop',
      version: '1.0.0',
      private: false,
      repository: { url: 'git+https://github.com/fixture/wholeloop.git' },
    },
    lock: {
      name: 'wholeloop',
      version: '1.0.0',
      packages: { '': { name: 'wholeloop', version: '1.0.0' } },
    },
    context: {
      schema: 'wholeloop/release-context@1',
      repository: 'fixture/wholeloop',
      public: true,
      defaultBranch: 'main',
      ref: 'refs/heads/main',
      commit: 'a'.repeat(40),
      event: 'workflow_dispatch',
      workflow: 'release.yml',
    },
    source: { head: 'a'.repeat(40), clean: true, indexClean: true },
  }
}

describe('local release consistency preflight', () => {
  it('returns an explicit non-publishing plan, not authorization or provenance', () => {
    expect(releasePreflight(inputs())).toMatchObject({
      schema: 'wholeloop/release-preflight@1',
      status: 'ready',
      version: '1.0.0',
      tag: 'v1.0.0',
      npmTag: 'latest',
      reasons: [],
      publication: 'not-performed',
    })
    expect(releasePreflight(inputs()).limitations.join(' ')).toContain('not permission')
    const prerelease = inputs()
    prerelease.version =
      prerelease.builtVersion =
      prerelease.package.version =
      prerelease.lock.version =
      prerelease.lock.packages[''].version =
        '1.0.0-rc.1'
    expect(releasePreflight(prerelease).npmTag).toBe('next')
  })
  it.each([
    'package-name',
    'version-mismatch',
    'built-version',
    'lock-mismatch',
    'lock-root',
    'package-private',
    'repository-private',
    'repository-mismatch',
    'repository-url',
    'not-default-branch',
    'not-release-event',
    'commit-mismatch',
    'source-dirty',
    'source-index-flags',
  ])('blocks %s without exposing arbitrary metadata', (reason) => {
    const input = inputs()
    if (reason === 'package-name') input.package.name = 'other'
    if (reason === 'version-mismatch') input.package.version = '0.0.0'
    if (reason === 'built-version') input.builtVersion = '0.0.0'
    if (reason === 'lock-mismatch') input.lock.version = '0.0.0'
    if (reason === 'lock-root') input.lock.packages[''].version = '0.0.0'
    if (reason === 'package-private') input.package.private = true
    if (reason === 'repository-private') input.context.public = false
    if (reason === 'repository-mismatch') input.context.repository = 'fixture/other'
    if (reason === 'repository-url')
      input.package.repository.url = 'https://example.com/fixture/wholeloop.git'
    if (reason === 'not-default-branch') input.context.ref = 'refs/heads/other'
    if (reason === 'not-release-event') input.context.event = 'pull_request'
    if (reason === 'commit-mismatch') input.context.commit = 'b'.repeat(40)
    if (reason === 'source-dirty') input.source.clean = false
    if (reason === 'source-index-flags') input.source.indexClean = false
    const result = releasePreflight(input)
    expect(result.status).toBe('blocked')
    expect(result.reasons).toContain(
      reason === 'built-version'
        ? 'version-mismatch'
        : reason === 'lock-root'
          ? 'lock-mismatch'
          : reason === 'repository-url'
            ? 'repository-mismatch'
            : reason,
    )
  })
  it('accepts the default-branch push that merges a release pull request', () => {
    const input = inputs()
    input.context.event = 'push'
    expect(releasePreflight(input)).toMatchObject({ status: 'ready', reasons: [] })
  })
  it.each(['1.0', '01.0.0', '1.0.0-01', '1.0.0+build.1', '1.0.0\nextra'])(
    'refuses invalid publication version %s',
    (version) => {
      expect(() => releasePreflight({ ...inputs(), version })).toThrow(/exact npm release version/)
    },
  )
  it('rejects malformed or over-sharing context without printing its contents', () => {
    const context = { ...inputs().context, detail: 'private-fixture-detail' }
    expect(() => releasePreflight({ ...inputs(), context })).toThrow(/contents omitted/)
    for (const changed of [
      { workflow: '../release.yml' },
      { commit: 'private-fixture-detail' },
      { repository: 'invalid|fixture' },
    ])
      expect(() =>
        releasePreflight({ ...inputs(), context: { ...inputs().context, ...changed } }),
      ).toThrow(/contents omitted/)
    expect(() =>
      releasePreflight({ ...inputs(), source: { head: 'invalid', clean: true, indexClean: true } }),
    ).toThrow(/exact source commit/)
  })
  it('executes compiled ready/blocked/invalid paths from exact clean Git fixtures without writes', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-release-preflight-')))
    const repository = join(root, 'source'),
      home = join(root, 'home')
    mkdirSync(repository)
    mkdirSync(home)
    const env = {
      ...process.env,
      HOME: home,
      GIT_CONFIG_GLOBAL: join(root, 'no-global'),
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 'Fixture',
      GIT_COMMITTER_NAME: 'Fixture',
      GIT_AUTHOR_EMAIL: 'fixture@example.com',
      GIT_COMMITTER_EMAIL: 'fixture@example.com',
    }
    const git = (...args: string[]) => {
      const r = spawnSync(
        'git',
        ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgSign=false', ...args],
        { cwd: repository, env, encoding: 'utf8' },
      )
      if (r.status) throw new Error('Fixture Git failed')
      return r.stdout.trim()
    }
    const contextFile = join(root, 'context.json')
    const cli = (...args: string[]) =>
      spawnSync(
        process.execPath,
        [
          resolve('dist/wl.mjs'),
          'release',
          'preflight',
          '--version',
          pkg.version,
          '--context',
          contextFile,
          '--json',
          ...args,
        ],
        {
          cwd: repository,
          env: {
            ...env,
            GIT_DIR: join(root, 'foreign-git'),
            GIT_WORK_TREE: join(root, 'foreign-worktree'),
            GIT_INDEX_FILE: join(root, 'foreign-index'),
          },
          encoding: 'utf8',
        },
      )
    try {
      git('init', '-b', 'main')
      const data = inputs()
      data.package.version = data.lock.version = data.lock.packages[''].version = pkg.version
      const packageText = JSON.stringify(data.package),
        lockText = JSON.stringify(data.lock)
      writeFileSync(join(repository, 'package.json'), packageText)
      writeFileSync(join(repository, 'package-lock.json'), lockText)
      writeFileSync(join(repository, '.gitignore'), 'dist/\n')
      git('add', '.')
      git(
        'commit',
        '-m',
        'feat: seed release preflight fixture',
        '-m',
        'Bind source metadata for read-only release consistency checks.',
      )
      data.context.commit = git('rev-parse', 'HEAD')
      const refs = git('show-ref')
      writeFileSync(contextFile, JSON.stringify(data.context))
      const ready = cli()
      expect(ready.status, ready.stdout + ready.stderr).toBe(0)
      expect(JSON.parse(ready.stdout)).toMatchObject({
        status: 'ready',
        commit: data.context.commit,
        publication: 'not-performed',
      })
      mkdirSync(join(repository, 'dist'))
      writeFileSync(join(repository, 'dist/fixture.txt'), 'Ignored build output\n')
      expect(releaseSource(repository)).toEqual({
        head: data.context.commit,
        clean: true,
        indexClean: true,
      })
      for (const flag of ['assume-unchanged', 'skip-worktree']) {
        git('update-index', `--${flag}`, 'package.json')
        const concealed = cli()
        expect(concealed.status).toBe(3)
        expect(JSON.parse(concealed.stdout).reasons).toContain('source-index-flags')
        git('update-index', `--no-${flag}`, 'package.json')
      }
      const monitor = join(root, 'monitor.cjs'),
        marker = join(root, 'monitor-ran')
      writeFileSync(
        monitor,
        `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'fixture');process.stdout.write('0\\0')\n`,
      )
      const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
      git('config', 'core.fsmonitor', `${quote(process.execPath)} ${quote(monitor)}`)
      expect(cli().status).toBe(0)
      expect(existsSync(marker)).toBe(false)
      // Prove this is an executable monitor, rather than passing because its fixture command is broken.
      spawnSync('git', ['status', '--porcelain'], { cwd: repository, env, encoding: 'utf8' })
      expect(existsSync(marker)).toBe(true)
      git('config', '--unset', 'core.fsmonitor')
      writeFileSync(join(repository, 'private-fixture-path.txt'), 'Untracked fixture data\n')
      const dirty = cli()
      expect(dirty.status).toBe(3)
      expect(JSON.parse(dirty.stdout).reasons).toContain('source-dirty')
      expect(dirty.stdout + dirty.stderr).not.toContain('private-fixture-path')
      unlinkSync(join(repository, 'private-fixture-path.txt'))
      data.context.public = false
      writeFileSync(contextFile, JSON.stringify(data.context))
      const blocked = cli()
      expect(blocked.status).toBe(3)
      expect(JSON.parse(blocked.stdout).reasons).toContain('repository-private')
      writeFileSync(contextFile, 'private-fixture-detail')
      const invalid = cli()
      expect(invalid.status).toBe(3)
      expect(invalid.stdout + invalid.stderr).not.toContain('private-fixture-detail')
      const preserved = join(root, 'preserved-context.json')
      writeFileSync(preserved, JSON.stringify(inputs().context))
      unlinkSync(contextFile)
      symlinkSync(preserved, contextFile)
      expect(cli().status).toBe(3)
      expect(readFileSync(join(repository, 'package.json'), 'utf8')).toBe(packageText)
      expect(readFileSync(join(repository, 'package-lock.json'), 'utf8')).toBe(lockText)
      expect(git('status', '--porcelain')).toBe('')
      expect(git('show-ref')).toBe(refs)
      expect(readdirSync(home)).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
