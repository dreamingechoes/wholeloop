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
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import {
  aggregateNightly,
  collectNightly,
  nativeNightlyEnvironment,
  nightlyBinding,
  nightlyObservation,
  verifyNightlyCore,
} from '../../../scripts/conformance-nightly.mjs'
import { provisionArguments } from '../../../scripts/conformance-provision.mjs'
import { reportedRegression } from '../../support/conformance.js'

const targets = ['claude', 'codex', 'opencode', 'copilot', 'gemini', 'antigravity', 'cursor']
const digest = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex')
const core = digest(readFileSync('dist/wl.mjs'))
const context = {
  GITHUB_ACTIONS: 'true',
  GITHUB_SERVER_URL: 'https://github.com',
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_SHA: 'a'.repeat(40),
  GITHUB_REF: 'refs/heads/main',
  GITHUB_RUN_ID: '123',
  GITHUB_RUN_ATTEMPT: '2',
  CONFORMANCE_DEFAULT_BRANCH: 'main',
  CONFORMANCE_CORE_SHA256: core,
}
const fixtureKey = 'fixture-only-noncredential'
const temporary = () => realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-nightly-test-')))
function json(path: string, value: unknown) {
  writeFileSync(path, JSON.stringify(value))
}
function invoke(executable: string, args: string[], options = {}) {
  const result = spawnSync(executable, args, { ...options, encoding: 'utf8', timeout: 10000 })
  if (![0, 4].includes(result.status ?? -1)) throw new Error(result.stdout + result.stderr)
  return result.stdout
}
function observed(cli: string, index = 0) {
  const result = reportedRegression(core, new Date().toISOString())
  result.runs.forEach((run, i) => {
    run.report.cli = cli
    run.report.id = `cf-${(index * 2 + i).toString(16).padStart(24, '0')}`
  })
  return result
}
function nativePlan(root: string, cli: string) {
  const directory = join(root, `native-${cli}`)
  mkdirSync(directory)
  json(join(directory, 'collection.json'), {
    schema: 'wholeloop/conformance-collection@1',
    entries: [
      { cli, channel: 'pinned', pin: '1.2.3' },
      { cli, channel: 'latest', pin: '1.2.4' },
    ],
  })
  return directory
}
function importedBatch(root: string) {
  const directory = join(root, 'inputs')
  mkdirSync(directory)
  for (const [index, cli] of targets.entries()) {
    const path = join(directory, `observations-123-2-${cli}`)
    mkdirSync(path)
    const observations = observed(cli, index)
    json(join(path, 'results.json'), observations)
    json(join(path, 'receipt.json'), {
      schema: 'wholeloop/conformance-nightly-client@1',
      source: context.GITHUB_SHA,
      core,
      run: '123',
      attempt: '2',
      cli,
      status: 'completed',
      observations: 2,
      results: digest(readFileSync(join(path, 'results.json'))),
    })
  }
  return directory
}

