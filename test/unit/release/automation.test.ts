import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parse } from 'yaml'

// Release automation (P7-08) runs real Git and npm against a fixture
// repository; GitHub and the registry are synthetic executables that log
// their arguments and standard input, so no service is contacted.
let root: string
let repository: string
let environment: NodeJS.ProcessEnv
let calls: string

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-release-automation-')))
  repository = join(root, 'repository')
  calls = join(root, 'calls.jsonl')
  mkdirSync(join(repository, 'scripts'), { recursive: true })
  mkdirSync(join(repository, 'dist'))
  mkdirSync(join(root, 'bin'))
  environment = {
    ...process.env,
    HOME: join(root, 'home'),
    PATH: [join(root, 'bin'), dirname(process.execPath), process.env.PATH].join(delimiter),
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
  for (const file of [
    'scripts/release.mjs',
    'scripts/changelog.mjs',
    'scripts/regular-file.mjs',
    'dist/wl.mjs',
  ])
    copyFileSync(resolve(file), join(repository, file))
  writeFileSync(join(repository, '.gitignore'), 'dist/\n')
  setVersion('1.0.0')
  git('init', '-q', '-b', 'main')
  commit('feat: add the first command')
  git('tag', 'v1.0.0')
  run(['scripts/changelog.mjs'], { node: true })
  commit('docs: record the first release in the changelog')
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

function git(...args: string[]) {
  const result = spawnSync(
    'git',
    ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgSign=false', ...args],
    { cwd: repository, env: environment, encoding: 'utf8' },
  )
  if (result.status) throw new Error(result.stderr)
  return result.stdout.trim()
}
function setVersion(version: string) {
  writeFileSync(
    join(repository, 'package.json'),
    `${JSON.stringify({ name: 'wholeloop', version, private: true }, null, 2)}\n`,
  )
  writeFileSync(
    join(repository, 'package-lock.json'),
    `${JSON.stringify(
      {
        name: 'wholeloop',
        version,
        lockfileVersion: 3,
        requires: true,
        packages: { '': { name: 'wholeloop', version } },
      },
      null,
      2,
    )}\n`,
  )
}
function commit(subject: string) {
  writeFileSync(join(repository, 'notes.txt'), subject)
  git('add', '.')
  git('commit', '-q', '-m', subject, '-m', 'Fixture body explaining the change.')
  return git('rev-parse', 'HEAD')
}
function run(args: string[], options: { node?: boolean; env?: NodeJS.ProcessEnv } = {}) {
  return spawnSync(
    process.execPath,
    options.node ? args : [join(repository, 'scripts/release.mjs'), ...args],
    { cwd: repository, env: { ...environment, ...options.env }, encoding: 'utf8', timeout: 60000 },
  )
}
const logged = () =>
  existsSync(calls)
    ? readFileSync(calls, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as { args: string[]; input: string })
    : []
// A logging executable: records argv and any standard input, then answers
// from the fixture table in the script body.
function fake(name: string, body: string) {
  const file = join(root, 'bin', name)
  writeFileSync(
    file,
    `#!${process.execPath}
const fs = require('node:fs'), args = process.argv.slice(2)
const input = args.includes('-') ? fs.readFileSync(0, 'utf8') : ''
fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify({ args, input }) + '\\n')
${body}
`,
    { mode: 0o755 },
  )
  return file
}
const actions = {
  GITHUB_ACTIONS: 'true',
  GITHUB_REPOSITORY: 'fixture/wholeloop',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_SERVER_URL: 'https://github.com',
  GITHUB_RUN_ID: '42',
}
const output = () => readFileSync(join(root, 'outputs'), 'utf8')

describe('release plan', () => {
  it('releases a push only when it changes the package version to an untagged one', () => {
    const released = git('rev-parse', 'HEAD')
    setVersion('1.1.0')
    commit('feat: add a second command')
    const push = (before: string) =>
      run(['plan'], { env: { GITHUB_EVENT_NAME: 'push', RELEASE_BEFORE: before } })
    const merged = push(released)
    expect(merged.status, merged.stderr).toBe(0)
    expect(JSON.parse(merged.stdout)).toEqual({
      release: true,
      version: '1.1.0',
      from: 'v1.0.0',
      publish: true,
    })
    expect(output()).toBe('release=true\nversion=1.1.0\nfrom=v1.0.0\npublish=true\n')
    const unchanged = git('rev-parse', 'HEAD')
    commit('fix: correct the second command')
    expect(JSON.parse(push(unchanged).stdout)).toMatchObject({ release: false, publish: false })
    expect(JSON.parse(push('0'.repeat(40)).stdout)).toMatchObject({ release: false })
    git('tag', 'v1.1.0')
    expect(JSON.parse(push(released).stdout)).toMatchObject({ release: false })
    expect(push('not-a-commit').status).toBe(1)
    expect(run(['plan'], { env: { GITHUB_EVENT_NAME: 'pull_request' } }).status).toBe(1)
  })

  it('passes an explicit dispatch through and refuses an inexact version', () => {
    const dispatch = (version: string) =>
      run(['plan'], {
        env: {
          GITHUB_EVENT_NAME: 'workflow_dispatch',
          RELEASE_VERSION: version,
          RELEASE_FROM: 'v1.0.0',
          RELEASE_PUBLISH: 'false',
        },
      })
    expect(JSON.parse(dispatch('1.1.0').stdout)).toEqual({
      release: true,
      version: '1.1.0',
      from: 'v1.0.0',
      publish: false,
    })
    expect(dispatch('1.1').status).toBe(1)
  })
})

describe('release pull request', () => {
  it('sets the version, regenerates the changelog and refuses a smaller change than the range needs', () => {
    commit('feat: add a second command')
    expect(run(['bump', '1.0.0']).status).toBe(1)
    expect(run(['bump', '1.0.1']).status).toBe(1)
    git('checkout', '--', '.')
    const bumped = run(['bump', '1.1.0'])
    expect(bumped.status, bumped.stderr).toBe(0)
    expect(JSON.parse(readFileSync(join(repository, 'package.json'), 'utf8')).version).toBe('1.1.0')
    expect(JSON.parse(readFileSync(join(repository, 'package-lock.json'), 'utf8')).version).toBe(
      '1.1.0',
    )
    const changelog = readFileSync(join(repository, 'CHANGELOG.md'), 'utf8')
    expect(changelog.indexOf('## 1.1.0\n')).toBeLessThan(changelog.indexOf('## 1.0.0\n'))
    expect(changelog).toContain('add a second command')
    expect(
      git('status', '--porcelain')
        .split('\n')
        .map((line) => line.trim())
        .sort(),
    ).toEqual(['M CHANGELOG.md', 'M package-lock.json', 'M package.json'])
    expect(git('tag', '--list')).toBe('v1.0.0')
  })

  it('commits the exact files through the API, then opens the pull request', () => {
    commit('feat: add a second command')
    expect(run(['bump', '1.1.0']).status).toBe(0)
    const index = { ...environment, GIT_INDEX_FILE: join(root, 'index') }
    const local = (...args: string[]) =>
      spawnSync('git', args, { cwd: repository, env: index, encoding: 'utf8' }).stdout.trim()
    local('read-tree', 'HEAD')
    local('add', '--', 'CHANGELOG.md', 'package.json', 'package-lock.json')
    const tree = local('write-tree')
    fake(
      'gh',
      `const sha = process.env.FIXTURE_TREE
if (args[1]?.endsWith('/git/trees')) process.stdout.write(JSON.stringify({ sha }))
if (args[1]?.endsWith('/git/commits')) process.stdout.write(JSON.stringify({ sha: 'c'.repeat(40), tree: { sha } }))
if (args[1]?.endsWith('/git/refs')) process.stdout.write('{}')`,
    )
    const workflow = { ...actions, RELEASE_PR_TOKEN: 'workflow' }
    const opened = run(['open-pr', '1.1.0'], { env: { ...workflow, FIXTURE_TREE: tree } })
    expect(opened.status, opened.stderr).toBe(0)
    const operations = logged()
    // No CI dispatch: a dispatched run never counted toward the required checks.
    expect(operations.map(({ args }) => args.slice(0, 2))).toEqual([
      ['api', 'repos/fixture/wholeloop/git/trees'],
      ['api', 'repos/fixture/wholeloop/git/commits'],
      ['api', 'repos/fixture/wholeloop/git/refs'],
      ['pr', 'create'],
    ])
    const [trees, commits, refs, pr] = operations
    expect(
      JSON.parse(trees?.input ?? '{}')
        .tree.map((entry: { path: string }) => entry.path)
        .sort(),
    ).toEqual(['CHANGELOG.md', 'package-lock.json', 'package.json'])
    const message = JSON.parse(commits?.input ?? '{}').message as string
    expect(message.split('\n')[0]).toBe('chore(release): v1.1.0')
    expect(message).toContain('since v1.0.0')
    expect(message.split('\n').every((line) => line.length <= 72)).toBe(true)
    const file = join(root, 'message')
    writeFileSync(file, message)
    const guard = spawnSync(
      process.execPath,
      [resolve('dist/wl.mjs'), 'guard', 'commit-msg', file],
      { encoding: 'utf8' },
    )
    expect(guard.status, guard.stdout + guard.stderr).toBe(0)
    expect(JSON.parse(refs?.input ?? '{}')).toEqual({
      ref: 'refs/heads/release/v1.1.0',
      sha: 'c'.repeat(40),
    })
    expect(pr?.args).toEqual(
      expect.arrayContaining(['--base', 'main', '--head', 'release/v1.1.0', '--body-file', '-']),
    )
    expect(pr?.input).toContain('its checks wait for a maintainer to approve the runs')

    // A release app token starts the pull request's own checks; the body says so.
    unlinkSync(calls)
    const app = { ...actions, RELEASE_PR_TOKEN: 'app', FIXTURE_TREE: tree }
    expect(run(['open-pr', '1.1.0'], { env: app }).status).toBe(0)
    expect(logged().at(-1)?.input).toContain('The required checks run on this pull request.')
    unlinkSync(calls)
    expect(run(['open-pr', '1.1.0'], { env: { ...actions, FIXTURE_TREE: tree } }).status).toBe(1)
    expect(logged()).toHaveLength(0)

    expect(
      run(['open-pr', '1.1.0'], { env: { ...workflow, FIXTURE_TREE: '0'.repeat(40) } }).status,
    ).toBe(1)
    expect(logged()).toHaveLength(1)
    unlinkSync(calls)
    writeFileSync(join(repository, 'extra.txt'), 'unexpected')
    expect(run(['open-pr', '1.1.0'], { env: { ...workflow, FIXTURE_TREE: tree } }).status).toBe(1)
    expect(logged()).toHaveLength(0)
    expect(run(['open-pr', '1.1.0'], { env: { FIXTURE_TREE: tree } }).status).toBe(1)
    expect(git('branch', '--list')).toBe('* main')
  })
})

describe('post-publication verification', () => {
  // The synthetic registry installs a stub that prints a version and a doctor
  // report chosen by the test, so each failure is one changed fact.
  function registry() {
    const npm = fake(
      'npm.cjs',
      `if (args.includes('install')) {
  // FIXTURE_UNPUBLISHED counts installs that fail as if npm had not served the version yet.
  const pending = process.env.FIXTURE_UNPUBLISHED
  if (pending) {
    const tries = (fs.existsSync(pending) ? Number(fs.readFileSync(pending, 'utf8')) : 0) + 1
    fs.writeFileSync(pending, String(tries))
    if (tries <= Number(process.env.FIXTURE_UNPUBLISHED_TRIES)) process.exit(1)
  }
  const prefix = args[args.indexOf('--prefix') + 1]
  fs.mkdirSync(prefix + '/bin', { recursive: true })
  fs.writeFileSync(prefix + '/bin/wl', '#!${process.execPath}\\n' +
    "if (process.argv[2] === '--version') console.log(process.env.FIXTURE_PRINTED ?? '1.1.0')\\n" +
    "else { const failing = process.env.FIXTURE_DOCTOR_FAIL; const client = process.env.FIXTURE_CLIENT === '1';" +
    " const checks = [['node', 'pass'], ['git', 'pass'], ['store', failing === 'store' ? 'fail' : 'pass'], ['cli.any', client ? 'pass' : 'fail']].map(([id, status]) => ({ id, status }));" +
    " const fails = checks.some((check) => check.status === 'fail');" +
    " console.log(JSON.stringify({ schema: process.env.FIXTURE_SCHEMA ?? 'wholeloop/doctor@1', status: fails ? 'needs-attention' : 'observed', checks })); process.exitCode = fails ? 3 : 0 }\\n", { mode: 0o755 })
}
if (args.includes('view')) process.stdout.write(JSON.stringify({ latest: process.env.FIXTURE_LATEST ?? '1.1.0', next: '1.1.0-rc.1' }))`,
    )
    return { npm_execpath: npm }
  }

  // A clean runner has no coding client: doctor reports needs-attention with
  // exit 3 and only cli.any failing, which is a successful installation.
  it('installs the published version into an empty prefix and runs it', () => {
    const verified = run(['verify-published', '1.1.0'], { env: registry() })
    expect(verified.status, verified.stderr).toBe(0)
    expect(JSON.parse(verified.stdout)).toEqual({
      schema: 'wholeloop/release-verification@1',
      status: 'verified',
      version: '1.1.0',
      npmTag: 'latest',
    })
    const install = logged()[0]?.args ?? []
    expect(install).toEqual(
      expect.arrayContaining([
        'install',
        '--global',
        '--prefer-online',
        '--ignore-scripts',
        '--registry',
        'https://registry.npmjs.org/',
        'wholeloop@1.1.0',
      ]),
    )
    expect(
      run(['verify-published', '1.1.0-rc.1'], {
        env: { ...registry(), FIXTURE_PRINTED: '1.1.0-rc.1' },
      }).status,
    ).toBe(0)
    // A runner that does have a coding client reports observed with exit 0.
    expect(
      run(['verify-published', '1.1.0'], { env: { ...registry(), FIXTURE_CLIENT: '1' } }).status,
    ).toBe(0)
  })

  // npm served 1.0.0's tarball about eight and a half minutes after publication.
  it('waits for the registry to serve the version, then gives up after twenty attempts', () => {
    const counter = join(root, 'install-attempts')
    const waiting = { ...registry(), RELEASE_VERIFY_PAUSE_MS: '0', FIXTURE_UNPUBLISHED: counter }
    const late = run(['verify-published', '1.1.0'], {
      env: { ...waiting, FIXTURE_UNPUBLISHED_TRIES: '12' },
    })
    expect(late.status, late.stderr).toBe(0)
    expect(readFileSync(counter, 'utf8')).toBe('13')
    unlinkSync(counter)
    const never = run(['verify-published', '1.1.0'], {
      env: { ...waiting, FIXTURE_UNPUBLISHED_TRIES: '99' },
    })
    expect(never.status).toBe(1)
    expect(readFileSync(counter, 'utf8')).toBe('20')
  })

  it.each([
    ['a different printed version', { FIXTURE_PRINTED: '1.0.0' }],
    ['a failing store check', { FIXTURE_DOCTOR_FAIL: 'store' }],
    ['a report without the doctor schema', { FIXTURE_SCHEMA: 'other' }],
    ['a dist-tag on another version', { FIXTURE_LATEST: '1.0.0' }],
  ])('fails on %s', (_, facts) => {
    const failed = run(['verify-published', '1.1.0'], { env: { ...registry(), ...facts } })
    expect(failed.status).toBe(1)
    expect(failed.stderr).toContain('release: failed at post-publication')
  })
})

describe('failed release marking', () => {
  it('prepends a caution with the run and recovery links once, and drops the Latest badge', () => {
    fake('gh', `if (args[1] === 'view') process.stdout.write(process.env.FIXTURE_BODY ?? '')`)
    const marked = run(['mark-failed', '1.1.0'], { env: { ...actions, FIXTURE_BODY: '# Notes' } })
    expect(marked.status, marked.stderr).toBe(0)
    const [, edit] = logged()
    expect(edit?.args).toEqual(
      expect.arrayContaining([
        'edit',
        'v1.1.0',
        '--title',
        'v1.1.0 (failed post-publication check)',
        '--prerelease',
        '--latest=false',
      ]),
    )
    expect(edit?.input).toMatch(/^> \[!CAUTION\]\n> \*\*This release failed/)
    expect(edit?.input).toContain('https://github.com/fixture/wholeloop/actions/runs/42')
    expect(edit?.input).toContain(
      'https://github.com/fixture/wholeloop/blob/v1.1.0/docs/contributing/releasing.md#recover-from-a-bad-release',
    )
    expect(edit?.input.endsWith('# Notes')).toBe(true)
    unlinkSync(calls)
    expect(
      run(['mark-failed', '1.1.0'], { env: { ...actions, FIXTURE_BODY: edit?.input ?? '' } })
        .status,
    ).toBe(0)
    expect(logged()[1]?.input).toBe(edit?.input)
    expect(run(['mark-failed', '1.1.0'], { env: { GITHUB_ACTIONS: 'false' } }).status).toBe(1)
  })
})

describe('release workflows', () => {
  const release = parse(readFileSync('.github/workflows/release.yml', 'utf8'))
  const releasePr = parse(readFileSync('.github/workflows/release-pr.yml', 'utf8'))

  it('orders plan, preparation, approval, publication, verification and failure marking', () => {
    const needs = (name: string) => [release.jobs[name].needs ?? []].flat()
    expect(needs('plan')).toEqual([])
    expect(needs('prepare')).toEqual(['plan'])
    expect(needs('publish')).toEqual(['plan', 'prepare'])
    expect(needs('verify')).toEqual(['plan', 'publish'])
    expect(needs('mark-failed')).toEqual(['plan', 'publish', 'verify'])
    // The environment approval is the only manual gate, and it sits before npm.
    const gated = Object.entries(release.jobs).filter(
      ([, job]) => (job as { environment?: string }).environment,
    )
    expect(gated.map(([name]) => name)).toEqual(['publish'])
    expect(release.jobs['mark-failed'].if).toBe(
      "always() && needs.publish.result == 'success' && needs.verify.result != 'success'",
    )
    expect(release.jobs['mark-failed'].permissions).toEqual({ contents: 'write' })
    const node = release.jobs.verify.steps.find((step: { uses?: string }) =>
      step.uses?.startsWith('actions/setup-node@'),
    )
    expect(node.with['node-version']).toBe(20)
  })

  it('opens the release pull request only after the full gate, with least privilege', () => {
    expect(Object.keys(releasePr.on)).toEqual(['workflow_dispatch'])
    expect(releasePr.on.workflow_dispatch.inputs.version.required).toBe(true)
    expect(releasePr.permissions).toEqual({ contents: 'read' })
    expect(releasePr.concurrency.group).toBe(release.concurrency.group)
    const job = releasePr.jobs.open
    expect(job.permissions).toEqual({ contents: 'write', 'pull-requests': 'write' })
    // The app's key lives in its own environment, not in repository secrets.
    expect(job.environment).toBe('release-pull-request')
    type Step = {
      id?: string
      if?: string
      uses?: string
      run?: string
      with?: Record<string, unknown>
      env?: Record<string, string>
    }
    const steps = job.steps as Step[]
    const at = (pattern: RegExp) => steps.findIndex((step) => pattern.test(step.run ?? ''))
    expect(at(/^npm ci$/)).toBeLessThan(at(/^npm run build$/))
    expect(at(/^npm run build$/)).toBeLessThan(at(/release\.mjs bump/))
    expect(at(/release\.mjs bump/)).toBeLessThan(at(/^npm run check$/))
    expect(at(/release\.mjs open-pr/)).toBe(steps.length - 1)
    // The app token is minted after every dependency script has run, is
    // optional, and asks for no more than the commit and the pull request need.
    const mint = steps.findIndex((step) =>
      step.uses?.startsWith('actions/create-github-app-token@'),
    )
    expect(mint).toBe(at(/^npm run check$/) + 1)
    expect(mint).toBe(steps.length - 2)
    const app = steps[mint] as Step
    const expression = (body: string) => `\${{ ${body} }}`
    expect(app.id).toBe('app')
    expect(app.if).toBe("vars.RELEASE_APP_CLIENT_ID != ''")
    expect(app.with).toEqual({
      'client-id': expression('vars.RELEASE_APP_CLIENT_ID'),
      'private-key': expression('secrets.RELEASE_APP_PRIVATE_KEY'),
      'permission-contents': 'write',
      'permission-pull-requests': 'write',
    })
    expect(steps.at(-1)?.env).toEqual({
      RELEASE_VERSION: expression('inputs.version'),
      RELEASE_PR_TOKEN: expression("steps.app.outcome == 'success' && 'app' || 'workflow'"),
      GH_TOKEN: expression('steps.app.outputs.token || github.token'),
    })
    for (const step of steps.slice(0, mint))
      expect(JSON.stringify(step)).not.toMatch(/secrets\.|steps\.app/)
    for (const step of steps) {
      if (step.uses) expect(step.uses).toMatch(/@[a-f0-9]{40}$/)
      if (step.run) expect(step.run).not.toContain('${{')
      if (step.uses?.startsWith('actions/checkout@'))
        expect(step.with?.['persist-credentials']).toBe(false)
    }
  })

  it('runs npm from an exact Node instead of installing one globally', () => {
    // A global npm install is not pinned by hash (Scorecard PinnedDependencies); the npm bundled
    // with an exact Node is, and each job checks that it got the version ADR-0069 names.
    const conformance = parse(readFileSync('.github/workflows/conformance.yml', 'utf8'))
    type Step = { run?: string; uses?: string; with?: Record<string, unknown> }
    const jobs = [release, releasePr, conformance].flatMap(
      (workflow) => Object.values(workflow.jobs) as { steps: Step[] }[],
    )
    const checked = jobs.filter((job) =>
      job.steps.some((step) => step.run?.includes('npm --version')),
    )
    expect(checked).toHaveLength(4)
    for (const job of jobs)
      expect(job.steps.some((step) => /npm (install|i) (--global|-g)\b/.test(step.run ?? ''))).toBe(
        false,
      )
    for (const job of checked) {
      const node = job.steps.find((step) => step.uses?.startsWith('actions/setup-node@'))
      expect(node?.with?.['node-version']).toBe('24.22.0')
      expect(job.steps.find((step) => step.run?.includes('npm --version'))?.run).toBe(
        'test "$(npm --version)" = 11.19.1',
      )
    }
  })
})
