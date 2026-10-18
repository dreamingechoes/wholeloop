import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runVerification } from '../../../harness/workflows/verification.js'
import { FlowEngine } from '../../../src/flow/engine.js'
import { GateWorkflow } from '../../../src/gates/workflow.js'
import { StateStore } from '../../../src/state/store.js'
import { runSuite, suiteGateResult } from '../../../src/verification/suite.js'
import { constantAssertions } from '../../../src/verification/testability.js'
import { VerificationWorkflow } from '../../../src/verification/workflow.js'

const criteria = [
  {
    id: 'empty',
    text: 'Return 400 for empty input',
    test: 'Send empty input and assert status 400',
  },
]
async function fixture(
  run: (context: {
    dir: string
    root: string
    engine: FlowEngine
    workflow: VerificationWorkflow
    script: (code: string) => void
  }) => void | Promise<void>,
) {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-verification-'))
  const root = join(dir, 'repo with spaces')
  mkdirSync(root)
  const git = (...args: string[]) => {
    const result = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: join(dir, 'no-global-config'),
      },
    })
    if (result.status !== 0) throw new Error(`Fixture Git failed: ${result.stderr}`)
  }
  const script = (code: string) => writeFileSync(join(root, 'suite.mjs'), code)
  try {
    git('init', '-b', 'main')
    writeFileSync(join(root, '.gitignore'), 'suite-count.txt\n')
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({
        name: 'verification-fixture',
        private: true,
        scripts: { check: 'node suite.mjs', test: 'node suite.mjs' },
      }),
    )
    script(
      "import { readFileSync, writeFileSync } from 'node:fs'; let count = 0; try { count = Number(readFileSync('suite-count.txt', 'utf8')) } catch {} writeFileSync('suite-count.txt', String(count + 1)); console.log('fixture: check passed')\n",
    )
    git('add', '.')
    git(
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.com',
      'commit',
      '-m',
      'feat: seed verification fixture',
      '-m',
      'Pin a real process and test suite for verification workflows.',
    )
    git('branch', 'feature/empty-request')
    const engine = new FlowEngine(
      new StateStore(join(dir, 'state/wholeloop')),
      root,
      join(dir, 'config/wholeloop/config.yml'),
      join(dir, 'home'),
    )
    await run({ dir, root, engine, workflow: new VerificationWorkflow(engine), script })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
function planned(workflow: VerificationWorkflow) {
  const result = workflow.begin({
    branch: 'feature/empty-request',
    base: 'main',
    owner: 'Owner',
    by: 'Owner',
    criteria,
  })
  if (!('plan' in result)) throw new Error('Expected a verification plan')
  return result
}

describe('real once-per-round suite execution', () => {
  it('runs checks once, shares the receipt, returns output without storing it, and completes from a current PASS', async () =>
    fixture(async ({ workflow, engine }) => {
      const { subject, plan } = planned(workflow)
      expect(subject).toBeTruthy()
      const first = await runSuite(engine, subject ?? '', plan.run, 1)
      expect(first.result.status).toBe('passed')
      expect(first.output[0]?.stdout).toContain('fixture: check passed')
      expect(readFileSync(join(plan.repository, 'suite-count.txt'), 'utf8')).toBe('1')
      const repeated = await runSuite(engine, subject ?? '', plan.run, 1)
      expect(repeated.cached).toBe(true)
      expect(repeated.output).toEqual([])
      expect(readFileSync(join(plan.repository, 'suite-count.txt'), 'utf8')).toBe('1')
      const gates = new GateWorkflow(engine)
      for (const unit of plan.units.filter((unit) => unit.id !== 'suite'))
        gates.submit(subject ?? '', plan.run, 1, {
          unit: unit.id,
          status: 'ok',
          findings: [],
          evidence: ['Synthetic observed empty request fixture'],
        })
      expect(gates.verdict(subject ?? '', 'verify').verdict).toBe('PASS')
      expect(workflow.complete(subject ?? '').step).toBe('verify-works')
      const journal = engine.store
        .events()
        .filter((event) => event.type === 'verify.suite-finished')
      expect(JSON.stringify(journal)).not.toContain('fixture: check passed')
      const path = `items/${subject}/verification/${plan.run}/1.json`
      const bytes = engine.store.files.read(path)
      engine.store.rebuild()
      expect(engine.store.files.read(path)).toBe(bytes)
    }))

  it('serializes two callers through the durable intent and never launches a second suite', async () =>
    fixture(async ({ workflow, engine }) => {
      const { subject, plan } = planned(workflow)
      const results = await Promise.allSettled([
        runSuite(engine, subject ?? '', plan.run, 1),
        runSuite(engine, subject ?? '', plan.run, 1),
      ])
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
      expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
      expect(readFileSync(join(plan.repository, 'suite-count.txt'), 'utf8')).toBe('1')
    }))

  it('preserves an interrupted intent and requires a fresh round instead of rerunning', async () =>
    fixture(async ({ workflow, engine }) => {
      const { subject, plan } = planned(workflow)
      engine.store.transaction((_events, append) =>
        append(subject ?? '', {
          type: 'verify.suite-planned',
          data: {
            run: plan.run,
            round: 1,
            plan: {
              commands: [
                {
                  ref: 'package.json#check',
                  cwd: '.',
                  argv: ['npm', 'run', 'check'],
                  priority: 190,
                  reason: 'Fixture command',
                },
              ],
              timeoutMs: 120000,
            },
          },
        }),
      )
      await expect(runSuite(engine, subject ?? '', plan.run, 1)).rejects.toThrow(
        'running or interrupted',
      )
    }))

  it.each(['failure', 'timeout', 'mutation'])(
    'records %s without granting a clean suite',
    async (mode) =>
      fixture(async ({ workflow, engine, script }) => {
        script(
          mode === 'failure'
            ? "console.error('fixture: intentional failure'); process.exit(7)\n"
            : mode === 'timeout'
              ? 'setInterval(() => {}, 1000)\n'
              : "import { writeFileSync } from 'node:fs'; writeFileSync('unexpected.txt', 'Fixture mutation')\n",
        )
        // The feature branch starts at the committed base; change its isolated suite explicitly before planning.
        const { subject, plan } = planned(workflow)
        writeFileSync(
          join(plan.repository, 'suite.mjs'),
          readFileSync(join(engine.root, 'suite.mjs')),
        )
        const gates = new GateWorkflow(engine)
        gates.verdict(subject ?? '', 'verify')
        const next = gates.plan(subject ?? '', 'verify').plan
        const result = await runSuite(engine, subject ?? '', next.run, next.round, {
          timeoutMs: mode === 'timeout' ? 200 : 120000,
        })
        expect(result.result.status).toBe('failed')
        expect(suiteGateResult(result.result).findings).toHaveLength(1)
        if (mode === 'mutation') expect(result.result.unchanged).toBe(false)
        else expect(result.result.unchanged).toBe(true)
        expect(gates.verdict(subject ?? '', 'verify').verdict).not.toBe('PASS')
      }),
  )
})