describe('explicit nightly context and native boundaries', () => {
  it('requires selected default-branch schedule/manual context and exact transferred core', () => {
    expect(nightlyBinding(context)).toEqual({
      source: context.GITHUB_SHA,
      run: '123',
      attempt: '2',
    })
    verifyNightlyCore(core)
    expect(() => verifyNightlyCore('f'.repeat(64))).toThrow()
    for (const patch of [
      { GITHUB_ACTIONS: 'false' },
      { GITHUB_EVENT_NAME: 'pull_request' },
      { GITHUB_REF: 'refs/heads/other' },
      { GITHUB_SHA: 'main' },
      { GITHUB_RUN_ATTEMPT: 'latest' },
      { GITHUB_SERVER_URL: 'https://elsewhere.invalid' },
    ])
      expect(() => nightlyBinding({ ...context, ...patch })).toThrow()
  })
  it.each(targets)('exposes only the selected %s native key in a fresh environment', (cli) => {
    const env = nativeNightlyEnvironment(
      cli,
      '/tmp/fixture-home',
      fixtureKey,
      'openai/fixture-model',
    )
    expect(Object.values(env).filter((value) => value === fixtureKey)).toHaveLength(1)
    expect(env).not.toHaveProperty('CONFORMANCE_NATIVE_KEY')
    expect(env).not.toHaveProperty('GH_TOKEN')
    expect(env).not.toHaveProperty('GITHUB_TOKEN')
    expect(env).not.toHaveProperty('NODE_OPTIONS')
    expect(env.HOME).toBe('/tmp/fixture-home')
    expect(env.XDG_DATA_HOME).toBe('/tmp/fixture-home/data')
    if (cli === 'opencode')
      expect(JSON.parse(env.OPENCODE_CONFIG_CONTENT ?? '{}')).toEqual({
        model: 'openai/fixture-model',
      })
  })
  it('refuses ambiguous provisioning options and absent/unsafe keys or model selection', () => {
    expect(provisionArguments(['--target', 'gemini', '--install', '/tmp/new'])).toEqual({
      target: 'gemini',
      destination: '/tmp/new',
    })
    expect(provisionArguments([])).toEqual({ target: undefined, destination: undefined })
    for (const args of [
      ['--target'],
      ['--target', 'other'],
      ['--install', '/tmp/a', '--install', '/tmp/b'],
      ['--write', 'true'],
    ])
      expect(() => provisionArguments(args)).toThrow()
    for (const key of ['', 'unsafe\nvalue'])
      expect(() => nativeNightlyEnvironment('claude', '/tmp/home', key)).toThrow()
    expect(() => nativeNightlyEnvironment('opencode', '/tmp/home', fixtureKey)).toThrow()
    expect(() =>
      nativeNightlyEnvironment('opencode', '/tmp/home', fixtureKey, 'other/model'),
    ).toThrow()
  })
  it('records unconfigured clients without executing or labelling simulation as native evidence', () => {
    const root = temporary()
    try {
      const native = nativePlan(root, 'claude'),
        output = join(root, 'output')
      let calls = 0
      const receipt = collectNightly('claude', native, output, {
        env: context,
        command: (...args) => {
          calls++
          return invoke(...args)
        },
      })
      expect(calls).toBe(1)
      expect(receipt.status).toBe('unconfigured')
      expect(receipt.observations).toBe(0)
      expect(JSON.parse(readFileSync(join(output, 'results.json'), 'utf8')).runs).toEqual([])
      expect(readdirSync(output).sort()).toEqual(['receipt.json', 'results.json'])
      expect(lstatSync(output).mode & 0o777).toBe(0o700)
      expect(() => collectNightly('claude', native, output, { env: context })).toThrow()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
  it.each(['claude', 'gemini', 'antigravity', 'opencode'])(
    'collects isolated %s channels through a synthetic transport and preserves only structure',
    (cli) => {
      const root = temporary()
      try {
        const native = nativePlan(root, cli),
          output = join(root, 'output'),
          homes: string[] = []
        const fixture = observed(cli)
        const receipt = collectNightly(cli, native, output, {
          env: {
            ...context,
            CONFORMANCE_NATIVE_KEY: fixtureKey,
            CONFORMANCE_NATIVE_MODEL: 'openai/fixture-model',
            GH_TOKEN: 'other-fixture-only',
            NODE_OPTIONS: '--invalid',
          },
          command: (exe, args, options) => {
            if (args[2] !== 'collect') return invoke(exe, args, options)
            expect(options.env).not.toHaveProperty('GH_TOKEN')
            expect(options.env).not.toHaveProperty('NODE_OPTIONS')
            expect(options.env).not.toHaveProperty('CONFORMANCE_NATIVE_KEY')
            const selected = JSON.parse(readFileSync(String(args[3]), 'utf8')).entries[0]
            const home = String(options.env?.HOME)
            homes.push(home)
            if (cli === 'gemini' || cli === 'antigravity') {
              const path = join(
                home,
                '.gemini',
                ...(cli === 'antigravity' ? ['antigravity-cli'] : []),
                'settings.json',
              )
              const text = readFileSync(path, 'utf8')
              expect(text).not.toContain(fixtureKey)
              expect(JSON.parse(text)).toEqual(
                cli === 'antigravity'
                  ? { modelProvider: 'gemini' }
                  : { security: { auth: { selectedType: 'gemini-api-key' } } },
              )
            }
            const row = fixture.runs.find((run) => run.channel === selected.channel)
            return JSON.stringify({
              schema: 'wholeloop/conformance-results@1',
              mode: 'live',
              status: 'completed',
              runs: [
                {
                  ...row,
                  privateField: 'omit',
                  report: {
                    ...row?.report,
                    journal: '/private/path',
                    rawOutput: 'private',
                    limitations: ['private imported prose'],
                  },
                },
              ],
            })
          },
        })
        expect(receipt.status).toBe('completed')
        expect(new Set(homes).size).toBe(2)
        const text = readFileSync(join(output, 'results.json'), 'utf8')
        expect(text).not.toMatch(
          /\/private\/path|private imported prose|privateField|rawOutput|fixture-only-noncredential/,
        )
        expect(JSON.parse(text).runs).toHaveLength(2)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    },
  )
  it('refuses wrong source/core/selected channels before producing a usable client artifact', () => {
    const root = temporary()
    try {
      const native = nativePlan(root, 'claude')
      expect(() =>
        collectNightly('claude', native, join(root, 'bad-core'), {
          env: { ...context, CONFORMANCE_CORE_SHA256: 'f'.repeat(64) },
        }),
      ).toThrow()
      expect(existsSync(join(root, 'bad-core'))).toBe(false)
      json(join(native, 'collection.json'), {
        schema: 'wholeloop/conformance-collection@1',
        entries: [
          { cli: 'codex', channel: 'pinned' },
          { cli: 'claude', channel: 'latest' },
        ],
      })
      expect(() =>
        collectNightly('claude', native, join(root, 'wrong-target'), { env: context }),
      ).toThrow()
      expect(existsSync(join(root, 'wrong-target'))).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('structural nightly aggregation', () => {
  it('projects seven exact job artifacts into fourteen matrix rows, issue drafts and an external owned page', () => {
    const root = temporary(),
      source = readFileSync('docs/platforms/README.md', 'utf8')
    try {
      const input = importedBatch(root),
        output = join(root, 'output')
      const receipt = aggregateNightly(input, output, context)
      expect(receipt.effects).toBe('artifacts-only')
      expect(receipt.clients).toHaveLength(7)
      const matrix = JSON.parse(readFileSync(join(output, 'matrix.json'), 'utf8'))
      expect(matrix.rows).toHaveLength(14)
      expect(matrix.regressionCandidates).toHaveLength(7)
      expect(JSON.parse(readFileSync(join(output, 'issues.json'), 'utf8')).issues).toHaveLength(7)
      const page = readFileSync(join(output, 'docs/platforms/README.md'), 'utf8')
      expect(page).toContain('Supplied observations are not independently authenticated')
      expect(readFileSync('docs/platforms/README.md', 'utf8')).toBe(source)
      expect(receipt.results).toBe(digest(readFileSync(join(output, 'results.json'))))
      expect(readdirSync(output).sort()).toEqual([
        'docs',
        'issues.json',
        'matrix.json',
        'matrix.md',
        'receipt.json',
        'results.json',
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
  it.each([
    'source',
    'core',
    'digest',
    'missing-client',
    'extra-file',
    'linked-directory',
    'wrong-client',
    'duplicate-channel',
    'old-attempt',
  ])('refuses %s inputs before issue delivery', (kind) => {
    const root = temporary()
    try {
      const input = importedBatch(root),
        directory = join(input, 'observations-123-2-claude'),
        file = join(directory, 'receipt.json'),
        receipt = JSON.parse(readFileSync(file, 'utf8'))
      if (kind === 'source') {
        receipt.source = 'b'.repeat(40)
        json(file, receipt)
      }
      if (kind === 'core') {
        receipt.core = 'f'.repeat(64)
        json(file, receipt)
      }
      if (kind === 'digest') {
        receipt.results = 'f'.repeat(64)
        json(file, receipt)
      }
      if (kind === 'missing-client') rmSync(directory, { recursive: true })
      if (kind === 'extra-file') writeFileSync(join(directory, 'unapproved.log'), 'fixture')
      if (kind === 'linked-directory') {
        const saved = join(root, 'saved')
        mkdirSync(saved)
        rmSync(directory, { recursive: true })
        symlinkSync(saved, directory)
      }
      if (kind === 'wrong-client' || kind === 'duplicate-channel') {
        const result = observed(kind === 'wrong-client' ? 'codex' : 'claude')
        if (kind === 'duplicate-channel') {
          const latest = result.runs.at(1)
          if (!latest) throw new Error('Missing fixture latest row')
          latest.channel = 'pinned'
        }
        json(join(directory, 'results.json'), result)
        receipt.results = digest(readFileSync(join(directory, 'results.json')))
        json(file, receipt)
      }
      const env = kind === 'old-attempt' ? { ...context, GITHUB_RUN_ATTEMPT: '3' } : context
      expect(() => aggregateNightly(input, join(root, 'output'), env)).toThrow()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
  it('keeps absent credentials visibly unconfigured and all corresponding matrix rows UNRUN', () => {
    const root = temporary()
    try {
      const input = importedBatch(root)
      for (const cli of targets) {
        const path = join(input, `observations-123-2-${cli}`),
          receipt = JSON.parse(readFileSync(join(path, 'receipt.json'), 'utf8'))
        json(join(path, 'results.json'), { schema: 'wholeloop/conformance-results@1', runs: [] })
        json(join(path, 'receipt.json'), {
          ...receipt,
          status: 'unconfigured',
          observations: 0,
          results: digest(readFileSync(join(path, 'results.json'))),
        })
      }
      const output = join(root, 'output')
      aggregateNightly(input, output, context)
      expect(
        JSON.parse(readFileSync(join(output, 'matrix.json'), 'utf8')).rows.every(
          (row: { status: string }) => row.status === 'UNRUN',
        ),
      ).toBe(true)
      expect(JSON.parse(readFileSync(join(output, 'issues.json'), 'utf8')).issues).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
  it('omits imported report/process prose and private fields', () => {
    const run = reportedRegression().runs[0]
    if (!run) throw new Error('Missing fixture baseline row')
    const result = nightlyObservation({
      ...run,
      report: {
        ...run.report,
        journal: 'private',
        credential: fixtureKey,
        process: { ...run.report.process, private: 'omit' },
      },
    })
    expect(JSON.stringify(result)).not.toMatch(/credential|fixture-only-noncredential|private|omit/)
  })
})

describe('nightly host entrypoint', () => {
  it('refuses a changed transferred core before provisioning/network and reports no private diagnostics', () => {
    const result = spawnSync(
      process.execPath,
      [resolve('scripts/conformance-provision.mjs'), '--target', 'codex'],
      {
        env: {
          ...context,
          CONFORMANCE_CORE_SHA256: 'f'.repeat(64),
          CONFORMANCE_NATIVE_KEY: fixtureKey,
        },
        encoding: 'utf8',
        timeout: 10000,
      },
    )
    expect(result.status).toBe(1)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('diagnostics omitted')
    expect(result.stderr).not.toContain(fixtureKey)
  })
  it('binds the actual checkout and core under supplied synthetic CI context without service access', () => {
    const root = temporary()
    try {
      const head = spawnSync('git', ['rev-parse', '--verify', 'HEAD'], { encoding: 'utf8' })
      expect(head.status).toBe(0)
      const output = join(root, 'runner-output')
      const result = spawnSync(
        process.execPath,
        [resolve('scripts/conformance-nightly.mjs'), 'core'],
        {
          env: { ...context, GITHUB_SHA: head.stdout.trim(), GITHUB_OUTPUT: output },
          encoding: 'utf8',
        },
      )
      expect(result.status, result.stdout + result.stderr).toBe(0)
      expect(JSON.parse(result.stdout)).toMatchObject({ source: head.stdout.trim(), sha256: core })
      expect(readFileSync(output, 'utf8')).toBe(`sha256=${core}\n`)
      const refused = spawnSync(
        process.execPath,
        [resolve('scripts/conformance-nightly.mjs'), 'core'],
        { env: context, encoding: 'utf8' },
      )
      expect(refused.status).toBe(1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
  it('verifies exact transferred result bytes and redacts invalid context/digest failures', () => {
    const root = temporary(),
      file = join(root, 'results.json')
    json(file, { schema: 'wholeloop/conformance-results@1', runs: [] })
    const run = (expected: string, patch: NodeJS.ProcessEnv = {}) =>
      spawnSync(
        process.execPath,
        [resolve('scripts/conformance-nightly.mjs'), 'verify-results', file, expected],
        { env: { ...context, ...patch }, encoding: 'utf8' },
      )
    try {
      const result = run(digest(readFileSync(file)))
      expect(result.status, result.stdout + result.stderr).toBe(0)
      expect(JSON.parse(result.stdout).effects).toBe('not-performed')
      expect(run('f'.repeat(64)).status).toBe(1)
      const refused = run(digest(readFileSync(file)), {
        GITHUB_EVENT_NAME: 'pull_request',
        CONFORMANCE_NATIVE_KEY: fixtureKey,
      })
      expect(refused.status).toBe(1)
      expect(refused.stderr).not.toContain(fixtureKey)
      expect(refused.stdout).toBe('')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('nightly workflow authority boundaries', () => {
  it('requires operator variables, exact core artifacts and a separate serialized issue writer', () => {
    const workflow = parse(readFileSync('.github/workflows/conformance.yml', 'utf8'))
    expect(Object.keys(workflow.on).sort()).toEqual(['schedule', 'workflow_dispatch'])
    expect(workflow.permissions).toEqual({ contents: 'read' })
    expect(workflow.jobs.core.if).toContain("vars.WHOLELOOP_CONFORMANCE_ENABLED == 'true'")
    expect(workflow.jobs.core.if).toContain('default_branch')
    expect(workflow.jobs.observe.strategy['max-parallel']).toBe(2)
    expect(
      workflow.jobs.observe.strategy.matrix.include.map((entry: { cli: string }) => entry.cli),
    ).toEqual(targets)
    const observe = workflow.jobs.observe
    expect(observe.env).not.toHaveProperty('CONFORMANCE_NATIVE_KEY')
    const secretSteps = observe.steps.filter(
      (step: { env?: Record<string, string> }) => step.env?.CONFORMANCE_NATIVE_KEY,
    )
    expect(secretSteps).toHaveLength(1)
    expect(secretSteps[0].run).toContain('conformance-nightly.mjs collect')
    expect(
      observe.steps.find((step: { run?: string }) => step.run?.includes('conformance-provision'))
        .env,
    ).toBeUndefined()
    expect(workflow.jobs.issues.permissions).toEqual({ contents: 'read', issues: 'write' })
    expect(workflow.jobs.issues.if).toBe("vars.WHOLELOOP_CONFORMANCE_ISSUES == 'true'")
    expect(workflow.jobs.issues.concurrency).toEqual({
      group: 'conformance-issues',
      'cancel-in-progress': false,
    })
    for (const job of Object.values(workflow.jobs) as {
      steps: { uses?: string; with?: Record<string, unknown>; run?: string }[]
    }[]) {
      for (const step of job.steps) {
        if (step.uses) expect(step.uses).toMatch(/@[a-f0-9]{40}$/)
        if (step.uses?.startsWith('actions/checkout@'))
          expect(step.with).toMatchObject({
            // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub expression syntax is literal YAML data.
            ref: '${{ github.sha }}',
            'persist-credentials': false,
          })
        if (step.uses?.startsWith('actions/download-artifact@'))
          expect(step.with?.['digest-mismatch']).toBe('error')
        expect(step.run ?? '').not.toMatch(/git push|npm publish|release\.mjs publish/)
      }
    }
    expect(
      workflow.jobs.issues.steps.some((step: { run?: string }) =>
        step.run?.includes('verify-results'),
      ),
    ).toBe(true)
  })
})
