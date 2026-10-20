import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, isAbsolute, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const repository = fileURLToPath(new URL('../', import.meta.url))
const temporary = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-package-check-')))
const home = join(temporary, 'home')
const workspace = join(temporary, 'workspace')
const prefix = join(temporary, 'prefix')
mkdirSync(home, { mode: 0o700 })
mkdirSync(workspace, { mode: 0o700 })
// Separate empty configs avoid npm's duplicate-config error and never contain credentials.
const userConfig = join(temporary, 'user.npmrc')
const globalConfig = join(temporary, 'global.npmrc')
writeFileSync(userConfig, '', { flag: 'wx', mode: 0o600 })
writeFileSync(globalConfig, '', { flag: 'wx', mode: 0o600 })
const environment = {
  HOME: home,
  USERPROFILE: home,
  PATH: [dirname(process.execPath), process.env.PATH].filter(Boolean).join(delimiter),
  TMPDIR: temporary,
  TMP: temporary,
  TEMP: temporary,
  XDG_CONFIG_HOME: join(home, 'config'),
  XDG_STATE_HOME: join(home, 'state'),
  XDG_CACHE_HOME: join(home, 'cache'),
  LANG: 'C.UTF-8',
}
const hash = (algorithm, value) => createHash(algorithm).update(value).digest('hex')
const contained = (root, path) => {
  const part = relative(root, path)
  return part === '' || (!isAbsolute(part) && part !== '..' && !part.startsWith('../'))
}
function command(executable, args, cwd = workspace) {
  const result = spawnSync(executable, args, {
    cwd,
    env: environment,
    encoding: 'utf8',
    timeout: 30_000,
    killSignal: 'SIGKILL',
    maxBuffer: 4 * 1024 * 1024,
  })
  if (result.error || result.status !== 0)
    throw new Error(`Package check subprocess failed (exit ${result.status}); diagnostics omitted`)
  return result.stdout.trim()
}

try {
  const npmCli = realpathSync(process.env.npm_execpath ?? join(dirname(process.execPath), 'npm'))
  const npm = (args, cwd = workspace) =>
    command(
      process.execPath,
      [
        npmCli,
        '--userconfig',
        userConfig,
        '--globalconfig',
        globalConfig,
        '--cache',
        join(temporary, 'npm-cache'),
        '--offline',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--no-update-notifier',
        '--loglevel',
        'error',
        ...args,
      ],
      cwd,
    )
  const expected = ['LICENSE', 'README.md', 'dist/wl.mjs', 'package.json']
  const before = new Map(
    expected.map((file) => {
      const path = join(repository, file)
      const stat = lstatSync(path)
      assert(stat.isFile() && !stat.isSymbolicLink(), 'Package input must be a regular source file')
      return [file, readFileSync(path)]
    }),
  )
  const pkg = JSON.parse(before.get('package.json').toString())
  assert.equal(pkg.name, 'wholeloop')
  assert.deepEqual(pkg.files, ['dist'])
  assert(
    !lstatSync(join(repository, 'dist')).isSymbolicLink(),
    'Package dist must be a real directory',
  )
  assert.deepEqual(readdirSync(join(repository, 'dist')), ['wl.mjs'])
  assert.deepEqual(pkg.bin, { wholeloop: 'dist/wl.mjs', wl: 'dist/wl.mjs' })
  for (const name of [
    'dependencies',
    'optionalDependencies',
    'bundleDependencies',
    'bundledDependencies',
  ])
    assert(
      !pkg[name] || Object.keys(pkg[name]).length === 0,
      'Published core must need no runtime dependencies',
    )
  // Inspect npm's actual allowlist before creating the archive, then verify the written result too.
  const planned = JSON.parse(npm(['pack', '--dry-run', '--json'], repository))
  assert.equal(planned.length, 1)
  assert.deepEqual(planned[0].files.map((file) => file.path).sort(), expected)
  const packed = JSON.parse(npm(['pack', '--json', '--pack-destination', temporary], repository))
  assert.equal(packed.length, 1)
  const pack = packed[0]
  assert.equal(pack.name, pkg.name)
  assert.equal(pack.version, pkg.version)
  assert.equal(pack.filename, `${pkg.name}-${pkg.version}.tgz`)
  assert.deepEqual(pack.files.map((file) => file.path).sort(), expected)
  const archive = join(temporary, pack.filename)
  const bytes = readFileSync(archive)
  assert.equal(hash('sha1', bytes), pack.shasum)
  assert.equal(`sha512-${createHash('sha512').update(bytes).digest('base64')}`, pack.integrity)
  npm(['install', '--global', '--prefix', prefix, archive])
  const modules = realpathSync(npm(['root', '--global', '--prefix', prefix]))
  assert(contained(prefix, modules), 'Package installation must remain under its temporary prefix')
  const installed = join(modules, pkg.name)
  assert.deepEqual(JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8')), pkg)
  for (const file of ['LICENSE', 'README.md', 'dist/wl.mjs'])
    assert.equal(
      hash('sha256', readFileSync(join(installed, file))),
      hash('sha256', before.get(file)),
    )
  const bin = join(prefix, 'bin', 'wl')
  for (const alias of ['wl', 'wholeloop']) {
    const path = join(prefix, 'bin', alias)
    assert.equal(realpathSync(path), realpathSync(join(installed, 'dist/wl.mjs')))
    assert(lstatSync(realpathSync(path)).mode & 0o111, 'Installed CLI must remain executable')
    assert.equal(command(path, ['--version']), pkg.version)
  }
  const help = JSON.parse(command(bin, ['--help', '--json']))
  assert.equal(help.schema, 'wholeloop/help@1')
  assert.equal(help.version, pkg.version)
  assert(help.commands.some((entry) => entry.path === 'install'))
  const store = join(temporary, 'store')
  const managed = (action) =>
    JSON.parse(
      command(bin, [action, '--target', 'codex', '--scope', 'user', '--store', store, '--json']),
    )
  assert.equal(managed('install').status, 'installed')
  assert.equal(managed('install').status, 'already-correct')
  const native = join(home, '.agents/skills/wl-frame-problem/SKILL.md')
  assert(existsSync(native), 'Installed package must contain its canonical harness resources')
  assert.equal(managed('uninstall').status, 'uninstalled')
  assert(!existsSync(native), 'Owned removal must retire its native entrypoint')
  for (const [file, content] of before)
    assert.equal(hash('sha256', readFileSync(join(repository, file))), hash('sha256', content))
  console.log(
    JSON.stringify({
      schema: 'wholeloop/package-check@1',
      status: 'PASS',
      version: pkg.version,
      files: expected,
      sha256: hash('sha256', bytes),
      private: pkg.private ?? false,
      aliases: ['wl', 'wholeloop'],
      managedTarget: 'codex',
      publication: 'not-performed',
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      limitations: [
        'Local offline packaging and managed-file execution only; native client discovery, authentication, models and fresh-machine timing remain unverified.',
      ],
    }),
  )
  // Only this check's successful disposable fixture is removed; failed evidence is retained below.
  rmSync(temporary, { recursive: true })
} catch (error) {
  console.error(`package: check failed; preserve fixture at ${temporary}`)
  console.error(error instanceof Error ? error.message : 'Unknown package check failure')
  process.exitCode = 1
}
