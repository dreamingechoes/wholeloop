import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  appendFileSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compareVersions } from './changelog.mjs'

const repository = fileURLToPath(new URL('../', import.meta.url))
let stage = 'input validation'
const evidence = []
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const payloads = [
  'release-notes.md',
  'sbom.cdx.json',
  'wholeloop-native.tar.gz',
  'wholeloop-npm.tgz',
  'wl.mjs',
]
const REGISTRY = 'https://registry.npmjs.org/'
const releaseVersion = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/
const repositorySlug = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
function command(executable, args, environment = process.env, input, cwd = repository) {
  const result = spawnSync(executable, args, {
    cwd,
    env: environment,
    input,
    encoding: 'utf8',
    timeout: 120_000,
    killSignal: 'SIGKILL',
    maxBuffer: 4 * 1024 * 1024,
  })
  if (result.error || result.status !== 0)
    throw new Error(`Release subprocess failed (exit ${result.status}); diagnostics omitted`)
  return result.stdout.trim()
}
function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
}
function bounded(file, limit = 65536) {
  const stat = lstatSync(file)
  assert(stat.isFile() && !stat.isSymbolicLink() && stat.size <= limit)
  const bytes = readFileSync(file)
  assert(bytes.byteLength <= limit)
  return bytes
}

function npmRunner(temporary, offline, cwd = repository) {
  const npmCli = realpathSync(process.env.npm_execpath ?? join(dirname(process.execPath), 'npm'))
  const userConfig = join(temporary, 'user.npmrc')
  const globalConfig = join(temporary, 'global.npmrc')
  writeFileSync(userConfig, '', { flag: 'wx', mode: 0o600 })
  writeFileSync(globalConfig, '', { flag: 'wx', mode: 0o600 })
  const environment = { ...process.env }
  // OIDC uses ephemeral Actions environment data; never copy npm tokens into config or argv.
  for (const key of Object.keys(environment))
    if (/^(?:npm_config_|npm_token$|node_auth_token$|node_options$|node_path$)/i.test(key))
      delete environment[key]
  return (args) =>
    command(
      process.execPath,
      [
        npmCli,
        '--userconfig',
        userConfig,
        '--globalconfig',
        globalConfig,
        '--cache',
        join(temporary, 'cache'),
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--no-update-notifier',
        '--loglevel',
        'error',
        ...(offline ? ['--offline'] : []),
        ...args,
      ],
      environment,
      undefined,
      cwd,
    )
}

function releaseTags() {
  return command('git', ['tag', '--list', 'v*'])
    .split('\n')
    .map((tag) => tag.slice(1))
    .filter((version) => releaseVersion.test(version))
}
// The previous release is the highest tagged version below this one, so a
// final version after its candidates starts its range at the last candidate.
function previousRelease(version, tags = releaseTags()) {
  return tags
    .filter((tag) => compareVersions(tag, version) < 0)
    .sort(compareVersions)
    .at(-1)
}
function packageVersion(revision) {
  const text = revision
    ? command('git', ['show', `${revision}:package.json`])
    : bounded(join(repository, 'package.json')).toString('utf8')
  return JSON.parse(text).version
}
function outputs(values) {
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      Object.entries(values)
        .map(([key, value]) => `${key}=${value}\n`)
        .join(''),
    )
  console.log(JSON.stringify(values))
}
function actionsRepository() {
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'This action runs only in GitHub Actions')
  const slug = process.env.GITHUB_REPOSITORY ?? ''
  assert(repositorySlug.test(slug))
  return slug
}
// Serial waits for registry propagation without a busy loop or a timer callback.
const pause = (milliseconds) =>
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds)
const wrap = (text) =>
  text
    .split(' ')
    .reduce((lines, word) => {
      const last = lines.at(-1)
      if (last !== undefined && `${last} ${word}`.length <= 72)
        lines[lines.length - 1] = `${last} ${word}`
      else lines.push(word)
      return lines
    }, [])
    .join('\n')

