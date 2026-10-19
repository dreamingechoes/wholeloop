import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { validate } from '../../../src/config/schema.js'
import { FlowEngine } from '../../../src/flow/engine.js'
import { beginPlan, flowPlan, remembered } from '../../../src/flow/plan.js'
import { checkShape, STEPS } from '../../../src/flow/registry.js'
import { event, type Item, replay } from '../../../src/state/events.js'
import { StateStore } from '../../../src/state/store.js'

const artifact = readFileSync(new URL('../../fixtures/framing/frame.md', import.meta.url), 'utf8')
function fixture(operation: (engine: FlowEngine) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-flow-'))
  try {
    operation(
      new FlowEngine(
        new StateStore(join(dir, 'state')),
        join(dir, 'repo'),
        join(dir, 'config/user.yml'),
        dir,
      ),
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('step begin contracts', () => {
  const item: Item = {
    id: 'init-12345678',
    kind: 'initiative',
    title: 'Find orders',
    owner: 'Alex',
    body: '',
    status: 'open',
    createdAt: '2026-10-18T00:00:00.000Z',
    updatedAt: '2026-10-18T00:00:00.000Z',
    notes: [],
    links: [],
  }
  for (const step of STEPS) {
    it(`${step.name}: standalone empty, standalone input and initiative`, () => {
      expect([
        beginPlan(step, {}),
        beginPlan(step, { input: 'Find orders', owner: 'Alex' }),
        beginPlan(step, { subject: item, mode: 'flow' }),
      ]).toMatchSnapshot()
    })
  }
})

describe('flow engine', () => {
  it('asks for missing input without inventing an owner or creating an item', () =>
    fixture((engine) => {
      const result = engine.begin('frame-problem', {})
      expect(result.code).toBe(2)
      expect(result.payload.missing).toEqual(['input', 'owner'])
      expect(engine.store.list()).toEqual([])
      expect(engine.store.events()).toEqual([])
    }))

  it('begins idempotently, shape-checks an artifact, records it and rebuilds it', () =>
    fixture((engine) => {
      const result = engine.begin('frame-problem', { input: 'Find orders', owner: 'Alex' })
      const subject = result.payload.subject?.id ?? ''
      expect(result.code).toBe(0)
      const repeat = engine.begin('frame-problem', { subject })
      expect(repeat.payload.run).toBe(result.payload.run)
      expect(engine.store.events()).toHaveLength(2)
      expect(() => engine.complete('frame-problem', subject, '# Empty')).toThrow('Problem')
      expect(engine.store.events()).toHaveLength(2)
      const receipt = engine.complete('frame-problem', subject, artifact)
      expect(receipt.next.next).toBe('write-spec')
      expect(engine.store.files.read(receipt.artifact)).toBe(artifact)
      engine.store.rebuild()
      expect(engine.store.files.read(receipt.artifact)).toBe(artifact)
      expect(() => engine.complete('frame-problem', subject, artifact)).toThrow('Begin')
      expect(engine.plan(subject).available).toBe(true)
    }))

  it('requires and preserves skip reasons in the journal and later preflights', () =>
    fixture((engine) => {
      const item = engine.store.create({
        kind: 'initiative',
        title: 'Find orders',
        owner: 'Alex',
        body: '',
      })
      expect(() => engine.skip('research', item.id, '')).toThrow('--reason')
      engine.skip('research', item.id, 'Existing support evidence is sufficient')
      expect(engine.store.events().at(-1)).toMatchObject({
        type: 'step.skipped',
        data: { reason: 'Existing support evidence is sufficient' },
      })
      const begin = engine.begin('frame-problem', { subject: item.id })
      expect(begin.payload.preflight.join('\n')).toContain(
        'Skipped — research: Existing support evidence is sufficient',
      )
    }))

  it('retains fixed decisions after a skipped step and requires explicit human attribution', () =>
    fixture((engine) => {
      const item = engine.store.create({
        kind: 'initiative',
        title: 'Find orders',
        owner: 'Alex',
        body: '',
      })
      engine.skip('write-spec', item.id, 'An existing spec will be adopted later')
      expect(engine.plan(item.id).pending.map((decision) => decision.id)).toContain('approve-spec')
      expect(() =>
        engine.answer('decision.approve-spec', 'approved', {
          scope: 'user',
          subject: item.id,
          by: 'Alex',
        }),
      ).toThrow('reusable')
      expect(() =>
        engine.answer('decision.approve-spec', 'approved', { scope: 'run', subject: item.id }),
      ).toThrow('--by')
      engine.answer('decision.approve-spec', 'rejected', {
        scope: 'run',
        subject: item.id,
        by: 'Alex',
      })
      expect(engine.plan(item.id).pending).toHaveLength(1)
      engine.answer('decision.approve-spec', 'approved', {
        scope: 'run',
        subject: item.id,
        by: 'Alex',
      })
      expect(engine.plan(item.id).pending).toHaveLength(0)
      engine.skip('write-spec', item.id, 'Changed the adopted specification')
      expect(engine.plan(item.id).pending).toHaveLength(1)
      expect(
        validate({ flow: { decisions: { remove: ['approve-spec'] } } }).length,
      ).toBeGreaterThan(0)
    }))

  it('remembers personal answers in user/project configuration without re-asking', () =>
    fixture((engine) => {
      engine.answer('owner', 'User Owner', { scope: 'user' })
      engine.answer('owner', 'Project Owner', { scope: 'project' })
      const result = engine.begin('frame-problem', { input: 'Find orders' })
      expect(result.payload.owner).toBe('Project Owner')
      expect(result.payload.questions).toEqual([])
      expect(readFileSync(engine.userFile, 'utf8')).toContain('User Owner')
      expect(readFileSync(join(engine.root, '.wholeloop/config.yml'), 'utf8')).toContain(
        'Project Owner',
      )
    }))

  it('remembers run and initiative answers at their precise scope', () =>
    fixture((engine) => {
      const start = engine.begin('frame-problem', { input: 'Find orders', owner: 'Alex' })
      const subject = start.payload.subject?.id ?? ''
      const run = start.payload.run ?? ''
      engine.answer('docs.destination', 'notion', { scope: 'initiative', subject })
      engine.answer('docs.destination', 'local', { scope: 'run', subject, run })
      expect(
        remembered(engine.store.events(), subject, run, engine.config())['docs.destination'],
      ).toBe('local')
      expect(
        remembered(engine.store.events(), subject, 'run-1111111111111111', engine.config())[
          'docs.destination'
        ],
      ).toBe('notion')
      expect(
        remembered(engine.store.events(), 'init-00000000', run, engine.config())[
          'docs.destination'
        ],
      ).toBeUndefined()
    }))

  it('keeps decision points independent of configuration and profile values', () => {
    const created = event(
      'init-12345678',
      {
        type: 'item.created',
        data: { kind: 'initiative', title: 'Find orders', owner: 'Alex', body: '' },
      },
      '2026-10-18T00:00:00.000Z',
    )
    const skipped = event(
      'init-12345678',
      {
        type: 'step.skipped',
        data: { step: 'write-spec', run: 'run-0000000000000000', reason: 'Existing spec' },
      },
      '2026-10-18T00:01:00.000Z',
    )
    expect(flowPlan([created, skipped], created.subject).pending).toEqual([
      { id: 'approve-spec', basis: skipped.id },
    ])
    expect(replay([created, skipped]).size).toBe(1)
  })
})

describe('shape checks', () => {
  it('rejects empty sections rather than accepting headings alone', () => {
    expect(checkShape('## Problem\n\n## Owner\nAlex', ['Problem', 'Owner'])).toEqual([
      'Missing or empty required section: Problem',
    ])
    expect(checkShape(artifact, ['Problem', 'Owner'])).toEqual([])
    expect(
      checkShape('```md\n## Problem\nMade up\n## Owner\nAlex\n```', ['Problem', 'Owner']),
    ).toHaveLength(2)
  })
})
