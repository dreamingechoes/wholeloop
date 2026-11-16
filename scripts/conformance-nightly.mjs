import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  appendFileSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertExternalDestination } from './conformance-provision.mjs'
import { readRegularFile } from './regular-file.mjs'

const repository = fileURLToPath(new URL('../', import.meta.url))
const targets = ['claude', 'codex', 'opencode', 'copilot', 'gemini', 'antigravity', 'cursor']
const keyNames = {
  claude: 'ANTHROPIC_API_KEY',
  codex: 'CODEX_API_KEY',
  opencode: 'OPENAI_API_KEY',
  copilot: 'COPILOT_GITHUB_TOKEN',
  gemini: 'GEMINI_API_KEY',
  antigravity: 'GEMINI_API_KEY',
  cursor: 'CURSOR_API_KEY',
}
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
function bounded(path, limit = 1024 * 1024) {
  try {
    return readRegularFile(path, limit)
  } catch {
    assert.fail('Expected a bounded regular file')
  }
}
const cleanEnv = () => ({
  PATH: [dirname(process.execPath), '/usr/bin', '/bin'].join(delimiter),
  LANG: 'C.UTF-8',
})
function command(executable, args, options = {}) {
  const { draft = false, ...spawnOptions } = options
  const result = spawnSync(executable, args, {
    cwd: repository,
    env: cleanEnv(),
    encoding: 'utf8',
    timeout: 210000,
    killSignal: 'SIGKILL',
    maxBuffer: 2 * 1024 * 1024,
    ...spawnOptions,
  })
  assert(
    !result.error && [0, ...(draft ? [4] : [])].includes(result.status),
    'Nightly subprocess failed; diagnostics omitted',
  )
  return result.stdout
}

/** Supplied context is a consistency check, not authentication of reports or authorization. */
export function nightlyBinding(env = process.env) {
  assert.equal(env.GITHUB_ACTIONS, 'true')
  assert.equal(env.GITHUB_SERVER_URL, 'https://github.com')
  assert(['schedule', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME))
  assert(/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? ''))
  assert(/^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/.test(env.CONFORMANCE_DEFAULT_BRANCH ?? ''))
  assert.equal(env.GITHUB_REF, `refs/heads/${env.CONFORMANCE_DEFAULT_BRANCH}`)
  assert(
    /^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID ?? '') &&
      /^[1-9][0-9]*$/.test(env.GITHUB_RUN_ATTEMPT ?? ''),
  )
  return { source: env.GITHUB_SHA, run: env.GITHUB_RUN_ID, attempt: env.GITHUB_RUN_ATTEMPT }
}
export function verifyNightlyCore(expected, core = join(repository, 'dist/wl.mjs')) {
  assert(/^[a-f0-9]{64}$/.test(expected ?? ''))
  assert.equal(digest(bounded(core, 128 * 1024 * 1024)), expected)
}
function newDirectory(path) {
  const directory = assertExternalDestination(path)
  mkdirSync(directory, { mode: 0o700 })
  return directory
}
function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
}

/** Only one selected credential enters each fresh collector environment; never persist it. */
export function nativeNightlyEnvironment(cli, home, key, model = '') {
  assert(targets.includes(cli))
  assert(typeof key === 'string' && key.length > 0 && key.length <= 16384 && !/[\r\n]/.test(key))
  const environment = {
    ...cleanEnv(),
    HOME: home,
    USERPROFILE: home,
    TMPDIR: home,
    TMP: home,
    TEMP: home,
    XDG_CONFIG_HOME: join(home, 'config'),
    XDG_STATE_HOME: join(home, 'state'),
    XDG_DATA_HOME: join(home, 'data'),
    XDG_CACHE_HOME: join(home, 'cache'),
    CI: 'true',
    [keyNames[cli]]: key,
  }
  if (cli === 'opencode') {
    assert(
      /^openai\/[A-Za-z0-9._:-]{1,100}$/.test(model),
      'Select an explicit OpenAI model for the OpenCode nightly transport',
    )
    // Carry only the reviewed non-secret identifier; the collector uses the
    // documented native --model flag for both supported dialects, not V1 config injection.
    environment.WL_CONFORMANCE_OPENCODE_MODEL = model
    environment.OPENCODE_DISABLE_AUTOUPDATE = 'true'
  }
  return environment
}
function nativeSettings(cli, home) {
  if (cli !== 'gemini' && cli !== 'antigravity') return
  const directory = join(home, '.gemini', ...(cli === 'antigravity' ? ['antigravity-cli'] : []))
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  writeJson(
    join(directory, 'settings.json'),
    cli === 'antigravity'
      ? { modelProvider: 'gemini' }
      : { security: { auth: { selectedType: 'gemini-api-key' } } },
  )
}

