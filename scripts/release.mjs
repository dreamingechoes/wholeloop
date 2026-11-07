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
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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
function command(executable, args, environment = process.env, input) {
  const result = spawnSync(executable, args, {
    cwd: repository,
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

function npmRunner(temporary, offline) {
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
    )
}

function actualContext(output) {
  stage = 'actual CI context observation'
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Actual context requires GitHub Actions')
  assert.equal(process.env.GITHUB_EVENT_NAME, 'workflow_dispatch')
  const slug = process.env.GITHUB_REPOSITORY
  assert(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(slug ?? ''))
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
  const expected = ['LICENSE', 'README.md', 'dist/wl.mjs', 'package.json']
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
    'https://registry.npmjs.org/',
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
  else
    throw new Error(
      'Use context <file>, prepare <version> <context> <new directory> [from], or publish <bundle> <digest> <context>',
    )
} catch {
  console.error(
    `release: failed at ${stage}; preserve prepared evidence and inspect actual outcomes before retrying; diagnostics omitted`,
  )
  for (const path of evidence) console.error(`release: preserve ${path}`)
  process.exitCode = 1
}
