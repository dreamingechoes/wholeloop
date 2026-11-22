// Real local executables distinguish unavailable infrastructure from evaluated code and retain audit history.
import { spawnSync } from 'node:child_process'
import {
  accessSync,
  chmodSync,
  constants,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { bundledCanonical } from '../../../src/adapters/canonical.js'
import { ADAPTERS, generateAdapter } from '../../../src/adapters/generate.js'
import { stepDisplay } from '../../../src/display/step.js'
import { FlowEngine } from '../../../src/flow/engine.js'
import { gateRuns } from '../../../src/gates/state.js'
import { GateWorkflow } from '../../../src/gates/workflow.js'
import { StateStore } from '../../../src/state/store.js'
import { SuiteStartError, startupCode, suiteOutputTail } from '../../../src/verification/start.js'
import { verificationRuns } from '../../../src/verification/state.js'
import { runSuite, suitePlan, suiteResultV2 } from '../../../src/verification/suite.js'

async function fixture(action: (context: ReturnType<typeof setup>) => Promise<void> | void) {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-suite-start-')),
    originalPath = process.env.PATH
  try {
    const context = setup(dir)
    process.env.PATH = context.bin
    await action(context)
  } finally {
    if (originalPath === undefined) delete process.env.PATH
    else process.env.PATH = originalPath
    rmSync(dir, { recursive: true, force: true })
  }
}
function setup(dir: string) {
  const root = join(dir, 'repo with spaces'),
    bin = join(dir, 'bin')
  mkdirSync(root)
  mkdirSync(bin)
  const gitPath = (process.env.PATH ?? '')
    .split(delimiter)
    .map((part) => join(part, 'git'))
    .find((file) => {
      try {
        accessSync(file, constants.X_OK)
        return true
      } catch {
        return false
      }
    })
  if (!gitPath) throw new Error('Fixture needs Git')
  symlinkSync(realpathSync(gitPath), join(bin, 'git'))
  const git = (...args: string[]) => {
    const result = spawnSync(gitPath, ['-c', 'core.hooksPath=/dev/null', ...args], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: join(dir, 'no-global-config'),
      },
    })
    if (result.status !== 0) throw new Error(result.stderr)
  }
  git('init', '-b', 'main')
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      name: 'suite-start-fixture',
      private: true,
      scripts: { check: 'node suite.mjs' },
    }),
  )
  writeFileSync(
    join(root, 'suite.mjs'),
    'throw new Error("The isolated npm fixture owns this test")\n',
  )
  git('add', '.')
  git(
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.com',
    'commit',
    '-m',
    'test: seed a startup fixture',
    '-m',
    'Pin declared checks for local infrastructure failure observations.',
  )
  const engine = new FlowEngine(
    new StateStore(join(dir, 'state/wholeloop')),
    root,
    join(dir, 'config/wholeloop/config.yml'),
    join(dir, 'home'),
  )
  const subject = engine.store.create({
    kind: 'review',
    title: 'Check empty input',
    owner: 'Fixture Owner',
    body: '',
    repository: root,
  }).id
  const gates = new GateWorkflow(engine)
  const plan = () =>
    gates.plan(subject, 'verify', {
      base: 'main',
      rounds: 3,
      criteria: [
        {
          id: 'empty',
          text: 'Return status 400 for empty input',
          test: 'Send empty input and assert status 400',
        },
      ],
    }).plan
  const executable = (body: string, mode = 0o755) => {
    writeFileSync(join(bin, 'npm'), `#!${process.execPath}\n${body}\n`)
    chmodSync(join(bin, 'npm'), mode)
  }
  const cli = (run: string, round: number, version = '2', json = true) => {
    const response = spawnSync(
      process.execPath,
      [
        resolve('dist/wl.mjs'),
        'verify',
        'suite',
        '--for',
        subject,
        '--run',
        run,
        '--round',
        String(round),
        '--execution',
        'host',
        ...(version ? ['--result-version', version] : []),
        ...(json ? ['--json'] : []),
      ],
      {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: join(dir, 'home'),
          XDG_STATE_HOME: join(dir, 'state'),
          XDG_CONFIG_HOME: join(dir, 'config'),
          WL_WORKSPACE: '',
        },
      },
    )
    return { code: response.status, value: json ? JSON.parse(response.stdout) : response.stdout }
  }
  return { dir, root, bin, engine, subject, gates, plan, executable, cli }
}