// Decides whether a run releases. A dispatch names its version; a push to the
// default branch releases only when it changed the package version to one that
// has no tag yet, which is what merging a release pull request does. Any other
// push, including the one that creates the branch, prepares nothing.
function plan() {
  stage = 'release plan'
  const event = process.env.GITHUB_EVENT_NAME
  const tags = releaseTags()
  if (event === 'workflow_dispatch') {
    const version = process.env.RELEASE_VERSION ?? ''
    assert(releaseVersion.test(version), 'Dispatch an exact release version')
    return outputs({
      release: true,
      version,
      from: process.env.RELEASE_FROM ?? '',
      publish: process.env.RELEASE_PUBLISH === 'true',
    })
  }
  assert.equal(event, 'push', 'Releases start from a dispatch or a default-branch push')
  const before = process.env.RELEASE_BEFORE ?? ''
  assert(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(before))
  const version = packageVersion()
  const changed = !/^0+$/.test(before) && packageVersion(before) !== version
  const release = changed && releaseVersion.test(version) && !tags.includes(version)
  const from = release ? previousRelease(version, tags) : undefined
  return outputs({ release, version, from: from ? `v${from}` : '', publish: release })
}

// The first half of a release pull request: set the version, regenerate the
// changelog with the untagged section and refuse a version change smaller than
// the range needs (P7-07). The workflow runs the full gate before opening it.
function bump(version) {
  stage = 'release version change'
  assert(releaseVersion.test(version ?? ''), 'Use bump <x.y.z[-pre]>')
  const tags = releaseTags()
  assert(!tags.includes(version), 'The version is already tagged')
  assert.notEqual(packageVersion(), version, 'The package already has this version')
  const temporary = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-release-bump-')))
  evidence.push(temporary)
  npmRunner(temporary, true)(['version', version, '--no-git-tag-version'])
  stage = 'changelog regeneration'
  command(process.execPath, [join(repository, 'scripts/changelog.mjs'), '--next'])
  stage = 'release-note version check'
  const previous = previousRelease(version, tags)
  const notes = JSON.parse(
    command(process.execPath, [
      join(repository, 'dist/wl.mjs'),
      'release',
      'notes',
      ...(previous ? ['--from', `v${previous}`] : ['--initial']),
      '--to',
      'HEAD',
      '--version',
      version,
      '--json',
    ]),
  )
  assert.equal(notes.status, 'draft')
  outputs({ version, from: previous ? `v${previous}` : '' })
}