/** Copy only consumed structural fields; client prose, paths and unknown fields never become artifacts. */
export function nightlyObservation(run) {
  const report = run.report
  const projected = Object.fromEntries(
    [
      'schema',
      'id',
      'cli',
      'pin',
      'step',
      'scenario',
      'core',
      'source',
      'scenarioDigest',
      'evidence',
      'status',
      'missing',
      'problems',
      'subject',
    ]
      .filter((key) => Object.hasOwn(report, key))
      .map((key) => [key, report[key]]),
  )
  if (report.process)
    projected.process = Object.fromEntries(
      ['status', 'code', 'signal', 'version']
        .filter((key) => Object.hasOwn(report.process, key))
        .map((key) => [key, report.process[key]]),
    )
  projected.limitations = [
    'Reported process/journal structure only; native permissions, hooks, MCP, semantic quality and imported provenance remain separate evidence.',
  ]
  return { channel: run.channel, observedAt: run.observedAt, report: projected }
}
export function collectNightly(cli, nativeRoot, destination, dependencies = {}) {
  const env = dependencies.env ?? process.env,
    invoke = dependencies.command ?? command
  const binding = nightlyBinding(env),
    core = env.CONFORMANCE_CORE_SHA256
  verifyNightlyCore(core)
  assert(targets.includes(cli))
  const plan = JSON.parse(bounded(join(nativeRoot, 'collection.json'), 65536))
  assert.equal(plan.schema, 'wholeloop/conformance-collection@1')
  assert(Array.isArray(plan.entries) && plan.entries.length === 2)
  assert(
    plan.entries.every((entry) => entry.cli === cli) &&
      new Set(plan.entries.map((entry) => entry.channel)).size === 2,
  )
  assert(plan.entries.every((entry) => ['pinned', 'latest'].includes(entry.channel)))
  const resolved = assertExternalDestination(destination)
  assertExternalDestination(`${resolved}-runtime`)
  const output = newDirectory(resolved)
  const runtime = newDirectory(`${output}-runtime`)
  const key = env.CONFORMANCE_NATIVE_KEY
  const configured = Boolean(key && (cli !== 'opencode' || env.CONFORMANCE_NATIVE_MODEL))
  const runs = []
  if (configured) {
    for (const entry of plan.entries) {
      const home = join(runtime, entry.channel)
      mkdirSync(home, { mode: 0o700 })
      const clientEnv = nativeNightlyEnvironment(cli, home, key, env.CONFORMANCE_NATIVE_MODEL ?? '')
      nativeSettings(cli, home)
      const selected = join(runtime, `${entry.channel}.json`)
      writeJson(selected, { schema: plan.schema, entries: [entry] })
      const result = JSON.parse(
        invoke(
          process.execPath,
          [
            join(repository, 'dist/wl.mjs'),
            'conformance',
            'collect',
            selected,
            '--live',
            '--bin-root',
            realpathSync(nativeRoot),
            '--timeout',
            '180000',
            '--store',
            join(runtime, 'store'),
            '--json',
          ],
          { env: clientEnv, cwd: runtime, draft: true },
        ),
      )
      assert.equal(result.schema, 'wholeloop/conformance-results@1')
      assert.equal(result.mode, 'live')
      assert.equal(result.status, 'completed')
      assert(Array.isArray(result.runs) && result.runs.length === 1)
      assert.equal(result.runs[0].channel, entry.channel)
      assert.equal(result.runs[0].report.cli, cli)
      assert.equal(result.runs[0].report.pin, entry.pin)
      assert.equal(result.runs[0].report.core, core)
      runs.push(nightlyObservation(result.runs[0]))
    }
  }
  verifyNightlyCore(core)
  const results = { schema: 'wholeloop/conformance-results@1', runs }
  const file = join(output, 'results.json')
  writeJson(file, results)
  // Reuse the deterministic validator before exposing a structural artifact.
  invoke(
    process.execPath,
    [
      join(repository, 'dist/wl.mjs'),
      'conformance',
      'matrix',
      file,
      '--at',
      new Date().toISOString(),
      '--json',
    ],
    { draft: true },
  )
  const receipt = {
    schema: 'wholeloop/conformance-nightly-client@1',
    ...binding,
    core,
    cli,
    status: configured ? 'completed' : 'unconfigured',
    results: digest(bounded(file)),
    observations: runs.length,
  }
  writeJson(join(output, 'receipt.json'), receipt)
  return receipt
}