it.each([
  ['missing executable', undefined, undefined, 'ENOENT'],
  ['non-executable script', 'process.exit(0)', 0o644, 'EACCES'],
  ['shell cannot execute', 'process.exit(126)', 0o755, 'exit 126'],
  ['shell cannot find command', 'process.exit(127)', 0o755, 'exit 127'],
] as const)(
  'keeps %s out of the code budget and never reruns its old intent',
  async (_name, body, mode, code) =>
    fixture(async ({ engine, subject, gates, plan, executable }) => {
      if (body) executable(body, mode)
      const initial = plan()
      await expect(
        runSuite(engine, subject, initial.run, initial.round, { execution: 'host' }),
      ).rejects.toThrow(code)
      const events = engine.store.events(),
        failed = verificationRuns(events).at(-1)
      expect(failed?.unavailable?.cause).toMatchObject({
        ref: 'package.json#check',
        executable: 'npm',
        code: expect.stringContaining(code),
      })
      expect(failed?.result).toBeUndefined()
      expect(events.some((event) => event.type === 'gate.decided')).toBe(false)
      expect(() => gates.verdict(subject, 'verify')).toThrow('could not start')
      executable('console.log("new plan only")')
      await expect(
        runSuite(engine, subject, initial.run, initial.round, { execution: 'host' }),
      ).rejects.toBeInstanceOf(SuiteStartError)
      expect(engine.store.events()).toEqual(events)
      const replacement = plan()
      expect(replacement.run).not.toBe(initial.run)
      expect(replacement.round).toBe(1)
      expect(replacement.budget).toBe(initial.budget)
      expect(
        (await runSuite(engine, subject, replacement.run, replacement.round, { execution: 'host' }))
          .result.status,
      ).toBe('passed')
      engine.store.rebuild()
    }),
)

it('carries previously spent code rounds forward across repeated infrastructure failures', async () =>
  fixture(async ({ engine, subject, gates, plan, executable }) => {
    executable('process.exit(7)')
    const first = plan()
    await runSuite(engine, subject, first.run, first.round, { execution: 'host' })
    gates.verdict(subject, 'verify')
    const second = plan()
    expect(second.round).toBe(2)
    executable('process.exit(127)')
    await expect(
      runSuite(engine, subject, second.run, second.round, { execution: 'host' }),
    ).rejects.toThrow('127')
    expect(() =>
      engine.store.transaction((_events, append) =>
        append(subject, {
          type: 'gate.planned',
          data: {
            plan: { ...second, run: 'gate-ffffffffffffffff', round: 1, budget: first.budget },
          },
        }),
      ),
    ).toThrow('remaining evaluation budget')
    const replacement = plan()
    expect(replacement.budget).toBe(first.budget - 1)
    await expect(
      runSuite(engine, subject, replacement.run, replacement.round, { execution: 'host' }),
    ).rejects.toThrow('127')
    const next = gates.plan(subject, 'verify').plan
    expect(next.budget).toBe(replacement.budget)
    expect(() => gates.plan(subject, 'verify', { rounds: 3 })).toThrow('extension')
    executable('process.exit(7)')
    await runSuite(engine, subject, next.run, next.round, { execution: 'host' })
    gates.verdict(subject, 'verify')
    const last = gates.plan(subject, 'verify').plan
    expect(last.round).toBe(2)
    await runSuite(engine, subject, last.run, last.round, { execution: 'host' })
    expect(gates.verdict(subject, 'verify').verdict).toBe('EXHAUSTED')
    expect(() => gates.plan(subject, 'verify')).toThrow('budget exhausted')
    engine.store.rebuild()
  }))

it('does not forgive a startup-labelled process that changes the workspace', async () =>
  fixture(async ({ engine, subject, gates, plan, executable }) => {
    executable('require("node:fs").writeFileSync("unexpected.txt", "changed"); process.exit(126)')
    const initial = plan(),
      result = await runSuite(engine, subject, initial.run, initial.round, { execution: 'host' })
    expect(result.result).toMatchObject({ status: 'failed', unchanged: false })
    expect(gateRuns(engine.store.events()).at(-1)?.unavailable).toBeUndefined()
    expect(gates.verdict(subject, 'verify').verdict).not.toBe('PASS')
    expect(gates.plan(subject, 'verify').plan.round).toBe(2)
  }))