// The second half: commit exactly the three changed files through the Git
// Data API, create the branch without overwriting one and open the pull
// request. Its checks are the pull request's own runs: a dispatched CI run
// passed on the branch but never counted toward the required checks. With the
// workflow token GitHub holds those runs for a maintainer's approval; a
// GitHub App token, when the release app is configured, starts them directly.
// No Git credential is written to the checkout.
function openPullRequest(version) {
  stage = 'release pull request'
  const slug = actionsRepository()
  assert(releaseVersion.test(version ?? ''))
  const token = process.env.RELEASE_PR_TOKEN ?? ''
  assert(['app', 'workflow'].includes(token), 'RELEASE_PR_TOKEN must be app or workflow')
  const ref = process.env.GITHUB_REF ?? ''
  assert(/^refs\/heads\/[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/.test(ref))
  const base = ref.slice('refs/heads/'.length)
  const files = ['CHANGELOG.md', 'package-lock.json', 'package.json']
  const changed = command('git', ['status', '--porcelain', '--untracked-files=all'])
    .split('\n')
    .filter(Boolean)
    // command() trims its output, which can drop the first line's leading
    // status column; strip the status token instead of fixed columns.
    .map((line) => line.replace(/^\s*\S+\s+/, ''))
    .sort()
  assert.deepEqual(changed, files, 'Only the version and changelog may change')
  assert.equal(packageVersion(), version)
  const head = command('git', ['rev-parse', 'HEAD'])
  // GitHub computes standard Git object names, so the tree it creates must be
  // the tree of these exact local bytes.
  const temporary = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-release-pr-')))
  evidence.push(temporary)
  const index = { ...process.env, GIT_INDEX_FILE: join(temporary, 'index') }
  command('git', ['read-tree', 'HEAD'], index)
  command('git', ['add', '--', ...files], index)
  const expected = command('git', ['write-tree'], index)
  const api = (path, body) =>
    JSON.parse(
      command(
        'gh',
        ['api', `repos/${slug}/${path}`, '--method', 'POST', '--input', '-'],
        process.env,
        JSON.stringify(body),
      ),
    )
  const tree = api('git/trees', {
    base_tree: command('git', ['rev-parse', 'HEAD^{tree}']),
    tree: files.map((path) => ({
      path,
      mode: '100644',
      type: 'blob',
      content: bounded(join(repository, path), 8 * 1024 * 1024).toString('utf8'),
    })),
  })
  assert.equal(tree.sha, expected, 'The hosted tree differs from the prepared files')
  const previous = previousRelease(version)
  const subject = `chore(release): v${version}`
  const body = wrap(
    `Set the package version to ${version} and regenerate the changelog from ${previous ? `the commits since v${previous}` : 'the whole history'}. Merging this change starts the Release workflow, which publishes the prepared bytes only after the release environment approval.`,
  )
  const commit = api('git/commits', {
    message: `${subject}\n\n${body}\n`,
    tree: tree.sha,
    parents: [head],
  })
  assert.equal(commit.tree?.sha, expected)
  const branch = `release/v${version}`
  stage = 'non-overwriting release branch creation'
  api('git/refs', { ref: `refs/heads/${branch}`, sha: commit.sha })
  stage = 'release pull request creation'
  command(
    'gh',
    [
      'pr',
      'create',
      '--repo',
      slug,
      '--base',
      base,
      '--head',
      branch,
      '--title',
      subject,
      '--body-file',
      '-',
    ],
    process.env,
    `${body}\n\nReview the version and the changelog. ${
      token === 'app'
        ? 'The required checks run on this pull request.'
        : 'The workflow token opened this pull request, so its checks wait for a maintainer to approve the runs.'
    }\n`,
  )
  outputs({ branch, commit: commit.sha })
}

// Installs the published version from the registry into an empty prefix, as a
// user would, and runs it. Registry propagation can lag publication briefly,
// so installation waits up to four times; publication itself is never retried.
function verifyPublished(version) {
  stage = 'post-publication install'
  assert(releaseVersion.test(version ?? ''), 'Use verify-published <version>')
  const temporary = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-release-verify-')))
  evidence.push(temporary)
  const npm = npmRunner(temporary, false, temporary)
  const prefix = join(temporary, 'prefix')
  for (let attempt = 1; ; attempt++) {
    try {
      npm([
        'install',
        '--global',
        '--prefix',
        prefix,
        '--registry',
        REGISTRY,
        `wholeloop@${version}`,
      ])
      break
    } catch (error) {
      if (attempt === 5) throw error
      pause(30_000)
    }
  }
  stage = 'post-publication dist-tag'
  const npmTag = version.includes('-') ? 'next' : 'latest'
  const tags = JSON.parse(npm(['view', 'wholeloop', 'dist-tags', '--json', '--registry', REGISTRY]))
  assert.equal(tags[npmTag], version)
  stage = 'post-publication run'
  const home = join(temporary, 'home')
  mkdirSync(home)
  const environment = {
    ...process.env,
    HOME: home,
    PATH: [join(prefix, 'bin'), process.env.PATH].join(delimiter),
  }
  const wl = join(prefix, 'bin', 'wl')
  assert.equal(command(wl, ['--version'], environment, undefined, temporary), version)
  // A clean runner has no coding client, so doctor honestly reports
  // needs-attention with exit 3 and a failing cli.any check. Requiring
  // "observed" failed the 1.0.0-rc.1 check although the package installed and
  // ran. The core's own checks must pass, and no other check may fail.
  const report = spawnSync(wl, ['doctor', '--json'], {
    cwd: temporary,
    env: environment,
    encoding: 'utf8',
    timeout: 120_000,
    killSignal: 'SIGKILL',
    maxBuffer: 4 * 1024 * 1024,
  })
  assert(!report.error && (report.status === 0 || report.status === 3))
  const doctor = JSON.parse(report.stdout)
  assert.equal(doctor.schema, 'wholeloop/doctor@1')
  const checks = new Map(doctor.checks.map((check) => [check.id, check.status]))
  for (const id of ['node', 'git', 'store']) assert.equal(checks.get(id), 'pass')
  assert(doctor.checks.every((check) => check.status !== 'fail' || check.id === 'cli.any'))
  console.log(
    JSON.stringify({
      schema: 'wholeloop/release-verification@1',
      status: 'verified',
      version,
      npmTag,
    }),
  )
}

// Marks a published release whose post-publication check failed: a caution at
// the top of its notes linking the run and the recovery procedure, a title
// that says so, and no Latest badge. The npm version stays published, since
// deprecation needs the maintainer's npm credentials (see the releasing guide).
function markFailed(version) {
  stage = 'failed release marking'
  const slug = actionsRepository()
  assert(releaseVersion.test(version ?? ''), 'Use mark-failed <version>')
  const server = process.env.GITHUB_SERVER_URL ?? ''
  const runId = process.env.GITHUB_RUN_ID ?? ''
  assert(/^https:\/\/[A-Za-z0-9.-]+$/.test(server) && /^\d+$/.test(runId))
  const tag = `v${version}`
  const notes = command('gh', [
    'release',
    'view',
    tag,
    '--repo',
    slug,
    '--json',
    'body',
    '--jq',
    '.body',
  ])
  const marker = '> [!CAUTION]\n> **This release failed its post-publication check.**'
  const notice = `${marker} The npm package was published but did not install and run on a clean runner ([workflow run](${server}/${slug}/actions/runs/${runId})). Do not install it; follow [recover from a bad release](${server}/${slug}/blob/${tag}/docs/contributing/releasing.md#recover-from-a-bad-release).\n\n`
  command(
    'gh',
    [
      'release',
      'edit',
      tag,
      '--repo',
      slug,
      '--title',
      `${tag} (failed post-publication check)`,
      '--prerelease',
      '--latest=false',
      '--notes-file',
      '-',
    ],
    process.env,
    notes.startsWith(marker) ? notes : `${notice}${notes}`,
  )
  console.log(JSON.stringify({ schema: 'wholeloop/release-failure@1', status: 'marked', tag }))
}

function actualContext(output) {
  stage = 'actual CI context observation'
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Actual context requires GitHub Actions')
  assert(['workflow_dispatch', 'push'].includes(process.env.GITHUB_EVENT_NAME ?? ''))
  const slug = process.env.GITHUB_REPOSITORY
  assert(repositorySlug.test(slug ?? ''))
  const workflowPrefix = `${slug}/.github/workflows/`
  const workflowRef = process.env.GITHUB_WORKFLOW_REF ?? ''
  assert(workflowRef.startsWith(workflowPrefix))
  assert.equal(workflowRef.slice(workflowPrefix.length), `release.yml@${process.env.GITHUB_REF}`)
  const metadata = JSON.parse(
    command('gh', [
      'api',
      `repos/${slug}`,
      '--jq',
      '{repository: .full_name, public: (.private | not), defaultBranch: .default_branch}',
    ]),
  )
  writeJson(output, {
    schema: 'wholeloop/release-context@1',
    ...metadata,
    ref: process.env.GITHUB_REF,
    commit: process.env.GITHUB_SHA,
    event: process.env.GITHUB_EVENT_NAME,
    workflow: 'release.yml',
  })
}

function prepare(version, context, output, from) {
  stage = 'source preflight'
  assert(version && context && output, 'Use prepare <version> <context> <new directory> [from]')
  const core = join(repository, 'dist/wl.mjs')
  const cli = (args) => JSON.parse(command(process.execPath, [core, ...args, '--json']))
  const plan = cli(['release', 'preflight', '--version', version, '--context', resolve(context)])
  assert.equal(plan.status, 'ready')
  const temporary = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-release-prepare-')))
  evidence.push(temporary)
  // A new external destination prevents replacing an already reviewed bundle or source files.
  const requested = resolve(output)
  const destination = join(
    realpathSync(dirname(requested)),
    requested.slice(dirname(requested).length + 1),
  )
  const part = relative(realpathSync(repository), destination)
  assert(
    isAbsolute(part) || part === '..' || part.startsWith('../'),
    'Keep prepared output outside source',
  )
  mkdirSync(destination, { mode: 0o700 })
  evidence.push(destination)
  stage = 'offline npm packaging'
  const npm = npmRunner(temporary, true)
  const pkg = JSON.parse(bounded(join(repository, 'package.json')).toString('utf8'))
  assert.deepEqual(pkg.files, ['dist'])
  assert.deepEqual(pkg.bin, { wholeloop: 'dist/wl.mjs', wl: 'dist/wl.mjs' })
  for (const key of [
    'dependencies',
    'optionalDependencies',
    'bundleDependencies',
    'bundledDependencies',
  ])
    assert(!pkg[key] || Object.keys(pkg[key]).length === 0)
  const expected = ['LICENSE', 'README.md', 'dist/wl-runner.mjs', 'dist/wl.mjs', 'package.json']
  const planned = JSON.parse(npm(['pack', '--dry-run', '--json']))
  assert.equal(planned.length, 1)
  assert.deepEqual(planned[0].files.map((file) => file.path).sort(), expected)
  const packed = JSON.parse(npm(['pack', '--json', '--pack-destination', temporary]))
  assert.equal(packed.length, 1)
  const pack = packed[0]
  assert.equal(pack.name, 'wholeloop')
  assert.equal(pack.version, version)
  assert.equal(pack.filename, `wholeloop-${version}.tgz`)
  assert.deepEqual(pack.files.map((file) => file.path).sort(), expected)
  const archive = join(temporary, pack.filename)
  const bytes = bounded(archive, 128 * 1024 * 1024)
  assert.equal(createHash('sha1').update(bytes).digest('hex'), pack.shasum)
  assert.equal(`sha512-${createHash('sha512').update(bytes).digest('base64')}`, pack.integrity)
  renameSync(archive, join(destination, 'wholeloop-npm.tgz'))
  copyFileSync(core, join(destination, 'wl.mjs'))
  // The workflow writes the SBOM of the bundled packages before preparation
  // (scripts/check-dependencies.mjs --sbom); it must describe this version.
  stage = 'bundled-package SBOM'
  assert(process.env.RELEASE_SBOM, 'Set RELEASE_SBOM to the prepared CycloneDX SBOM')
  const sbom = JSON.parse(bounded(process.env.RELEASE_SBOM, 8 * 1024 * 1024).toString('utf8'))
  assert.equal(sbom.bomFormat, 'CycloneDX')
  assert.equal(sbom.metadata?.component?.version, version)
  writeJson(join(destination, 'sbom.cdx.json'), sbom)
  stage = 'complete-history release notes'
  const notes = cli([
    'release',
    'notes',
    ...(from ? ['--from', from] : ['--initial']),
    '--to',
    plan.commit,
    '--version',
    version,
  ])
  assert.equal(notes.status, 'draft')
  assert.equal(notes.to, plan.commit)
  writeFileSync(join(destination, 'release-notes.md'), notes.markdown, { flag: 'wx' })
  const native = join(temporary, 'native')
  stage = 'native delivery archive'
  cli(['release', 'artifacts', '--out', native])
  // Artifact ZIPs lose modes and can omit dotfiles. Keep the complete native tree inside tar.
  command('tar', ['-czf', join(destination, 'wholeloop-native.tar.gz'), '-C', native, '.'])
  const manifest = {
    schema: 'wholeloop/release-bundle@1',
    repository: plan.repository,
    commit: plan.commit,
    workflow: plan.workflow,
    version: plan.version,
    tag: plan.tag,
    npmTag: plan.npmTag,
    from: notes.from ?? 'initial',
    files: payloads.map((path) => {
      const bytes = bounded(join(destination, path), 128 * 1024 * 1024)
      return { path, bytes: bytes.byteLength, sha256: digest(bytes) }
    }),
  }
  writeJson(join(destination, 'bundle.json'), manifest)
  const sha256 = digest(bounded(join(destination, 'bundle.json')))
  stage = 'prepared bundle verification'
  const verified = cli([
    'release',
    'verify',
    destination,
    '--context',
    resolve(context),
    '--sha256',
    sha256,
  ])
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `sha256=${sha256}\nbundle=${destination}\n`)
  console.log(JSON.stringify({ ...verified, sha256, bundle: destination, temporary }))
}

