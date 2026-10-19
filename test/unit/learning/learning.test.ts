import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FlowEngine } from '../../../src/flow/engine.js'
import { ImpactWorkflow } from '../../../src/impact/workflow.js'
import type { MeasurementPlan } from '../../../src/launch/measurement.js'
import {
  type LearningChallenge,
  type LearningOutcome,
  learningRuns,
} from '../../../src/learning/contracts.js'
import type { ReportedLearning } from '../../../src/learning/evidence.js'
import { runLearning } from '../../../src/learning/run.js'
import { LearningWorkflow } from '../../../src/learning/workflow.js'
import { parseSpec } from '../../../src/spec/contract.js'
import { contextPack } from '../../../src/state/resume.js'
import { StateStore } from '../../../src/state/store.js'

const reported: ReportedLearning = {
  summary: 'The owner inspected the pilot; no numerical checkpoint is claimed.',
  promise: 'Make retrieving previous orders easier.',
  refs: ['https://example.com/pilot-notes'],
  by: 'Alex',
  flag: 'order-search',
}
async function fixture(
  run: (context: {
    dir: string
    root: string
    engine: FlowEngine
    workflow: LearningWorkflow
  }) => void | Promise<void>,
) {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-learning-'))
  const root = join(dir, 'repo')
  mkdirSync(root)
  const engine = new FlowEngine(
    new StateStore(join(dir, 'state')),
    root,
    join(dir, 'user/config.yml'),
    join(dir, 'home'),
  )
  try {
    await run({ dir, root, engine, workflow: new LearningWorkflow(engine) })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
function started(
  workflow: LearningWorkflow,
  options: Partial<Parameters<LearningWorkflow['begin']>[0]> = {},
) {
  const begun = workflow.begin({
    input: 'Order search outcome',
    owner: 'Alex',
    leaning: 'keep',
    reported,
    ...options,
  })
  if (begun.status !== 'planned') throw new Error('Expected learning plan')
  return begun
}
function challenge(
  workflow: LearningWorkflow,
  subject: string,
  overrides: Partial<LearningChallenge> = {},
) {
  const context = workflow.context(subject)
  return workflow.challenge(subject, {
    schema: 'wholeloop/learning-challenge@1',
    basis: context.record.event,
    against: context.record.plan.leaning,
    alternative: context.record.plan.leaning === 'iterate' ? 'keep' : 'iterate',
    argument:
      'The source evidence does not establish the full promise; a narrower iteration could address the remaining uncertainty.',
    limits: 'Pilot notes are self-reported and do not establish a causal metric improvement.',
    by: 'fixture-counterargument',
    ...overrides,
  })
}
function call(workflow: LearningWorkflow, subject: string, outcome: LearningOutcome = 'keep') {
  const context = workflow.context(subject)
  return {
    outcome,
    basis: context.record.challenge?.event ?? '',
    by: 'Alex',
    reason:
      'I reviewed the promise, opposing case and missing evidence before choosing this outcome.',
    acknowledgedUnknowns: context.record.plan.evidence.unknowns,
  }
}

describe('explicit learning decisions', () => {
  it('recovers the persisted decision boundary without duplicating its iteration or decision', async () =>
    fixture(({ workflow, engine, dir, root }) => {
      const { subject } = started(workflow, { leaning: 'iterate' })
      challenge(workflow, subject)
      const options = {
        ...call(workflow, subject, 'iterate'),
        iteration: {
          title: 'Date presets',
          problem: 'Date selection is cumbersome.',
          audience: 'Returning customers',
          impact: 'Make narrowing dates easier.',
        },
      }
      workflow.decide(subject, options)
      const events = engine.store.events()
      const boundary = events.findIndex(
        (event) => event.type === 'step.completed' && event.data.step === 'decide-next',
      )
      expect(boundary).toBeGreaterThan(0)
      const prefix = events.slice(0, boundary)
      const recovered = new StateStore(join(dir, 'recovered'))
      const months = new Set(prefix.map((event) => event.ts.slice(0, 7)))
      for (const month of months)
        recovered.files.atomic(
          `journal/${month}.ndjson`,
          `${prefix
            .filter((event) => event.ts.startsWith(month))
            .map((event) => JSON.stringify(event))
            .join('\n')}\n`,
        )
      const resumed = new LearningWorkflow(
        new FlowEngine(recovered, root, engine.userFile, engine.home),
      )
      expect(recovered.get(subject).status).toBe('open')
      resumed.complete(subject)
      expect(recovered.get(subject).status).toBe('closed')
      expect(recovered.events().filter((event) => event.type === 'learn.decided')).toHaveLength(1)
      expect(
        recovered
          .events()
          .filter((event) => event.type === 'item.created' && event.data.kind === 'initiative'),
      ).toHaveLength(1)
      expect(resumed.decide(subject, options).cached).toBe(true)
    }))

  it('requires an actual flag identity before proposing unflag work', async () =>
    fixture(({ workflow }) => {
      const { flag: _flag, ...withoutFlag } = reported
      const { subject } = started(workflow, { reported: withoutFlag })
      challenge(workflow, subject)
      expect(() => workflow.decide(subject, call(workflow, subject, 'unflag'))).toThrow(
        'flag identifier',
      )
    }))

  it('asks missing standalone facts before writing history', async () =>
    fixture(({ workflow, engine }) => {
      expect(workflow.begin({}).questions.map((question) => question.id)).toEqual([
        'owner',
        'input',
        'leaning',
        'evidence',
      ])
      expect(engine.store.events()).toEqual([])
      expect(() => started(workflow, { reported: { ...reported, refs: [] } })).toThrow('references')
      expect(engine.store.events()).toEqual([])
    }))

  it('requires a real counterargument and the exact current evidence basis', async () =>
    fixture(({ workflow, engine }) => {
      const { subject } = started(workflow)
      expect(() => workflow.decide(subject, call(workflow, subject))).toThrow('counterargument')
      expect(() => challenge(workflow, subject, { against: 'kill' })).toThrow('current leaning')
      challenge(workflow, subject)
      const old = call(workflow, subject)
      challenge(workflow, subject, {
        argument: 'A revised counterargument requiring renewed human attention.',
      })
      expect(() => workflow.decide(subject, old)).toThrow('current challenged evidence')
      expect(engine.store.get(subject).status).toBe('open')
    }))

  it('keeps missing evidence explicit and rejects silence or an empty human reason', async () =>
    fixture(({ workflow, engine }) => {
      const { subject } = started(workflow)
      challenge(workflow, subject)
      const valid = call(workflow, subject)
      expect(() => workflow.decide(subject, { ...valid, acknowledgedUnknowns: [] })).toThrow(
        'every unknown',
      )
      expect(() => workflow.decide(subject, { ...valid, reason: '   ' })).toThrow()
      expect(engine.store.events().some((event) => event.type === 'learn.decided')).toBe(false)
      const result = workflow.decide(subject, valid)
      expect(result.report.plan.evidence.kind).toBe('reported')
      expect(result.report.followups[0]).toMatchObject({ kind: 'flag-removal', applied: false })
      expect(engine.store.get(subject).status).toBe('closed')
      expect(engine.store.files.read(result.receipt.artifact)).toContain('no-measured-checkpoint')
      expect(
        workflow.decide(subject, {
          reason: valid.reason,
          by: valid.by,
          basis: valid.basis,
          outcome: valid.outcome,
          acknowledgedUnknowns: [...valid.acknowledgedUnknowns],
        }).cached,
      ).toBe(true)
      expect(() => workflow.decide(subject, { ...valid, outcome: 'kill' })).toThrow('immutable')
    }))

  it.each(['keep', 'kill', 'unflag'] as const)(
    'records %s without changing flags or implementing cleanup',
    async (outcome) =>
      fixture(({ workflow, engine }) => {
        const { subject } = started(workflow, { leaning: outcome })
        challenge(workflow, subject)
        const result = workflow.decide(subject, call(workflow, subject, outcome))
        expect(result.report.complete).toBe(true)
        expect(workflow.report(subject).complete).toBe(true)
        expect(
          workflow.report(subject).followups.every((proposal) => proposal.applied === false),
        ).toBe(true)
        expect(engine.store.list()).toHaveLength(1)
        expect(engine.store.events().some((event) => event.type.startsWith('ramp.'))).toBe(false)
      }),
  )

  it('creates a complete framing draft linked to the evidence when iterating', async () =>
    fixture(({ workflow, engine }) => {
      const { subject } = started(workflow, { leaning: 'iterate' })
      challenge(workflow, subject)
      const options = {
        ...call(workflow, subject, 'iterate'),
        iteration: {
          title: 'Add order date presets',
          problem: 'Customers still search over too many dates.',
          audience: 'Returning customers',
          impact: 'Reduce the effort of narrowing order searches.',
        },
      }
      const result = workflow.decide(subject, options)
      const ideaId = result.report.iteration
      if (!ideaId) throw new Error('Missing iteration idea')
      const idea = engine.store.get(ideaId)
      expect(idea.kind).toBe('initiative')
      expect(idea.status).toBe('open')
      expect(idea.body).toContain('## Expected impact')
      expect(idea.body).toContain(reported.refs[0])
      expect(idea.body).toContain('TBD: validate the revised hypothesis; who: Alex')
      expect(idea.links).toContain(reported.refs[0])
      expect(engine.plan(ideaId).next).toBe('frame-problem')
      expect(
        engine.store
          .events()
          .some((event) => event.subject === ideaId && event.type === 'step.completed'),
      ).toBe(false)
      expect(workflow.decide(subject, options).cached).toBe(true)
    }))

  it('reopens an explicitly selected closed pre-spec idea and preserves its earlier history', async () =>
    fixture(({ workflow, engine, root }) => {
      const idea = engine.store.create({
        kind: 'initiative',
        title: 'Date presets',
        owner: 'Jordan',
        body: 'Earlier hypothesis',
        repository: root,
      })
      engine.store.update(idea.id, { status: 'closed' })
      const { subject } = started(workflow, { leaning: 'iterate' })
      challenge(workflow, subject)
      workflow.decide(subject, {
        ...call(workflow, subject, 'iterate'),
        iteration: {
          existing: idea.id,
          title: 'Date presets',
          problem: 'Pilot uncovered a missing date shortcut.',
          audience: 'Customers with repeat orders',
          impact: 'Narrow searches faster.',
        },
      })
      expect(engine.store.get(idea.id).status).toBe('open')
      expect(engine.store.get(idea.id).owner).toBe('Jordan')
      expect(engine.store.get(idea.id).body).toContain(
        'TBD: validate the revised hypothesis; who: Jordan',
      )
      expect(learningRuns(engine.store.events()).at(-1)?.iteration).toBe(idea.id)
      expect(engine.store.list()).toHaveLength(2)
    }))

  it('rejects reopening the current parent or an already scoped initiative as an iteration', async () =>
    fixture(({ workflow, engine, root }) => {
      const parent = engine.store.create({
        kind: 'initiative',
        title: 'Order search',
        owner: 'Alex',
        body: 'Original promise',
        repository: root,
      })
      const scope = engine.store.create({
        kind: 'scope',
        title: 'Pilot',
        owner: 'Alex',
        parent: parent.id,
        body: 'Pilot',
        repository: root,
      })
      started(workflow, { subject: scope.id, leaning: 'iterate' })
      challenge(workflow, scope.id)
      expect(() =>
        workflow.decide(scope.id, {
          ...call(workflow, scope.id, 'iterate'),
          iteration: {
            existing: parent.id,
            title: 'Unsafe reuse',
            problem: 'A different experiment',
            audience: 'Customers',
            impact: 'A new promise',
          },
        }),
      ).toThrow('pre-spec')
    }))

  it('closes an initiative only after every scope has a completed decision and blocks generic close bypasses', async () =>
    fixture(({ workflow, engine, root }) => {
      const parent = engine.store.create({
        kind: 'initiative',
        title: 'Order search',
        owner: 'Alex',
        body: 'Original promise',
        repository: root,
      })
      const scopes = ['Pilot', 'General'].map((title) =>
        engine.store.create({
          kind: 'scope',
          title,
          owner: 'Alex',
          parent: parent.id,
          body: title,
          repository: root,
        }),
      )
      expect(() => engine.store.update(parent.id, { status: 'closed' })).toThrow('every scope')
      for (const [index, scope] of scopes.entries()) {
        started(workflow, { subject: scope.id })
        challenge(workflow, scope.id)
        workflow.decide(scope.id, call(workflow, scope.id))
        expect(engine.store.get(parent.id).status).toBe(index === 0 ? 'open' : 'closed')
      }
      const first = scopes[0]
      if (!first) throw new Error('Missing scope')
      expect(() =>
        engine.store.create({
          kind: 'scope',
          title: 'Late scope',
          owner: 'Alex',
          body: 'New scope',
          parent: parent.id,
        }),
      ).toThrow('Reopen the initiative')
      engine.store.update(parent.id, { status: 'open' })
      engine.store.update(first.id, { status: 'open' })
      expect(() => engine.store.update(parent.id, { status: 'closed' })).toThrow('every scope')
    }))

  it('does not count a manually closed sibling as a learning decision', async () =>
    fixture(({ workflow, engine, root }) => {
      const parent = engine.store.create({
        kind: 'initiative',
        title: 'Outcome',
        owner: 'Alex',
        body: 'Promise',
        repository: root,
      })
      const one = engine.store.create({
        kind: 'scope',
        title: 'One',
        owner: 'Alex',
        body: 'One',
        parent: parent.id,
        repository: root,
      })
      const two = engine.store.create({
        kind: 'scope',
        title: 'Two',
        owner: 'Alex',
        body: 'Two',
        parent: parent.id,
        repository: root,
      })
      engine.store.update(two.id, { status: 'closed' })
      started(workflow, { subject: one.id })
      challenge(workflow, one.id)
      workflow.decide(one.id, call(workflow, one.id))
      expect(engine.store.get(parent.id).status).toBe('open')
      expect(() =>
        engine.store.transaction((_events, append) =>
          append(parent.id, { type: 'item.closed', data: {} }),
        ),
      ).toThrow('every scope')
    }))

  it('uses measured evidence, records early checkpoints and rejects stale plans after new observations', async () =>
    fixture(async ({ workflow, engine }) => {
      const spec = parseSpec(
        readFileSync(new URL('../../fixtures/spec/spec.md', import.meta.url), 'utf8'),
      )
      const measurement: MeasurementPlan = {
        schema: 'wholeloop/measurement-plan@1',
        impact: spec.impact,
        metrics: spec.metrics,
        rollout: spec.rollout,
      }
      const impact = new ImpactWorkflow(engine)
      const begun = impact.begin({
        input: 'Measured outcome',
        owner: 'Alex',
        measurement,
        launchedAt: '2026-08-01T00:00:00Z',
        checkpoint: 'launch',
        at: '2026-08-01T00:00:00Z',
      })
      if (begun.status !== 'planned') throw new Error('Expected impact plan')
      await impact.observe(begun.subject, {
        invoke: async () => {
          throw new Error('No live source fixture')
        },
      })
      impact.complete(begun.subject)
      const start = started(workflow, { subject: begun.subject })
      expect(start.context.record.plan.evidence.kind).toBe('checkpoint')
      expect(start.context.record.plan.evidence.unknowns).toEqual([
        'checkpoint:d30',
        'checkpoint:d7',
        'metric:retrieval-time',
      ])
      challenge(workflow, begun.subject)
      impact.begin({ subject: begun.subject, checkpoint: 'd7', at: '2026-08-08T00:00:00Z' })
      await impact.observe(begun.subject, {
        invoke: async () => {
          throw new Error('No source')
        },
      })
      expect(() => workflow.decide(begun.subject, call(workflow, begun.subject))).toThrow(
        'latest measured checkpoint',
      )
      impact.complete(begun.subject)
      expect(() => workflow.report(begun.subject)).toThrow('evidence changed')
      expect(workflow.begin({ subject: begun.subject }).status).toBe('planned')
      expect(workflow.report(begun.subject).challenge).toBeNull()
    }))

  it('loads decision guidance and applies profile intensity without removing coverage', async () =>
    fixture(async ({ workflow, engine, root }) => {
      mkdirSync(join(root, '.wholeloop'))
      writeFileSync(
        join(root, 'decision-guide.md'),
        'Lead with reversibility and the strongest opposing case.',
      )
      writeFileSync(
        join(root, '.wholeloop/config.yml'),
        'version: 1\nprofile:\n  preset: sparring\nslots:\n  learn.decision: decision-guide.md\n',
      )
      const result = await runLearning(
        workflow,
        { input: 'Outcome', owner: 'Alex', reported, leaning: 'keep' },
        {
          stopped: () => false,
          challenge: async (context) => {
            expect(context.guidance.content).toContain('Lead with reversibility')
            expect(context.challenge.coverage).toHaveLength(4)
            expect(context.record.plan.profile.challenge).toBe('adversarial')
            expect(context.challenge.additionalQuestions).toBe(3)
            return {
              schema: 'wholeloop/learning-challenge@1',
              basis: context.record.event,
              against: 'keep',
              alternative: 'kill',
              argument: 'This evidence has not established a meaningful benefit.',
              limits: 'Self-reported pilot only.',
              by: 'synthetic-host',
            }
          },
        },
      )
      expect(result.status).toBe('awaiting-human-decision')
      expect(engine.store.list()[0]?.status).toBe('open')
      writeFileSync(join(root, 'decision-guide.md'), 'Changed instructions')
      const subject = engine.store.list()[0]?.id ?? ''
      expect(() => workflow.report(subject)).toThrow('guidance/profile')
    }))

  it('rebuilds exact learning projections and rejects invented completion receipts', async () =>
    fixture(({ workflow, engine }) => {
      const { subject } = started(workflow)
      challenge(workflow, subject)
      expect(() =>
        engine.complete(
          'decide-next',
          subject,
          '# Fake\n\n## Evidence\n\nFake.\n\n## Counterargument\n\nFake.\n\n## Decision\n\nFake.\n\n## Unknowns\n\nFake.\n\n## Follow-up\n\nFake.\n\n## Handoff\n\nFake.',
        ),
      ).toThrow()
      workflow.decide(subject, call(workflow, subject))
      const before = engine.store.files.read(`items/${subject}/learning.json`)
      engine.store.rebuild()
      expect(engine.store.files.read(`items/${subject}/learning.json`)).toBe(before)
      expect(contextPack(engine.store.events(), subject).subject).toHaveProperty('learning')
      expect(workflow.complete(subject)).toMatchObject({ cached: true })
    }))

  it('runs the compiled decision CLI without live workers or production changes', async () =>
    fixture(({ dir, root }) => {
      const env = {
        ...process.env,
        XDG_STATE_HOME: join(dir, 'cli-state'),
        XDG_CONFIG_HOME: join(dir, 'cli-config'),
        HOME: join(dir, 'home'),
      }
      const cli = (...args: string[]) => {
        const result = spawnSync(process.execPath, [resolve('dist/wl.mjs'), ...args, '--json'], {
          cwd: root,
          env,
          encoding: 'utf8',
        })
        expect(result.status, result.stderr || result.stdout).toBe(0)
        return JSON.parse(result.stdout)
      }
      const file = join(dir, 'reported.json')
      writeFileSync(file, JSON.stringify(reported))
      const begun = cli(
        'learn',
        'begin',
        'Pilot outcome',
        '--owner',
        'Alex',
        '--leaning',
        'keep',
        '--reported',
        file,
      )
      const subject = begun.subject
      const report = cli('learn', 'report', '--for', subject)
      const critique = join(dir, 'challenge.json')
      writeFileSync(
        critique,
        JSON.stringify({
          schema: 'wholeloop/learning-challenge@1',
          basis: report.planEvent,
          against: 'keep',
          alternative: 'iterate',
          argument: 'Missing measurements leave a credible case for iteration.',
          limits: 'Synthetic fixture only.',
          by: 'fixture',
        }),
      )
      const challenged = cli('learn', 'challenge', '--for', subject, '--file', critique)
      const decision = cli(
        'learn',
        'decide',
        'keep',
        '--for',
        subject,
        '--basis',
        challenged.challenge.event,
        '--by',
        'Alex',
        '--reason',
        'I accept the explicit evidence limits.',
        '--ack',
        JSON.stringify(report.plan.evidence.unknowns),
      )
      expect(decision.receipt.artifact).toContain('decide-next')
      expect(cli('learn', 'report', '--for', subject).complete).toBe(true)
    }))
})