it('refuses discounting a round after criterion work was submitted', async () =>
  fixture(async ({ engine, subject, gates, plan, executable }) => {
    const initial = plan(),
      unit = initial.units.find((unit) => unit.id !== 'suite' && unit.id !== 'testability')
    if (!unit) throw new Error('Fixture needs a criterion unit')
    gates.submit(subject, initial.run, initial.round, {
      unit: unit.id,
      status: 'ok',
      evidence: ['Already inspected'],
      findings: [],
    })
    executable('process.exit(127)')
    await expect(
      runSuite(engine, subject, initial.run, initial.round, { execution: 'host' }),
    ).rejects.toThrow('unexamined')
    expect(gateRuns(engine.store.events()).at(-1)?.unavailable).toBeUndefined()
    await expect(
      runSuite(engine, subject, initial.run, initial.round, { execution: 'host' }),
    ).rejects.toThrow('running or interrupted')
  }))

it('names hashes in v2 and returns a bounded transient failure tail without persisting output', async () =>
  fixture(async ({ engine, subject, plan, executable }) => {
    executable(
      'console.log("x".repeat(5000)); console.error("specific failing assertion"); process.exit(7)',
    )
    const initial = plan(),
      result = await runSuite(engine, subject, initial.run, initial.round, { execution: 'host' }),
      v2 = suiteResultV2(result)
    expect(v2.schema).toBe('wholeloop/verify-suite@2')
    expect(v2.result.commands[0]).toMatchObject({
      stdoutSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      stderrSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
    expect(v2.result.commands[0]).not.toHaveProperty('stdout')
    expect(result.result.commands[0]).toHaveProperty('stdout')
    const evidence = v2.findings[0]?.evidence.join('\n') ?? ''
    expect(evidence).toContain('specific failing assertion')
    expect(evidence.length).toBeLessThan(2200)
    expect(stepDisplay('verify suite', v2).text).toContain('specific failing assertion')
    expect(JSON.stringify(engine.store.events())).not.toContain('specific failing assertion')
    const cached = suiteResultV2(
      await runSuite(engine, subject, initial.run, initial.round, { execution: 'host' }),
    )
    expect(cached.output).toEqual([])
    expect(JSON.stringify(cached.findings)).not.toContain('specific failing assertion')
  }))

it('keeps tails within line and character limits and removes terminal controls', () => {
  const tail = suiteOutputTail([
    { stdout: 'old\n'.repeat(100), stderr: '\u001b[31mnew failure\u001b[0m\n' },
  ])
  expect(tail).toContain('new failure')
  expect(tail).not.toContain('\u001b')
  expect(tail.split('\n').length).toBeLessThanOrEqual(20)
  expect(suiteOutputTail([{ stdout: 'a'.repeat(5000), stderr: 'end' }]).length).toBeLessThanOrEqual(
    2048,
  )
})

it('never categorizes an observed termination signal as an unused startup', () => {
  expect(
    startupCode(
      {
        ref: 'fixture',
        exitCode: -1,
        signal: 'SIGKILL',
        stdout: 'a'.repeat(64),
        stderr: 'b'.repeat(64),
      },
      'EPERM',
    ),
  ).toBeUndefined()
})

it('rejects availability receipts that do not match the declared write-ahead intent', async () =>
  fixture(({ engine, subject, plan }) => {
    const initial = plan(),
      before = engine.store.events(),
      declared = suitePlan(engine, initial)
    expect(() =>
      engine.store.transaction((_events, append) => {
        append(subject, {
          type: 'verify.suite-planned',
          data: { run: initial.run, round: initial.round, plan: declared },
        })
        append(subject, {
          type: 'verify.suite-unavailable',
          data: {
            run: initial.run,
            round: initial.round,
            unchanged: true,
            commands: [
              {
                ref: 'undeclared-command',
                exitCode: 126,
                signal: '',
                stdout: 'a'.repeat(64),
                stderr: 'b'.repeat(64),
              },
            ],
            cause: {
              ref: 'undeclared-command',
              executable: 'npm',
              code: 'not executable (exit 126)',
            },
          },
        })
      }),
    ).toThrow('unique unfinished suite intent')
    expect(engine.store.events()).toEqual(before)
  }))

it('shows a failed assertion in the actual v2 CLI without writing its output into history', async () =>
  fixture(({ engine, plan, executable, cli }) => {
    executable('console.error("actual CLI assertion failed"); process.exit(7)')
    const initial = plan(),
      result = cli(initial.run, initial.round)
    expect(result).toMatchObject({
      code: 4,
      value: { schema: 'wholeloop/verify-suite@2', result: { status: 'failed' } },
    })
    expect(result.value.display.text).toContain('actual CLI assertion failed')
    expect(JSON.stringify(result.value.findings)).toContain('actual CLI assertion failed')
    expect(JSON.stringify(engine.store.events())).not.toContain('actual CLI assertion failed')
  }))

it('shows the live failure tail in plain text by default and rejects unknown versions before execution', async () =>
  fixture(({ engine, plan, executable, cli }) => {
    executable('console.error("plain text assertion failed"); process.exit(7)')
    const initial = plan(),
      before = engine.store.events()
    expect(cli(initial.run, initial.round, '3')).toMatchObject({ code: 2 })
    expect(engine.store.events()).toEqual(before)
    const result = cli(initial.run, initial.round, '', false)
    expect(result.code).toBe(4)
    expect(result.value).toContain('plain text assertion failed')
    expect(result.value).not.toContain('stdoutSha256')
  }))

it('reports startup cause and retained budget through the actual v2 CLI while preserving v1 errors', async () =>
  fixture(({ engine, subject, plan, executable, cli }) => {
    executable('process.exit(127)')
    const initial = plan(),
      result = cli(initial.run, initial.round)
    expect(result).toMatchObject({
      code: 3,
      value: {
        schema: 'wholeloop/verify-suite@2',
        status: 'unavailable',
        result: null,
        roundSpent: false,
        cause: { ref: 'package.json#check', code: 'command not found (exit 127)' },
      },
    })
    expect(result.value.display.text).toContain('budget retained')
    expect(result.value.display.text).toContain('package.json#check')
    expect(cli(initial.run, initial.round, '1')).toMatchObject({
      code: 3,
      value: { schema: 'wholeloop/error@1', message: expect.stringContaining('could not start') },
    })
    expect(engine.store.events().some((event) => event.type === 'gate.decided')).toBe(false)
    expect(subject).toBeTruthy()
  }))

it('reads actual successful v1 and v2 receipts without executing a command twice', async () =>
  fixture(({ dir, root, plan, executable, cli }) => {
    const counter = join(dir, 'calls')
    executable(
      `require('node:fs').appendFileSync(${JSON.stringify(counter)}, 'called'); console.log('passed')`,
    )
    const initial = plan(),
      v1 = cli(initial.run, initial.round, '1'),
      v2 = cli(initial.run, initial.round)
    expect(v1).toMatchObject({
      code: 0,
      value: { schema: 'wholeloop/verify-suite@1', result: { status: 'passed' } },
    })
    expect(v1.value.result.commands[0]).toHaveProperty('stdout')
    expect(v2).toMatchObject({
      code: 0,
      value: { schema: 'wholeloop/verify-suite@2', cached: true, output: [] },
    })
    expect(v2.value.result.commands[0]).toHaveProperty('stdoutSha256')
    expect(existsSync(join(root, 'unexpected.txt'))).toBe(false)
    expect(readFileSync(counter, 'utf8')).toBe('called')
  }))

it.each(ADAPTERS)(
  '$id renders v2 suite observations and the startup stop before workers',
  (adapter) => {
    const generated = generateAdapter(
        adapter.id,
        bundledCanonical(),
        '#!/usr/bin/env node\n',
        '0.0.0',
      ),
      skill = generated.files.get(adapter.paths('skill', 'verify-works'))?.content ?? ''
    expect(skill).toContain('--result-version 2')
    expect(skill).toContain('known startup failure stops before workers')
    expect(skill).toContain('never rerun the old intent')
  },
)
