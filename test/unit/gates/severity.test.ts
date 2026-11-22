// Only blockers fail a round; optional lenses may report advisories, mandatory ones never (ADR-0258).
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { stepDisplay } from '../../../src/display/step.js'
import { FlowEngine } from '../../../src/flow/engine.js'
import { gateAssignments } from '../../../src/gates/assignments.js'
import type { GateFinding, GatePlan } from '../../../src/gates/contracts.js'
import { gateReport } from '../../../src/gates/report.js'
import { gateRuns } from '../../../src/gates/state.js'
import { GateWorkflow } from '../../../src/gates/workflow.js'
import { StateStore } from '../../../src/state/store.js'

const finding = (id: string): GateFinding => ({
  id,
  location: 'app.ts:1',
  text: `Fixture finding ${id}`,
  evidence: ['Observed in the fixture source'],
})
function fixture(
  run: (context: { workflow: GateWorkflow; store: StateStore; plan: GatePlan }) => void,
) {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-severity-'))
  const root = join(dir, 'repo')
  mkdirSync(root)
  const git = (...args: string[]) => {
    const result = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(dir, 'none') },
    })
    if (result.status !== 0) throw new Error(result.stderr)
  }
  try {
    git('init', '-b', 'main')
    writeFileSync(join(root, 'app.ts'), 'export const response = 400\n')
    git('add', '.')
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', 'commit', '-m', 'seed')
    const store = new StateStore(join(dir, 'state/wholeloop'))
    const engine = new FlowEngine(store, root, join(dir, 'config.yml'), join(dir, 'home'))
    const subject = store.create({
      kind: 'review',
      title: 'Review empty requests',
      owner: 'Fixture Owner',
      body: '',
      repository: root,
    }).id
    const workflow = new GateWorkflow(engine)
    run({ workflow, store, plan: workflow.plan(subject, 'review', { base: 'main' }).plan })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
const submit = (
  workflow: GateWorkflow,
  plan: GatePlan,
  unit: string,
  findings: (GateFinding & { severity?: string })[],
) =>
  workflow.submit(plan.subject, plan.run, plan.round, {
    unit,
    status: 'ok',
    evidence: ['Observed fixture source'],
    findings,
  })
const optional = (plan: GatePlan) => plan.units.find((unit) => !unit.failSafe)?.id ?? ''

it('passes a round whose only findings are advisories and hands them to the person', () =>
  fixture(({ workflow, store, plan }) => {
    const lens = optional(plan)
    expect(lens).not.toBe('')
    for (const unit of plan.units)
      submit(
        workflow,
        plan,
        unit.id,
        unit.id === lens
          ? [
              { ...finding('naming'), severity: 'nit' },
              { ...finding('extract'), severity: 'should' },
            ]
          : [],
      )
    const round = gateRuns(store.events()).at(-1)?.rounds.at(-1)
    expect(round?.classifications).toEqual([
      { finding: `${lens}:naming`, severity: 'nit' },
      { finding: `${lens}:extract`, severity: 'should' },
    ])
    const assignments = gateAssignments(plan, {
      results: round?.results ?? [],
      votes: [],
      classifications: round?.classifications ?? [],
    })
    expect(assignments.examinations).toEqual([])
    const verdict = workflow.verdict(plan.subject, 'review')
    expect(verdict.verdict).toBe('PASS')
    expect(verdict.report.kept).toEqual([])
    expect(verdict.report.dropped.map(({ reason }) => reason)).toEqual([
      'Advisory (nit): reported to the person; does not fail the round',
      'Advisory (should): reported to the person; does not fail the round',
    ])
    const display = stepDisplay('gate verdict', verdict)
    expect(display.open).toContain('Not blocking (nit): Fixture finding naming')
    // Replay recomputes the same report from the recorded classifications.
    expect(gateRuns(store.events()).at(-1)?.rounds.at(-1)?.decision?.report).toEqual(verdict.report)
  }))

it('keeps blockers failing, refuses severity on mandatory lenses and records nothing on refusal', () =>
  fixture(({ workflow, store, plan }) => {
    const mandatory = plan.units.find((unit) => unit.failSafe)?.id ?? ''
    expect(() =>
      submit(workflow, plan, mandatory, [{ ...finding('leak'), severity: 'nit' }]),
    ).toThrow('mandatory lens always block')
    expect(() =>
      submit(workflow, plan, optional(plan), [{ ...finding('x'), severity: 'minor' }]),
    ).toThrow('blocker, should or nit')
    expect(gateRuns(store.events()).at(-1)?.rounds.at(-1)?.results).toEqual([])
    submit(workflow, plan, optional(plan), [{ ...finding('defect'), severity: 'blocker' }])
    expect(gateRuns(store.events()).at(-1)?.rounds.at(-1)?.classifications).toEqual([])
  }))

it('leaves historical reports identical when no finding was classified', () => {
  const plan = {
    units: [{ id: 'design-fit', failSafe: false }],
    verifiers: 3,
    refutations: 2,
    round: 1,
    budget: 3,
    snapshot: { digest: 'a'.repeat(64) },
  } as unknown as GatePlan
  const results = [
    { unit: 'design-fit', status: 'ok' as const, evidence: ['x'], findings: [finding('f')] },
  ]
  expect(gateReport(plan, results, [], 'a'.repeat(64))).toEqual(
    gateReport(plan, results, [], 'a'.repeat(64), 3, []),
  )
  expect(gateReport(plan, results, [], 'a'.repeat(64)).verdict).toBe('FAIL')
})
