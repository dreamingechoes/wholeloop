import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repository = fileURLToPath(new URL('../', import.meta.url))
const packages = {
  claude: '@anthropic-ai/claude-code',
  codex: '@openai/codex',
  opencode: 'opencode-ai',
  copilot: '@github/copilot',
  gemini: '@google/gemini-cli',
}
const channels = ['pinned', 'latest']
const updater = 'https://antigravity-cli-auto-updater-974169037036.us-central1.run.app'
const contained = (root, path) => {
  const part = relative(root, path)
  return part === '' || (!isAbsolute(part) && part !== '..' && !part.startsWith('../'))
}
const hash = (algorithm, bytes) => createHash(algorithm).update(bytes).digest('hex')
const integrity = (hex) => {
  assert(typeof hex === 'string' && /^[a-f0-9]{128}$/.test(hex))
  return `sha512-${Buffer.from(hex, 'hex').toString('base64')}`
}

/** Fixed-origin public downloads; redirects and ambient authentication are deliberately absent. */
export async function publicBytes(url, limit, timeout = 30000) {
  const parsed = new URL(url)
  assert(parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.hash)
  assert(
    [
      'registry.npmjs.org',
      'cursor.com',
      'downloads.cursor.com',
      'storage.googleapis.com',
      'antigravity-cli-auto-updater-974169037036.us-central1.run.app',
    ].includes(parsed.host),
  )
  const response = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(timeout),
    credentials: 'omit',
  })
  assert(response.ok && response.body)
  const chunks = []
  let length = 0
  // Closing the async iterator aborts an over-budget body before retaining a partial artifact.
  for await (const chunk of response.body) {
    length += chunk.byteLength
    assert(length <= limit)
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

export async function resolveDownloads(platform, arch, pins, bytes = publicBytes) {
  assert(['darwin', 'linux'].includes(platform) && ['arm64', 'x64'].includes(arch))
  const json = async (url) => JSON.parse((await bytes(url, 2 * 1024 * 1024)).toString('utf8'))
  const entries = []
  for (const [cli, name] of Object.entries(packages)) {
    assert(
      typeof pins[cli] === 'string' && /^[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.-]+)?$/.test(pins[cli]),
    )
    for (const channel of channels) {
      const requested = channel === 'pinned' ? pins[cli] : 'latest'
      const observed = await json(`https://registry.npmjs.org/${name}/${requested}`)
      assert.equal(observed.name, name)
      if (channel === 'pinned') assert.equal(observed.version, requested)
      entries.push({
        cli,
        channel,
        version: observed.version,
        url: observed.dist?.tarball,
        integrity: observed.dist?.integrity,
      })
    }
  }
  const script = (await bytes('https://cursor.com/install', 128 * 1024)).toString('utf8')
  // Parse one literal release assignment, never source or execute the installer.
  const matches = [...script.matchAll(/\/lab\/(\d{4}\.\d{2}\.\d{2}-[a-f0-9]{7,40})\//g)]
  const cursorVersions = new Set(matches.map((match) => match[1]))
  assert.equal(cursorVersions.size, 1)
  for (const channel of channels) {
    const version = channel === 'pinned' ? pins.cursor : [...cursorVersions][0]
    entries.push({
      cli: 'cursor',
      channel,
      version,
      url: `https://downloads.cursor.com/lab/${version}/${platform}/${arch}/agent-cli-package.tar.gz`,
      integrity: '',
    })
  }
  const latest = await json(
    `${updater}/manifests/${platform}_${arch === 'x64' ? 'amd64' : 'arm64'}.json`,
  )
  for (const channel of channels) {
    const entry = channel === 'pinned' ? pins.antigravity?.[`${platform}-${arch}`] : latest
    assert(entry)
    entries.push({
      cli: 'antigravity',
      channel,
      version: entry.version,
      url: entry.url,
      integrity: integrity(entry.sha512),
    })
  }
  return { schema: 'wholeloop/conformance-downloads@1', platform, arch, entries }
}

function processCommand(executable, args, options) {
  const result = spawnSync(executable, args, {
    encoding: 'utf8',
    timeout: 180000,
    killSignal: 'SIGKILL',
    maxBuffer: 4 * 1024 * 1024,
    ...options,
  })
  assert(!result.error && result.status === 0, 'Provision subprocess failed; diagnostics omitted')
  return result.stdout.trim()
}

export function assertExternalDestination(destination) {
  assert(
    isAbsolute(destination) && !existsSync(destination),
    'Use a new absolute external destination',
  )
  const parent = realpathSync(dirname(destination))
  assert(lstatSync(parent).isDirectory())
  let ancestor = parent
  for (;;) {
    assert(
      !existsSync(join(ancestor, '.git')) &&
        !(
          existsSync(join(ancestor, 'HEAD')) &&
          existsSync(join(ancestor, 'objects')) &&
          existsSync(join(ancestor, 'refs'))
        ),
      'Native provisioning must stay outside repositories',
    )
    const next = dirname(ancestor)
    if (next === ancestor) break
    ancestor = next
  }
  return join(parent, destination.slice(dirname(destination).length + 1))
}

/** Validate the entire archive before extraction into a new empty private directory. */
export function archiveInventory(archive, strip, command, options) {
  const bytes = readFileSync(archive)
  assert(bytes.length <= 256 * 1024 * 1024)
  // Bound expansion before invoking the platform tar. Accept only ordinary files/directories,
  // avoiding symlink ordering, hard links, devices and platform-specific metadata semantics.
  const expanded = gunzipSync(bytes, { maxOutputLength: 512 * 1024 * 1024 })
  let offset = 0
  // GNU long names are used by Cursor. Reject sparse/PAX/device/link headers rather
  // than let tar materialize an unbounded sparse file or reinterpret vendor metadata.
  while (offset + 512 <= expanded.length && expanded.subarray(offset, offset + 512).some(Boolean)) {
    const header = expanded.subarray(offset, offset + 512)
    assert([0, 48, 53, 76].includes(header[156]))
    const sizeField = header.subarray(124, 136).toString('ascii').replace(/\0/g, '').trim()
    assert(/^[0-7]{1,11}$/.test(sizeField))
    const size = Number.parseInt(sizeField, 8)
    offset += 512 + Math.ceil(size / 512) * 512
    assert(offset <= expanded.length)
  }
  assert(offset + 1024 <= expanded.length && !expanded.subarray(offset).some(Boolean))
  const names = command('tar', ['-tzf', archive], options).split('\n')
  const verbose = command('tar', ['-tvzf', archive], options).split('\n')
  assert(names.length >= 1 && names.length <= 10000 && verbose.length === names.length)
  const seen = new Set()
  for (const [index, name] of names.entries()) {
    assert(/^[A-Za-z0-9._/@+/-]+$/.test(name) && !name.startsWith('/'))
    const parts = name.replace(/\/$/, '').split('/')
    assert(parts.every((part) => part && part !== '.' && part !== '..'))
    assert(['-', 'd'].includes(verbose[index][0]))
    assert(!seen.has(name))
    seen.add(name)
    if (strip) assert.equal(parts[0], 'dist-package')
  }
  return names
}

export async function installDownloads(plan, destination, dependencies = {}) {
  const bytes = dependencies.bytes ?? publicBytes
  const command = dependencies.command ?? processCommand
  assert.equal(plan.platform, process.platform)
  assert.equal(plan.arch, process.arch)
  const root = assertExternalDestination(destination)
  mkdirSync(root, { mode: 0o700 })
  const records = []
  const receipt = {
    schema: 'wholeloop/conformance-provisioned@1',
    status: 'installing',
    records,
    limitations: plan.limitations,
  }
  const record = () =>
    writeFileSync(join(root, 'provisioned.json'), `${JSON.stringify(receipt, null, 2)}\n`, {
      mode: 0o600,
    })
  record()
  try {
    for (const entry of plan.downloads) {
      const prefix = join(root, entry.directory)
      mkdirSync(prefix, { recursive: true, mode: 0o700 })
      const home = join(prefix, 'home')
      mkdirSync(home, { mode: 0o700 })
      const env = {
        HOME: home,
        USERPROFILE: home,
        PATH: [dirname(process.execPath), '/usr/bin', '/bin'].join(delimiter),
        TMPDIR: prefix,
        TMP: prefix,
        TEMP: prefix,
        LANG: 'C.UTF-8',
        CI: 'true',
        XDG_CONFIG_HOME: join(home, 'config'),
        XDG_STATE_HOME: join(home, 'state'),
        XDG_CACHE_HOME: join(home, 'cache'),
      }
      const archive = join(prefix, 'download.tgz')
      const payload = await bytes(entry.url, 256 * 1024 * 1024, 120000)
      assert(payload.length <= 256 * 1024 * 1024)
      if (entry.integrity !== '')
        assert.equal(
          `sha512-${createHash('sha512').update(payload).digest('base64')}`,
          entry.integrity,
        )
      writeFileSync(archive, payload, { flag: 'wx', mode: 0o600 })
      const options = { cwd: prefix, env }
      if (entry.kind === 'npm') {
        const user = join(prefix, 'user.npmrc'),
          global = join(prefix, 'global.npmrc')
        writeFileSync(user, '', { flag: 'wx', mode: 0o600 })
        writeFileSync(global, '', { flag: 'wx', mode: 0o600 })
        const npm = realpathSync(process.env.npm_execpath ?? join(dirname(process.execPath), 'npm'))
        command(
          process.execPath,
          [
            npm,
            '--userconfig',
            user,
            '--globalconfig',
            global,
            '--registry',
            'https://registry.npmjs.org/',
            '--cache',
            join(prefix, 'npm-cache'),
            '--no-audit',
            '--no-fund',
            '--no-update-notifier',
            '--loglevel',
            'error',
            'install',
            '--global',
            '--prefix',
            prefix,
            '--ignore-scripts=false',
            archive,
          ],
          options,
        )
        const installed = JSON.parse(
          readFileSync(join(prefix, 'lib/node_modules', entry.package, 'package.json'), 'utf8'),
        )
        assert.equal(installed.name, entry.package)
        assert.equal(installed.version, entry.version)
      } else {
        archiveInventory(archive, entry.stripComponents, command, options)
        const unpacked = join(prefix, 'unpacked')
        mkdirSync(unpacked, { mode: 0o700 })
        command(
          'tar',
          [
            '-xzf',
            archive,
            '-C',
            unpacked,
            `--strip-components=${entry.stripComponents}`,
            '--no-same-owner',
            '--no-same-permissions',
          ],
          options,
        )
        mkdirSync(join(prefix, 'bin'), { mode: 0o700 })
        const executable = join(unpacked, entry.cli === 'cursor' ? 'cursor-agent' : 'antigravity')
        assert(lstatSync(executable).isFile() && !lstatSync(executable).isSymbolicLink())
        chmodSync(executable, 0o755)
        symlinkSync(executable, join(prefix, 'bin', entry.command))
      }
      const binary = realpathSync(join(prefix, 'bin', entry.command))
      assert(
        contained(prefix, binary) && lstatSync(binary).isFile() && lstatSync(binary).mode & 0o111,
      )
      records.push({
        cli: entry.cli,
        channel: entry.channel,
        version: entry.version,
        sha256: hash('sha256', payload),
        expectedIntegrity: entry.integrity !== '',
        status: 'installed',
      })
      record()
    }
    writeFileSync(join(root, 'collection.json'), `${JSON.stringify(plan.collection, null, 2)}\n`, {
      flag: 'wx',
      mode: 0o600,
    })
    receipt.status = 'installed'
    record()
    return { ...receipt, directory: root }
  } catch (error) {
    receipt.status = 'failed'
    record()
    throw error
  }
}

async function main() {
  let workspace
  try {
    const [flag, destination, ...extra] = process.argv.slice(2)
    assert(!extra.length && (flag === undefined || (flag === '--install' && destination)))
    assert(
      ['darwin', 'linux'].includes(process.platform) && ['x64', 'arm64'].includes(process.arch),
    )
    if (process.platform === 'linux')
      assert(process.report.getReport().header.glibcVersionRuntime, 'Only glibc Linux is supported')
    if (destination) assertExternalDestination(destination)
    const pins = JSON.parse(readFileSync(join(repository, 'test/conformance/pins.json'), 'utf8'))
    const input = await resolveDownloads(process.platform, process.arch, pins)
    workspace = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-conformance-resolution-')))
    const metadata = join(workspace, 'downloads.json')
    writeFileSync(metadata, JSON.stringify(input), { flag: 'wx', mode: 0o600 })
    const plan = JSON.parse(
      processCommand(
        process.execPath,
        [join(repository, 'dist/wl.mjs'), 'conformance', 'acquisition', metadata, '--json'],
        { cwd: workspace, env: { PATH: dirname(process.execPath) } },
      ),
    )
    console.log(JSON.stringify(destination ? await installDownloads(plan, destination) : plan))
  } catch {
    console.error(
      `conformance provision: failed; partial external evidence retained${workspace ? ` at ${workspace}` : ''}; diagnostics omitted`,
    )
    process.exitCode = 1
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