export function aggregateNightly(input, destination, env = process.env) {
  const binding = nightlyBinding(env),
    core = env.CONFORMANCE_CORE_SHA256
  verifyNightlyCore(core)
  const root = realpathSync(input),
    names = targets.map((cli) => `observations-${binding.run}-${binding.attempt}-${cli}`)
  assert.deepEqual(readdirSync(root).sort(), [...names].sort())
  const runs = [],
    clients = []
  for (const [index, name] of names.entries()) {
    const directory = join(root, name)
    assert(lstatSync(directory).isDirectory() && !lstatSync(directory).isSymbolicLink())
    assert.deepEqual(readdirSync(directory).sort(), ['receipt.json', 'results.json'])
    const receipt = JSON.parse(bounded(join(directory, 'receipt.json'), 16384)),
      raw = bounded(join(directory, 'results.json'))
    assert.equal(receipt.schema, 'wholeloop/conformance-nightly-client@1')
    for (const [key, value] of Object.entries({
      ...binding,
      core,
      cli: targets[index],
      results: digest(raw),
    }))
      assert.equal(receipt[key], value)
    assert(['completed', 'unconfigured'].includes(receipt.status))
    const result = JSON.parse(raw)
    assert.equal(result.schema, 'wholeloop/conformance-results@1')
    assert(
      Array.isArray(result.runs) && result.runs.length === (receipt.status === 'completed' ? 2 : 0),
    )
    assert.equal(receipt.observations, result.runs.length)
    assert(new Set(result.runs.map((run) => run.channel)).size === result.runs.length)
    for (const run of result.runs) {
      assert.equal(run.report.cli, targets[index])
      assert.equal(run.report.core, core)
      runs.push(nightlyObservation(run))
    }
    clients.push({
      cli: targets[index],
      status: receipt.status,
      observations: receipt.observations,
    })
  }
  const output = newDirectory(destination),
    results = join(output, 'results.json')
  writeJson(results, { schema: 'wholeloop/conformance-results@1', runs })
  const at = new Date().toISOString(),
    args = [join(repository, 'dist/wl.mjs'), 'conformance', 'matrix', results, '--at', at]
  const matrix = JSON.parse(command(process.execPath, [...args, '--json'], { draft: true }))
  writeJson(join(output, 'matrix.json'), matrix)
  writeFileSync(
    join(output, 'matrix.md'),
    command(process.execPath, [...args, '--markdown'], { draft: true }),
    { flag: 'wx', mode: 0o600 },
  )
  writeJson(
    join(output, 'issues.json'),
    JSON.parse(
      command(
        process.execPath,
        [join(repository, 'dist/wl.mjs'), 'conformance', 'issues', results, '--at', at, '--json'],
        { draft: true },
      ),
    ),
  )
  // Generate the actual owned page in the external artifact tree, never in the source checkout.
  mkdirSync(join(output, 'docs/platforms'), { recursive: true, mode: 0o700 })
  copyFileSync(
    join(repository, 'docs/platforms/README.md'),
    join(output, 'docs/platforms/README.md'),
  )
  command(process.execPath, [...args, '--docs', output, '--write', '--json'], { draft: true })
  const receipt = {
    schema: 'wholeloop/conformance-nightly@1',
    ...binding,
    core,
    at,
    clients,
    results: digest(bounded(results)),
    effects: 'artifacts-only',
    limitations: [
      'CI bindings and hashes establish pipeline consistency, not independent authentication of imported native reports. No source page, issue or ref was changed.',
    ],
  }
  writeJson(join(output, 'receipt.json'), receipt)
  return receipt
}

async function main() {
  try {
    const [mode, first, second, third, ...extra] = process.argv.slice(2)
    assert(!extra.length)
    if (mode === 'core' && !first) {
      const binding = nightlyBinding()
      assert.equal(
        command('git', ['-C', repository, 'rev-parse', '--verify', 'HEAD']).trim(),
        binding.source,
      )
      const sha256 = digest(bounded(join(repository, 'dist/wl.mjs'), 128 * 1024 * 1024))
      if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `sha256=${sha256}\n`)
      console.log(
        JSON.stringify({ schema: 'wholeloop/conformance-nightly-core@1', ...binding, sha256 }),
      )
    } else if (mode === 'collect' && first && second && third)
      console.log(JSON.stringify(collectNightly(first, second, third)))
    else if (mode === 'aggregate' && first && second && !third) {
      const receipt = aggregateNightly(first, second)
      if (process.env.GITHUB_OUTPUT)
        appendFileSync(process.env.GITHUB_OUTPUT, `sha256=${receipt.results}\n`)
      console.log(JSON.stringify(receipt))
    } else if (mode === 'verify-results' && first && second && !third) {
      nightlyBinding()
      verifyNightlyCore(process.env.CONFORMANCE_CORE_SHA256)
      assert(/^[a-f0-9]{64}$/.test(second))
      assert.equal(digest(bounded(first)), second)
      console.log(
        JSON.stringify({
          schema: 'wholeloop/conformance-nightly-verified@1',
          status: 'verified',
          effects: 'not-performed',
        }),
      )
    } else throw new Error('Invalid nightly arguments')
  } catch {
    console.error('conformance nightly: failed; preserve external evidence; diagnostics omitted')
    process.exitCode = 1
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
