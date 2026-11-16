import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  lstatSync,
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
import { delimiter, dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import pkg from '../../../package.json' with { type: 'json' }
import {
  RELEASE_FILES,
  type ReleaseBundle,
  releaseDigest,
  verifyReleaseBundle,
} from '../../../src/release/bundle.js'
import type { releasePreflight } from '../../../src/release/preflight.js'

function inputs() {
  const files = new Map<string, Uint8Array>(RELEASE_FILES.map((file) => [file, Buffer.from(file)]))
  const plan: ReturnType<typeof releasePreflight> = {
    schema: 'wholeloop/release-preflight@1',
    status: 'ready',
    version: '1.0.0',
    tag: 'v1.0.0',
    npmTag: 'latest',
    repository: 'fixture/wholeloop',
    commit: 'a'.repeat(40),
    workflow: 'release.yml',
    reasons: [],
    publication: 'not-performed',
    limitations: [],
  }
  const manifest: ReleaseBundle = {
    schema: 'wholeloop/release-bundle@1',
    repository: plan.repository,
    commit: plan.commit,
    workflow: plan.workflow,
    version: plan.version,
    tag: plan.tag,
    npmTag: 'latest',
    from: 'initial',
    files: [...files].map(([path, bytes]) => ({
      path,
      bytes: bytes.byteLength,
      sha256: releaseDigest(bytes),
    })),
  }
  return { files, plan, manifest }
}

describe('prepared release byte contract', () => {
  it('verifies exact payloads while retaining the non-authorization boundary', () => {
    const { files, plan, manifest } = inputs()
    expect(verifyReleaseBundle(manifest, files, plan)).toMatchObject({
      status: 'verified',
      publication: 'not-performed',
      commit: plan.commit,
    })
  })
  it.each([
    'digest',
    'size',
    'duplicate',
    'missing',
    'extra',
    'path',
    'blocked',
    'context',
    'from',
    'metadata',
  ])('refuses changed %s', (kind) => {
    const { files, plan, manifest } = inputs()
    if (kind === 'digest') files.set('wl.mjs', Buffer.from('edited'))
    const first = manifest.files[0]
    if (!first) throw new Error('Missing fixture payload')
    if (kind === 'size') first.bytes++
    if (kind === 'duplicate') manifest.files.push(first)
    if (kind === 'missing') files.delete('wl.mjs')
    if (kind === 'extra') files.set('unknown', Buffer.from('extra'))
    if (kind === 'path') first.path = '../escape'
    if (kind === 'blocked') plan.status = 'blocked'
    if (kind === 'context') manifest.commit = 'b'.repeat(40)
    if (kind === 'from') manifest.from = 'HEAD~1'
    if (kind === 'metadata') Object.assign(manifest, { privateDetail: 'fixture-detail' })
    expect(() => verifyReleaseBundle(manifest, files, plan)).toThrow()
  })
})

describe('release host preparation and activation transport', () => {
  it('packs actual archives offline, checks immutable bytes and simulates publication without services', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-release-bundle-test-')))
    const repository = join(root, 'repository'),
      home = join(root, 'home')
    mkdirSync(repository)
    mkdirSync(home)
    mkdirSync(join(repository, 'scripts'))
    mkdirSync(join(repository, 'dist'))
    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      HOME: home,
      PATH: [dirname(process.execPath), process.env.PATH].join(delimiter),
      GIT_CONFIG_GLOBAL: join(root, 'no-global'),
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 'Fixture',
      GIT_COMMITTER_NAME: 'Fixture',
      GIT_AUTHOR_EMAIL: 'fixture@example.com',
      GIT_COMMITTER_EMAIL: 'fixture@example.com',
      GITHUB_ACTIONS: 'false',
      GITHUB_OUTPUT: join(root, 'outputs'),
      TMPDIR: root,
    }
    const git = (...args: string[]) => {
      const result = spawnSync(
        'git',
        ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgSign=false', ...args],
        { cwd: repository, env: environment, encoding: 'utf8' },
      )
      if (result.status) throw new Error('Fixture Git failed')
      return result.stdout.trim()
    }
    const script = join(repository, 'scripts/release.mjs')
    const contextFile = join(root, 'context.json'),
      bundle = join(root, 'bundle')
    const run = (args: string[], env: NodeJS.ProcessEnv = environment) =>
      spawnSync(process.execPath, [script, ...args], {
        cwd: repository,
        env,
        encoding: 'utf8',
        timeout: 120000,
      })
    try {
      const sourcePkg = {
        ...pkg,
        private: false,
        repository: { type: 'git', url: 'git+https://github.com/fixture/wholeloop.git' },
      }
      writeFileSync(join(repository, 'package.json'), JSON.stringify(sourcePkg))
      writeFileSync(
        join(repository, 'package-lock.json'),
        JSON.stringify({
          name: 'wholeloop',
          version: pkg.version,
          packages: { '': { name: 'wholeloop', version: pkg.version } },
        }),
      )
      for (const file of [
        'README.md',
        'LICENSE',
        'dist/wl.mjs',
        'dist/wl-runner.mjs',
        'scripts/release.mjs',
        'scripts/changelog.mjs',
        'scripts/regular-file.mjs',
      ])
        copyFileSync(resolve(file), join(repository, file))
      writeFileSync(join(repository, '.gitignore'), 'dist/\n')
      git('init', '-b', 'main')
      git('add', '.')
      git(
        'commit',
        '-m',
        'feat: seed prepared release fixture',
        '-m',
        'Exercise offline packaging without publication.',
      )
      const commit = git('rev-parse', 'HEAD'),
        refs = git('show-ref')
      const context = {
        schema: 'wholeloop/release-context@1',
        repository: 'fixture/wholeloop',
        public: true,
        defaultBranch: 'main',
        ref: 'refs/heads/main',
        commit,
        event: 'workflow_dispatch',
        workflow: 'release.yml',
      }
      writeFileSync(contextFile, JSON.stringify(context))
      const sbom = join(root, 'sbom.cdx.json')
      writeFileSync(
        sbom,
        JSON.stringify({
          bomFormat: 'CycloneDX',
          specVersion: '1.5',
          metadata: { component: { name: 'wholeloop', version: pkg.version } },
          components: [],
        }),
      )
      expect(run(['prepare', pkg.version, contextFile, join(root, 'no-sbom')]).status).toBe(1)
      const prepared = run(['prepare', pkg.version, contextFile, bundle], {
        ...environment,
        RELEASE_SBOM: sbom,
      })
      expect(prepared.status, prepared.stdout + prepared.stderr).toBe(0)
      const receipt = JSON.parse(prepared.stdout)
      expect(receipt).toMatchObject({ status: 'verified', commit, publication: 'not-performed' })
      expect(readdirSync(bundle).sort()).toEqual(['bundle.json', ...RELEASE_FILES].sort())
      expect(readFileSync(join(root, 'outputs'), 'utf8')).toContain(`sha256=${receipt.sha256}`)
      expect(JSON.parse(readFileSync(join(bundle, 'bundle.json'), 'utf8')).from).toBe('initial')
      const extracted = join(root, 'extracted')
      mkdirSync(extracted)
      const tar = spawnSync(
        'tar',
        ['-xzf', join(bundle, 'wholeloop-native.tar.gz'), '-C', extracted],
        { encoding: 'utf8' },
      )
      expect(tar.status, tar.stderr).toBe(0)
      expect(existsSync(join(extracted, '.claude-plugin/marketplace.json'))).toBe(true)
      const nativeManifest = JSON.parse(
        readFileSync(join(extracted, 'wholeloop-artifacts.json'), 'utf8'),
      )
      expect(nativeManifest.targets).toHaveLength(7)
      for (const entry of nativeManifest.files) {
        expect(lstatSync(join(extracted, entry.path)).mode & 0o777).toBe(entry.mode)
        expect(releaseDigest(readFileSync(join(extracted, entry.path)))).toBe(entry.sha256)
      }
      const verify = (sha = receipt.sha256) =>
        spawnSync(
          process.execPath,
          [
            resolve('dist/wl.mjs'),
            'release',
            'verify',
            bundle,
            '--context',
            contextFile,
            '--sha256',
            sha,
            '--json',
          ],
          { cwd: repository, env: environment, encoding: 'utf8' },
        )
      expect(verify().status).toBe(0)
      expect(verify('0'.repeat(64)).status).toBe(3)
      const notes = readFileSync(join(bundle, 'release-notes.md'))
      writeFileSync(join(bundle, 'release-notes.md'), 'private-fixture-detail')
      const edited = verify()
      expect(edited.status).toBe(3)
      expect(edited.stdout + edited.stderr).not.toContain('private-fixture-detail')
      writeFileSync(join(bundle, 'release-notes.md'), notes)
      writeFileSync(join(bundle, 'unknown'), 'unknown')
      expect(verify().status).toBe(3)
      unlinkSync(join(bundle, 'unknown'))
      const preserved = join(root, 'notes.md')
      copyFileSync(join(bundle, 'release-notes.md'), preserved)
      unlinkSync(join(bundle, 'release-notes.md'))
      symlinkSync(preserved, join(bundle, 'release-notes.md'))
      expect(verify().status).toBe(3)
      unlinkSync(join(bundle, 'release-notes.md'))
      copyFileSync(preserved, join(bundle, 'release-notes.md'))
      expect(run(['prepare', pkg.version, contextFile, bundle]).status).toBe(1)
      expect(run(['publish', bundle, receipt.sha256, contextFile]).status).toBe(1)
      // Synthetic executables log only fixture command data; no auth or external operation is used.
      const bin = join(root, 'bin')
      mkdirSync(bin)
      const calls = join(root, 'calls.jsonl'),
        fakeNpm = join(root, 'npm.cjs')
      const logger = `require('node:fs').appendFileSync(${JSON.stringify(calls)},JSON.stringify(process.argv.slice(2))+'\\n');\n`
      const tagInput = join(root, 'tag-input.json')
      writeFileSync(
        join(bin, 'gh'),
        `#!${process.execPath}\n${logger}
if(process.argv.includes('POST')) {
  require('node:fs').writeFileSync(${JSON.stringify(tagInput)}, require('node:fs').readFileSync(0))
  if(process.env.FIXTURE_FAIL_TAG)process.exit(1)
} else if(process.argv[2]==='api') process.stdout.write(JSON.stringify({repository:'fixture/wholeloop',public:true,defaultBranch:'main'}))
`,
        { mode: 0o755 },
      )
      writeFileSync(fakeNpm, `${logger}if(process.env.FIXTURE_FAIL_NPM)process.exit(1)\n`)
      const synthetic = {
        ...environment,
        GITHUB_ACTIONS: 'true',
        npm_execpath: fakeNpm,
        PATH: [bin, environment.PATH].join(delimiter),
      }
      const simulated = run(['publish', bundle, receipt.sha256, contextFile], synthetic)
      expect(simulated.status, simulated.stdout + simulated.stderr).toBe(0)
      expect(JSON.parse(readFileSync(tagInput, 'utf8'))).toEqual({
        ref: `refs/tags/v${pkg.version}`,
        sha: commit,
      })
      const operations = readFileSync(calls, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
      expect(operations).toHaveLength(4)
      expect(operations[0]).toEqual(
        expect.arrayContaining([
          'api',
          'repos/fixture/wholeloop/git/refs',
          '--method',
          'POST',
          '--input',
          '-',
        ]),
      )
      expect(operations[1]).toEqual(
        expect.arrayContaining([
          'release',
          'create',
          `v${pkg.version}`,
          '--draft',
          '--verify-tag',
          '--target',
          commit,
          '--notes-file',
        ]),
      )
      // A pre-release goes to next and never becomes the latest GitHub release;
      // the expectation follows the package version, as the release does.
      const npmTag = pkg.version.includes('-') ? 'next' : 'latest'
      expect(operations[2]).toEqual(
        expect.arrayContaining([
          'publish',
          join(bundle, 'wholeloop-npm.tgz'),
          '--provenance',
          '--ignore-scripts',
          '--tag',
          npmTag,
        ]),
      )
      expect(operations[3]).toEqual(
        expect.arrayContaining([
          'release',
          'edit',
          '--draft=false',
          `--latest=${npmTag === 'latest'}`,
        ]),
      )
      unlinkSync(calls)
      expect(
        run(['publish', bundle, receipt.sha256, contextFile], {
          ...synthetic,
          FIXTURE_FAIL_NPM: '1',
        }).status,
      ).toBe(1)
      expect(readFileSync(calls, 'utf8').trim().split('\n')).toHaveLength(3)
      unlinkSync(calls)
      expect(
        run(['publish', bundle, receipt.sha256, contextFile], {
          ...synthetic,
          FIXTURE_FAIL_TAG: '1',
        }).status,
      ).toBe(1)
      expect(readFileSync(calls, 'utf8').trim().split('\n')).toHaveLength(1)
      unlinkSync(calls)
      expect(run(['publish', bundle, '0'.repeat(64), contextFile], synthetic).status).toBe(1)
      expect(existsSync(calls)).toBe(false)
      const observedContext = join(root, 'observed-context.json')
      const observed = run(['context', observedContext], {
        ...synthetic,
        GITHUB_EVENT_NAME: 'workflow_dispatch',
        GITHUB_REPOSITORY: 'fixture/wholeloop',
        GITHUB_REF: 'refs/heads/main',
        GITHUB_SHA: commit,
        GITHUB_WORKFLOW_REF: 'fixture/wholeloop/.github/workflows/release.yml@refs/heads/main',
      })
      expect(observed.status, observed.stdout + observed.stderr).toBe(0)
      expect(JSON.parse(readFileSync(observedContext, 'utf8'))).toEqual(context)
      expect(git('status', '--porcelain')).toBe('')
      expect(git('show-ref')).toBe(refs)
      expect(readdirSync(home)).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('keeps workflow preparation reviewable and activation behind the environment', () => {
    const workflow = parse(readFileSync('.github/workflows/release.yml', 'utf8'))
    expect(Object.keys(workflow.on)).toEqual(['push', 'workflow_dispatch'])
    expect(workflow.on.push).toEqual({ branches: ['main'], paths: ['package.json'] })
    expect(workflow.on.workflow_dispatch.inputs.publish.default).toBe(false)
    expect(workflow.permissions).toEqual({ contents: 'read' })
    expect(workflow.jobs.prepare.needs).toBe('plan')
    expect(workflow.jobs.prepare.if).toBe("needs.plan.outputs.release == 'true'")
    expect(workflow.jobs.publish.needs).toEqual(['plan', 'prepare'])
    expect(workflow.jobs.publish.environment).toBe('release')
    expect(workflow.jobs.publish.if).toBe("needs.plan.outputs.publish == 'true'")
    expect(workflow.jobs.publish.permissions).toEqual({ contents: 'write', 'id-token': 'write' })
    // Only publication and failure marking write; every other job reads.
    for (const [name, job] of Object.entries(workflow.jobs) as [
      string,
      { permissions?: unknown },
    ][])
      if (!['publish', 'mark-failed'].includes(name)) expect(job.permissions).toBeUndefined()
    for (const job of Object.values(workflow.jobs) as {
      steps: { uses?: string; run?: string; with?: Record<string, unknown> }[]
    }[]) {
      for (const step of job.steps) {
        if (step.uses) expect(step.uses).toMatch(/@[a-f0-9]{40}$/)
        if (step.run) expect(step.run).not.toContain('${{')
        if (step.uses?.startsWith('actions/checkout@'))
          expect(step.with?.['persist-credentials']).toBe(false)
        if (step.uses?.startsWith('actions/setup-node@'))
          expect(step.with?.['package-manager-cache']).toBe(false)
      }
    }
    const download = workflow.jobs.publish.steps.find((step: { uses?: string }) =>
      step.uses?.startsWith('actions/download-artifact@'),
    )
    expect(download.with['artifact-ids']).toBe(
      ['$', '{{ needs.prepare.outputs.artifact }}'].join(''),
    )
    expect(download.with['digest-mismatch']).toBe('error')
    for (const name of ['publish', 'verify', 'mark-failed'])
      expect(
        workflow.jobs[name].steps.some((step: { run?: string }) =>
          /npm ci|npm run build|npm run check|npm pack/.test(step.run ?? ''),
        ),
      ).toBe(false)
  })
})