function publish(directory, sha256, context) {
  stage = 'publication bootstrap and bundle verification'
  assert.equal(
    process.env.GITHUB_ACTIONS,
    'true',
    'Publication requires explicit Actions activation',
  )
  assert(directory && /^[a-f0-9]{64}$/.test(sha256 ?? '') && context)
  const root = resolve(directory)
  const raw = bounded(join(root, 'bundle.json'))
  assert.equal(digest(raw), sha256, 'Retain the reviewed manifest digest independently')
  const manifest = JSON.parse(raw.toString('utf8'))
  // Bootstrap only the hash-bound executable; it verifies every remaining payload and source field.
  const core = join(root, 'wl.mjs')
  assert.equal(
    digest(bounded(core, 128 * 1024 * 1024)),
    manifest.files.find((f) => f.path === 'wl.mjs')?.sha256,
  )
  const result = JSON.parse(
    command(process.execPath, [
      core,
      'release',
      'verify',
      root,
      '--context',
      resolve(context),
      '--sha256',
      sha256,
      '--json',
    ]),
  )
  const temporary = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-release-publish-')))
  evidence.push(root, temporary)
  const npm = npmRunner(temporary, false)
  // No retries, overwrites or cleanup: npm and GitHub cannot be committed atomically.
  // An existing tag must never silently override --target, even when no release exists yet.
  stage = 'non-overwriting tag creation'
  command(
    'gh',
    ['api', `repos/${result.repository}/git/refs`, '--method', 'POST', '--input', '-'],
    process.env,
    JSON.stringify({ ref: `refs/tags/${result.tag}`, sha: result.commit }),
  )
  stage = 'draft GitHub release and asset upload'
  command('gh', [
    'release',
    'create',
    result.tag,
    '--repo',
    result.repository,
    '--draft',
    '--verify-tag',
    '--target',
    result.commit,
    '--title',
    result.tag,
    '--notes-file',
    join(root, 'release-notes.md'),
    ...(result.npmTag === 'next' ? ['--prerelease'] : []),
    ...['bundle.json', ...payloads].map((file) => join(root, file)),
  ])
  stage = 'npm archive publication with provenance'
  npm([
    'publish',
    join(root, 'wholeloop-npm.tgz'),
    '--registry',
    REGISTRY,
    '--access',
    'public',
    '--provenance',
    '--tag',
    result.npmTag,
  ])
  stage = 'GitHub release finalization'
  command('gh', [
    'release',
    'edit',
    result.tag,
    '--repo',
    result.repository,
    '--draft=false',
    `--latest=${result.npmTag === 'latest'}`,
  ])
  console.log(
    JSON.stringify({
      schema: 'wholeloop/release-activation@1',
      status: 'published',
      repository: result.repository,
      commit: result.commit,
      version: result.version,
      sha256,
    }),
  )
}

try {
  const [action, ...args] = process.argv.slice(2)
  if (action === 'context' && args.length === 1) actualContext(args[0])
  else if (action === 'prepare' && [3, 4].includes(args.length)) prepare(...args)
  else if (action === 'publish' && args.length === 3) publish(...args)
  else if (action === 'plan' && args.length === 0) plan()
  else if (action === 'bump' && args.length === 1) bump(args[0])
  else if (action === 'open-pr' && args.length === 1) openPullRequest(args[0])
  else if (action === 'verify-published' && args.length === 1) verifyPublished(args[0])
  else if (action === 'mark-failed' && args.length === 1) markFailed(args[0])
  else
    throw new Error(
      'Use context, prepare, publish, plan, bump, open-pr, verify-published or mark-failed; see docs/contributing/releasing.md',
    )
} catch {
  console.error(
    `release: failed at ${stage}; preserve prepared evidence and inspect actual outcomes before retrying; diagnostics omitted`,
  )
  for (const path of evidence) console.error(`release: preserve ${path}`)
  process.exitCode = 1
}
