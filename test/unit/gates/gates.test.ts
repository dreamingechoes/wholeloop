import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { stringify } from 'yaml'
import { resolveConfig } from '../../../src/config/resolve.js'
import type { Criterion } from '../../../src/definition/criteria.js'
import { FlowEngine } from '../../../src/flow/engine.js'
import type { GateFinding, GatePlan, GateResult } from '../../../src/gates/contracts.js'
import { pathMatches } from '../../../src/gates/lenses.js'
import { workspaceSnapshot } from '../../../src/gates/snapshot.js'
import { gateRuns } from '../../../src/gates/state.js'
import { GateWorkflow } from '../../../src/gates/workflow.js'
import { StateStore } from '../../../src/state/store.js'

const criteria: Criterion[] = [
  {
    id: 'reject-empty',
    text: 'Reject an empty request with status 400',
    test: 'Send an empty request and assert status 400',
  },
]
const defect: GateFinding = {
  id: 'unsafe-null',
  location: 'app.ts:1',
  text: 'Empty input reaches a null dereference',
  evidence: ['The empty request calls trim on null at app.ts:1'],
}
function fixture(
  run: (context: {
    dir: string
    root: string
    engine: FlowEngine
    workflow: GateWorkflow
    subject: string
    put: (path: string, data: string | object) => void
    git: (...args: string[]) => string
  }) => void,
) {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-gates-'))
  const root = join(dir, 'repo with spaces')
  mkdirSync(root)
  const git = (...args: string[]) => {
    const result = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_OPTIONAL_LOCKS: '0',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: join(dir, 'no-global-config'),
      },
    })
    if (result.status !== 0) throw new Error(`Fixture Git failed: ${result.stderr}`)
    return result.stdout.trim()
  }
  const put = (path: string, data: string | object) => {
    const file = join(root, path)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, typeof data === 'string' ? data : stringify(data))
  }
  try {
    git('init', '-b', 'main')
    put('app.ts', 'export const response = 400\n')
    git('add', '.')
    git(
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.com',
      'commit',
      '-m',
      'feat: seed gate fixture',
      '-m',
      'Pin a fixture base for read-only gate rounds.',
    )
    const store = new StateStore(join(dir, 'state/wholeloop'))
    const engine = new FlowEngine(
      store,
      root,
      join(dir, 'config/wholeloop/config.yml'),
      join(dir, 'home'),
    )
    const subject = store.create({
      kind: 'review',
      title: 'Check empty requests',
      owner: 'Fixture Owner',
      body: '',
      repository: root,
    }).id
    run({ dir, root, engine, workflow: new GateWorkflow(engine), subject, put, git })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
function send(
  workflow: GateWorkflow,
  plan: GatePlan,
  findings: Record<string, GateFinding[]> = {},
  unavailable: string[] = [],
) {
  for (const unit of plan.units)
    workflow.submit(plan.subject, plan.run, plan.round, {
      unit: unit.id,
      status: unavailable.includes(unit.id) ? 'unavailable' : 'ok',
      evidence: ['Observed fixture execution and source inspection'],
      findings: findings[unit.id] ?? [],
      ...(unavailable.includes(unit.id) ? { reason: 'Stub worker unavailable' } : {}),
    })
}
function refute(
  workflow: GateWorkflow,
  plan: GatePlan,
  finding: string,
  verifier: number,
  outcome: 'refute' | 'confirm' | 'uncertain' = 'refute',
) {
  return workflow.submit(plan.subject, plan.run, plan.round, {
    finding,
    verifier,
    outcome,
    reason: 'Independent fixture inspection',
    evidence: outcome === 'refute' ? ['The caller rejects null before reaching this branch'] : [],
  })
}

describe('journaled bounded gate rounds', () => {
  it('passes complete unchanged coverage, resumes without duplication and rebuilds every round exactly', () =>
    fixture(({ engine, workflow, subject }) => {
      const { plan } = workflow.plan(subject, 'review', { base: 'main' })
      expect(plan.units).toHaveLength(6)
      expect(plan.budget).toBe(3)
      const count = engine.store.events().length
      expect(workflow.plan(subject, 'review').resumed).toBe(true)
      expect(engine.store.events()).toHaveLength(count)
      send(workflow, plan)
      const result = workflow.verdict(subject, 'review')
      expect(result.verdict).toBe('PASS')
      expect(result.report).toMatchObject({ unchanged: true, missing: [], kept: [] })
      const sealed = engine.store.events().length
      expect(workflow.verdict(subject, 'review')).toEqual(result)
      expect(engine.store.events()).toHaveLength(sealed)
      const path = `items/${subject}/gates/${plan.run}/1.json`
      const bytes = engine.store.files.read(path)
      engine.store.rebuild()
      expect(engine.store.files.read(path)).toBe(bytes)
      expect(bytes).toContain('PASS')
      expect(engine.store.events().filter((entry) => entry.type === 'msg.sent')).toHaveLength(1)
    }))

  it.each([3, 5, 7, 9])(
    'drops an ordinary finding only after a strict majority of %i active refutations',
    (verifiers) =>
      fixture(({ put, workflow, subject }) => {
        put('.wholeloop/config.yml', { version: 1, gates: { verifiers } })
        const first = workflow.plan(subject, 'review', { base: 'main' }).plan
        send(workflow, first, { performance: [defect] })
        for (let slot = 1; slot < first.refutations; slot++)
          refute(workflow, first, 'performance:unsafe-null', slot)
        expect(workflow.verdict(subject, 'review').report.kept).toHaveLength(1)
        const second = workflow.plan(subject, 'review').plan
        send(workflow, second, { performance: [defect] })
        for (let slot = 1; slot <= second.refutations; slot++)
          refute(workflow, second, 'performance:unsafe-null', slot)
        const result = workflow.verdict(subject, 'review')
        expect(result.verdict).toBe('PASS')
        expect(result.report.dropped).toHaveLength(1)
        expect(second.verifiers).toBe(verifiers)
      }),
  )

  // Three rounds submit every unit and refutation through real Git; this is an integration budget, not a timing assertion.
  it.each(['correctness', 'security'])(
    'keeps fail-safe %s findings when a verifier is silent or uncertain',
    (lens) =>
      fixture(({ workflow, subject }) => {
        const first = workflow.plan(subject, 'review', { base: 'main' }).plan
        send(workflow, first, { [lens]: [defect] })
        refute(workflow, first, `${lens}:unsafe-null`, 1)
        refute(workflow, first, `${lens}:unsafe-null`, 2)
        expect(workflow.verdict(subject, 'review').report.kept[0]?.reason).toContain('Fail-safe')
        const second = workflow.plan(subject, 'review').plan
        send(workflow, second, { [lens]: [defect] })
        for (let slot = 1; slot <= 3; slot++)
          refute(workflow, second, `${lens}:unsafe-null`, slot, slot === 3 ? 'uncertain' : 'refute')
        expect(workflow.verdict(subject, 'review').verdict).toBe('FAIL')
        const third = workflow.plan(subject, 'review').plan
        send(workflow, third, { [lens]: [defect] })
        for (let slot = 1; slot <= 3; slot++) refute(workflow, third, `${lens}:unsafe-null`, slot)
        expect(workflow.verdict(subject, 'review').verdict).toBe('PASS')
      }),
    10000,
  )

  it('exhausts with missing workers, refuses budget resets and extends only by explicit request', () =>
    fixture(({ engine, workflow, subject }) => {
      const first = workflow.plan(subject, 'review', { base: 'main', rounds: 1 }).plan
      send(workflow, first, {}, ['security'])
      const result = workflow.verdict(subject, 'review')
      expect(result.verdict).toBe('EXHAUSTED')
      expect(result.report.missing).toEqual(['security'])
      const count = engine.store.events().length
      expect(() => workflow.plan(subject, 'review')).toThrow('budget exhausted')
      expect(() => workflow.plan(subject, 'review', { rounds: 3 })).toThrow('extension')
      expect(() => workflow.plan(subject, 'review', { newRun: true })).toThrow('passing prior run')
      expect(() => workflow.plan(subject, 'review', { extend: 3 })).toThrow('reason')
      expect(engine.store.events()).toHaveLength(count)
      const next = workflow.plan(subject, 'review', {
        extend: 3,
        reason: 'Owner authorizes two more attempts',
      }).plan
      expect(next).toMatchObject({ run: first.run, round: 2, budget: 3 })
      expect(engine.store.events().filter((entry) => entry.type === 'gate.extended')).toHaveLength(
        1,
      )
      send(workflow, next)
      expect(workflow.verdict(subject, 'review').verdict).toBe('PASS')
    }))

  it('never treats silent units as clean results and never passes merely at the budget', () =>
    fixture(({ workflow, subject }) => {
      workflow.plan(subject, 'review', { base: 'main', rounds: 1 })
      const result = workflow.verdict(subject, 'review')
      expect(result.verdict).toBe('EXHAUSTED')
      expect(result.report.missing).toHaveLength(6)
    }))

  it('rejects duplicate units, duplicate voters, unknown findings and stale rounds without journal writes', () =>
    fixture(({ workflow, subject, engine }) => {
      const first = workflow.plan(subject, 'review', { base: 'main' }).plan
      send(workflow, first, { performance: [defect] })
      refute(workflow, first, 'performance:unsafe-null', 1)
      const count = engine.store.events().length
      expect(() => refute(workflow, first, 'performance:unsafe-null', 1)).toThrow(
        'already submitted',
      )
      expect(() => refute(workflow, first, 'unknown:nope', 2)).toThrow('unknown')
      expect(() => refute(workflow, first, 'performance:unsafe-null', 4)).toThrow('outside quorum')
      expect(() => send(workflow, first)).toThrow('already submitted')
      expect(engine.store.events()).toHaveLength(count)
      workflow.verdict(subject, 'review')
      workflow.plan(subject, 'review')
      expect(() => refute(workflow, first, 'performance:unsafe-null', 2)).toThrow(
        'current unsealed',
      )
    }))

  it('rejects empty approval evidence and evidence-free refutations', () =>
    fixture(({ workflow, subject }) => {
      const plan = workflow.plan(subject, 'review', { base: 'main' }).plan
      expect(() =>
        workflow.submit(subject, plan.run, 1, {
          unit: 'security',
          status: 'ok',
          findings: [],
          evidence: [],
        }),
      ).toThrow('observed evidence')
      expect(() =>
        workflow.submit(subject, plan.run, 1, {
          finding: 'security:unsafe-null',
          verifier: 1,
          outcome: 'refute',
          reason: 'Guess',
          evidence: [],
        }),
      ).toThrow('observed evidence')
    }))

  it.each(['tracked', 'untracked', 'index', 'head', 'branch', 'symlink', 'mode'])(
    'fails a round when %s state changes and retains the changed bytes',
    (change) =>
      fixture(({ root, git, put, workflow, subject }) => {
        put('untracked.txt', 'Before\n')
        symlinkSync('app.ts', join(root, 'linked.ts'))
        const plan = workflow.plan(subject, 'review', { base: 'main' }).plan
        send(workflow, plan)
        if (change === 'tracked') put('app.ts', 'export const response = 500\n')
        if (change === 'untracked') put('untracked.txt', 'After\n')
        if (change === 'index') git('add', 'untracked.txt')
        if (change === 'head')
          git(
            '-c',
            'user.name=Fixture',
            '-c',
            'user.email=fixture@example.com',
            'commit',
            '--allow-empty',
            '-m',
            'chore: advance fixture head',
            '-m',
            'Probe commit mutation during review.',
          )
        if (change === 'branch') git('switch', '-c', 'changed-branch')
        if (change === 'symlink') {
          rmSync(join(root, 'linked.ts'))
          symlinkSync('untracked.txt', join(root, 'linked.ts'))
        }
        if (change === 'mode') chmodSync(join(root, 'app.ts'), 0o755)
        const changed = workspaceSnapshot(root)
        expect(workflow.verdict(subject, 'review')).toMatchObject({
          verdict: 'FAIL',
          report: { unchanged: false },
        })
        expect(workspaceSnapshot(root)).toEqual(changed)
      }),
  )

  it('invalidates a historical PASS after later changes and requires an explicit new run', () =>
    fixture(({ workflow, subject, put }) => {
      const plan = workflow.plan(subject, 'review', { base: 'main' }).plan
      send(workflow, plan)
      expect(workflow.verdict(subject, 'review').verdict).toBe('PASS')
      put('app.ts', 'export const response = 500\n')
      expect(workflow.verdict(subject, 'review')).toMatchObject({
        verdict: 'STALE',
        current: false,
        report: { verdict: 'PASS' },
      })
      const next = workflow.plan(subject, 'review', { newRun: true }).plan
      expect(next.round).toBe(1)
      expect(next.run).not.toBe(plan.run)
    }))

  it('pins per-criterion coverage, asks for missing criteria and retains the default verify budget', () =>
    fixture(({ workflow, subject, engine }) => {
      const count = engine.store.events().length
      expect(() => workflow.plan(subject, 'verify', { base: 'main' })).toThrow('agreed criteria')
      expect(engine.store.events()).toHaveLength(count)
      const plan = workflow.plan(subject, 'verify', { base: 'main', criteria }).plan
      expect(plan.budget).toBe(4)
      expect(plan.units.map(({ id }) => id)).toEqual(['suite', 'criteria/reject-empty'])
      expect(plan.units[1]?.asks).toBe(JSON.stringify(criteria[0]))
      send(workflow, plan)
      expect(workflow.verdict(subject, 'verify').verdict).toBe('PASS')
    }))
})

describe('gate configuration and extension coverage', () => {
  it.each([0, 11, 1.5])('rejects invalid round budget %s at configuration validation', (rounds) => {
    expect(() =>
      resolveConfig([{ scope: 'project', values: { gates: { review: { rounds } } } }]),
    ).toThrow()
  })
  it.each([0, 1, 2, 4, 11])('rejects verifier count %s', (verifiers) => {
    expect(() => resolveConfig([{ scope: 'project', values: { gates: { verifiers } } }])).toThrow()
  })
  it.each(['', '   ', true])(
    'rejects disabling a built-in without a meaningful reason: %s',
    (reason) => {
      expect(() =>
        resolveConfig([
          { scope: 'project', values: { lenses: { disable: { security: reason } } } },
        ]),
      ).toThrow()
    },
  )
  it('reports disabled and not-applicable lenses, selects path/language/slot matches and pins policy', () =>
    fixture(({ workflow, subject, put }) => {
      put('.wholeloop/config.yml', {
        version: 1,
        lenses: {
          add: ['accessibility', 'database'],
          disable: { performance: 'No runtime performance surface in this migration' },
        },
      })
      for (const [id, when] of [
        [
          'accessibility',
          { paths: ['**/*.tsx'], languages: ['typescript'], slots: ['review.rubric'] },
        ],
        ['database', { paths: ['**/*.sql'] }],
      ] as const) {
        put(`.wholeloop/lenses/${id}/lens.yml`, {
          schema: 1,
          id,
          gate: 'review',
          asks: 'Check the declared team surface',
          'fail-safe': false,
          'applies-when': when,
          prompt: 'prompt.md',
        })
        put(`.wholeloop/lenses/${id}/prompt.md`, 'Inspect this change without editing files.\n')
      }
      put('.wholeloop/rubric.md', 'Review UI semantics.\n')
      put('.wholeloop/config.yml', {
        version: 1,
        slots: { 'review.rubric': '.wholeloop/rubric.md' },
        lenses: {
          add: ['accessibility', 'database'],
          disable: { performance: 'No runtime performance surface in this migration' },
        },
      })
      put('screen.tsx', 'export const Screen = () => null\n')
      const plan = workflow.plan(subject, 'review', { base: 'main', rounds: 5 }).plan
      expect(plan.budget).toBe(5)
      expect(plan.excluded.map(({ id }) => id).sort()).toEqual(['database', 'performance'])
      expect(plan.units.find(({ id }) => id === 'accessibility')?.prompt).toContain(
        'without editing',
      )
      workflow.verdict(subject, 'review')
      put('.wholeloop/lenses/accessibility/prompt.md', 'Changed policy.\n')
      expect(() => workflow.plan(subject, 'review')).toThrow('policy changed')
    }))
  it('does not let a manifest weaken fail-safe defaults or conditionally remove built-in coverage', () =>
    fixture(({ workflow, subject, put }) => {
      put('.wholeloop/lenses/security/lens.yml', {
        schema: 1,
        id: 'security',
        gate: 'review',
        asks: 'Use team security guidance',
        'fail-safe': false,
        prompt: 'prompt.md',
      })
      put('.wholeloop/lenses/security/prompt.md', 'Inspect trust boundaries.\n')
      expect(
        workflow
          .plan(subject, 'review', { base: 'main' })
          .plan.units.find(({ id }) => id === 'security')?.failSafe,
      ).toBe(true)
      put('.wholeloop/lenses/security/lens.yml', {
        schema: 1,
        id: 'security',
        gate: 'review',
        asks: 'Check secrets',
        'fail-safe': true,
        'applies-when': { paths: ['never'] },
        prompt: 'prompt.md',
      })
      expect(() => workflow.plan(subject, 'review')).toThrow('cannot be narrowed')
    }))
  it.each([
    ['**/*.tsx', 'screen.tsx', true],
    ['src/*.ts', 'src/nested/a.ts', false],
    ['src/**/*.ts', 'src/a.ts', true],
    ['file?.ts', 'file1.ts', true],
    ['a[1].ts', 'a1.ts', false],
  ])('matches %s against %s as %s', (pattern, path, expected) => {
    expect(pathMatches(String(pattern), String(path))).toBe(expected)
  })
})

describe('gate replay and compiled command boundary', () => {
  it('rejects a forged PASS, changed run policy and an implicit failed-run reset atomically', () =>
    fixture(({ engine, workflow, subject }) => {
      const plan = workflow.plan(subject, 'review', { base: 'main' }).plan
      const count = engine.store.events().length
      expect(() =>
        engine.store.transaction((_events, append) =>
          append(subject, {
            type: 'gate.decided',
            data: {
              run: plan.run,
              round: 1,
              observed: plan.snapshot.digest,
              report: { verdict: 'PASS', unchanged: true, missing: [], kept: [], dropped: [] },
            },
          }),
        ),
      ).toThrow('deterministic')
      expect(engine.store.events()).toHaveLength(count)
      workflow.verdict(subject, 'review')
      const changed = { ...plan, round: 2, policy: 'f'.repeat(64) }
      expect(() =>
        engine.store.transaction((_events, append) =>
          append(subject, { type: 'gate.planned', data: { plan: changed } }),
        ),
      ).toThrow('policy')
      expect(() =>
        engine.store.transaction((_events, append) =>
          append(subject, {
            type: 'gate.planned',
            data: { plan: { ...plan, run: 'gate-1234567890abcdef' } },
          }),
        ),
      ).toThrow('failed budgets')
      expect(gateRuns(engine.store.events())[0]?.rounds).toHaveLength(1)
    }))

  it('supports detached branches without changing files and blocks submissions after mutation', () =>
    fixture(({ root, git, workflow, subject, put }) => {
      git('switch', '--detach')
      const plan = workflow.plan(subject, 'review', { base: 'main' }).plan
      expect(plan.snapshot.branch).toBe('')
      put('app.ts', 'export const response = 500\n')
      const actual = readFileSync(join(root, 'app.ts'), 'utf8')
      expect(() => send(workflow, plan)).toThrow('Workspace changed')
      expect(workflow.verdict(subject, 'review').verdict).toBe('FAIL')
      expect(readFileSync(join(root, 'app.ts'), 'utf8')).toBe(actual)
    }))

  it('uses the built CLI for plan, result, refutations, exhaustion, extension and schemas', () =>
    fixture(({ dir, root, subject }) => {
      const binary = resolve('dist/wl.mjs')
      const invoke = (expected: number, ...args: string[]) => {
        const result = spawnSync(process.execPath, [binary, ...args, '--json'], {
          cwd: root,
          encoding: 'utf8',
          env: {
            ...process.env,
            XDG_STATE_HOME: join(dir, 'state'),
            XDG_CONFIG_HOME: join(dir, 'config'),
            HOME: join(dir, 'home'),
          },
        })
        expect(result.stderr).toBe('')
        expect(result.status).toBe(expected)
        return JSON.parse(result.stdout)
      }
      const { plan } = invoke(
        0,
        'gate',
        'plan',
        'review',
        '--for',
        subject,
        '--base',
        'main',
        '--rounds',
        'verify=6,review=1',
      ) as { plan: GatePlan }
      const file = join(dir, 'submission.json')
      const submit = (result: GateResult) => {
        writeFileSync(file, JSON.stringify({ run: plan.run, round: 1, result }))
        invoke(0, 'gate', 'submit', '--for', subject, '--file', file)
      }
      for (const unit of plan.units)
        submit({
          unit: unit.id,
          status: 'ok',
          evidence: ['Observed fixture behavior'],
          findings: unit.id === 'performance' ? [defect] : [],
        })
      writeFileSync(
        file,
        JSON.stringify({
          run: plan.run,
          round: 1,
          vote: {
            finding: 'performance:unsafe-null',
            verifier: 1,
            outcome: 'refute',
            reason: 'Independent counterexample',
            evidence: ['Caller validates input before dispatch'],
          },
        }),
      )
      invoke(0, 'gate', 'submit', '--for', subject, '--file', file)
      expect(invoke(4, 'gate', 'verdict', '--for', subject, '--gate', 'review').verdict).toBe(
        'EXHAUSTED',
      )
      invoke(3, 'gate', 'plan', 'review', '--for', subject)
      const extension = invoke(
        0,
        'gate',
        'plan',
        'review',
        '--for',
        subject,
        '--extend',
        '2',
        '--reason',
        'Owner requests one more attempt',
      )
      expect(extension.plan).toMatchObject({ round: 2, budget: 2, run: plan.run })
      expect(invoke(0, 'gate', 'schema').schemas.vote.required).toContain('evidence')
      invoke(3, 'gate', 'plan', 'review', '--for', subject, '--rounds', 'review=11')
      writeFileSync(file, JSON.stringify({ run: plan.run, round: 2, result: {}, vote: {} }))
      invoke(4, 'gate', 'submit', '--for', subject, '--file', file)
    }))
})