describe('verification criteria and changed-test coverage', () => {
  it('asks for PR criteria and checkout identity without mutation', async () =>
    fixture(({ workflow, engine }) => {
      const result = workflow.begin({
        pr: 'https://github.com/example/project/pull/7',
        base: 'main',
        owner: 'Owner',
        by: 'Owner',
      })
      expect(result.status).toBe('question')
      expect(result.questions.map(({ id }) => id)).toEqual(['criteria', 'checkout-ref'])
      expect(engine.store.events()).toEqual([])
    }))
  it.each([
    ['expect(true).toBe(true)', 1],
    ['expect(1).toEqual(1)', 1],
    ['expect("ok").toStrictEqual("ok")', 1],
    ['assert.ok(true)', 1],
    ['expect(response.status).toBe(400)', 0],
    ['expect(true).toBe(false)', 0],
    ['// expect(true).toBe(true)', 0],
    ['const fixture = "expect(true).toBe(true)"', 0],
    ['/* example: expect(true).toBe(true) */', 0],
    ['const example = `assert.ok(true)`', 0],
  ])('flags constant assertion %s with %i findings', (code, count) => {
    expect(constantAssertions('request.test.ts', code)).toHaveLength(Number(count))
  })

  it('adds core lint and a semantic changed-test group, preserving a cannot-fail fixture as a blocker', async () =>
    fixture(({ workflow, engine }) => {
      const first = planned(workflow)
      writeFileSync(
        join(first.plan.repository, 'request.test.ts'),
        "test('empty input', () => { expect(true).toBe(true) })\n",
      )
      const gates = new GateWorkflow(engine)
      gates.verdict(first.subject ?? '', 'verify')
      const second = gates.plan(first.subject ?? '', 'verify').plan
      expect(second.units.map(({ id }) => id)).toContain('changed-tests')
      const report = gates.verdict(first.subject ?? '', 'verify')
      expect(report.report.kept[0]?.finding.text).toContain('cannot observe a regression')
      expect(report.verdict).toBe('FAIL')
    }))

  it('executes begin, suite and completion guards through the asynchronous built CLI', async () =>
    fixture(({ dir, root }) => {
      const invoke = (expected: number, ...args: string[]) => {
        const result = spawnSync(process.execPath, [resolve('dist/wl.mjs'), ...args, '--json'], {
          cwd: root,
          encoding: 'utf8',
          env: {
            ...process.env,
            XDG_STATE_HOME: join(dir, 'state'),
            XDG_CONFIG_HOME: join(dir, 'config'),
            HOME: join(dir, 'home'),
            // Keep runtime executables ahead of HOME-dependent version-manager shims.
            PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ''}`,
          },
        })
        expect(result.stderr).toBe('')
        expect(result.status, result.stdout).toBe(expected)
        return JSON.parse(result.stdout)
      }
      invoke(
        2,
        'verify',
        'begin',
        'https://github.com/example/project/pull/7',
        '--base',
        'main',
        '--owner',
        'Owner',
        '--by',
        'Owner',
      )
      const file = join(dir, 'criteria.json')
      writeFileSync(file, JSON.stringify({ schema: 'wholeloop/criteria@1', criteria }))
      const started = invoke(
        0,
        'verify',
        'begin',
        'feature/empty-request',
        '--base',
        'main',
        '--owner',
        'Owner',
        '--by',
        'Owner',
        '--criteria',
        file,
      )
      const suite = invoke(
        0,
        'verify',
        'suite',
        '--for',
        started.subject,
        '--run',
        started.plan.run,
        '--round',
        '1',
      )
      expect(suite.result.status).toBe('passed')
      expect(
        invoke(
          0,
          'verify',
          'suite',
          '--for',
          started.subject,
          '--run',
          started.plan.run,
          '--round',
          '1',
        ).cached,
      ).toBe(true)
      invoke(3, 'verify', 'complete', '--for', started.subject)
    }))
})

describe('shared verification host workflow', () => {
  it('shares actual suite observations with read-only criterion workers and creates the canonical receipt', async () =>
    fixture(async ({ engine }) => {
      let observed = false
      const result = await runVerification(
        engine,
        { branch: 'feature/empty-request', base: 'main', owner: 'Owner', by: 'Owner', criteria },
        {
          stopped() {
            return false
          },
          observeSuite(suite) {
            observed = true
            expect(suite.output[0]?.stdout).toContain('fixture: check passed')
          },
          async inspect(_plan, unit) {
            expect(observed).toBe(true)
            return {
              unit: unit.id,
              status: 'ok',
              evidence: ['Synthetic criterion worker used the shared actual suite output'],
              findings: [],
            }
          },
          async refute(_plan, finding, verifier) {
            return {
              finding,
              verifier,
              outcome: 'uncertain',
              reason: 'No counterevidence',
              evidence: [],
            }
          },
        },
        'sequential',
      )
      expect(result.status).toBe('PASS')
      expect('receipt' in result).toBe(true)
    }))

  it('marks a cached suite as historical after workspace changes and rejects changing its pinned commands', async () =>
    fixture(async ({ engine, workflow }) => {
      const { subject, plan } = planned(workflow)
      await runSuite(engine, subject ?? '', plan.run, 1)
      await expect(
        runSuite(engine, subject ?? '', plan.run, 1, { refs: ['package.json#test'] }),
      ).rejects.toThrow('already pinned')
      writeFileSync(join(plan.repository, 'new-code.ts'), 'Changed after execution\n')
      expect((await runSuite(engine, subject ?? '', plan.run, 1)).current).toBe(false)
    }))
})

describe('observed suite failures remain mandatory', () => {
  it('does not refute an actual failed process into a PASS', async () =>
    fixture(async ({ workflow, engine }) => {
      const { subject, plan } = planned(workflow)
      writeFileSync(join(plan.repository, 'suite.mjs'), 'process.exit(7)\n')
      const gates = new GateWorkflow(engine)
      gates.verdict(subject ?? '', 'verify')
      const next = gates.plan(subject ?? '', 'verify').plan
      await runSuite(engine, subject ?? '', next.run, next.round)
      for (const unit of next.units.filter((unit) => unit.id !== 'suite'))
        gates.submit(subject ?? '', next.run, next.round, {
          unit: unit.id,
          status: 'ok',
          findings: [],
          evidence: ['Synthetic criterion observation'],
        })
      for (let verifier = 1; verifier <= 3; verifier++)
        gates.submit(subject ?? '', next.run, next.round, {
          finding: 'suite:suite-failed',
          verifier,
          outcome: 'refute',
          reason: 'Synthetic claim that the failed suite is irrelevant',
          evidence: ['Counterargument does not change the actual exit code'],
        })
      const result = gates.verdict(subject ?? '', 'verify')
      expect(result.verdict).toBe('FAIL')
      expect(result.report.missing).toContain('suite-execution')
    }))
})

describe('recorded criteria are immutable inputs to verification', () => {
  it('rejects an invocation that replaces the agreement instead of weakening planned work', async () =>
    fixture(({ workflow, engine }) => {
      const first = planned(workflow)
      const count = engine.store.events().length
      const weakened = [
        { ...criteria[0], id: 'empty', text: 'Return any response', test: 'Observe a response' },
      ]
      expect(() => workflow.begin({ subject: first.subject ?? '', criteria: weakened })).toThrow(
        'cannot be overridden',
      )
      expect(() =>
        new GateWorkflow(engine).plan(first.subject ?? '', 'verify', { criteria: weakened }),
      ).toThrow('cannot be overridden')
      expect(engine.store.events()).toHaveLength(count)
    }))
})
