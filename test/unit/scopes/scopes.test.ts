import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { stringify } from 'yaml'
import { draftScopes } from '../../../harness/workflows/scopes.js'
import { FlowEngine } from '../../../src/flow/engine.js'
import {
  checkScopePlan,
  parseScopePlan,
  SCOPE_SECTIONS,
  type ScopeDefinition,
  type ScopePlan,
  scopeContext,
} from '../../../src/scopes/contract.js'
import { StateStore } from '../../../src/state/store.js'
import { next } from '../../../src/utilities/next.js'

const spec = readFileSync(new URL('../../fixtures/spec/spec.md', import.meta.url), 'utf8')
const main: ScopeDefinition = {
  key: 'main',
  title: 'Find past orders',
  goal: 'Retrieve an order by its identifier',
  metrics: ['retrieval-time'],
  stories: ['find-order'],
  delivery: { mode: 'feature', flag: 'orders_search_v1' },
  complexity: { level: 'simple', why: 'One existing endpoint and one search input' },
}
const plan = (scopes = [main]): ScopePlan => ({
  schema: 'wholeloop/scope-plan@1',
  metricIds: ['retrieval-time'],
  scopes,
})
const artifact = (value: ScopePlan) =>
  `---\n${stringify(value)}---\n${SCOPE_SECTIONS.map((name) => `## ${name}\n\nOwner reviews the recorded definitions and questions.\n`).join('\n')}`
function fixture(run: (dir: string, engine: FlowEngine) => void | Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-scopes-'))
  const engine = new FlowEngine(
    new StateStore(join(dir, 'state')),
    join(dir, 'repo'),
    join(dir, 'user/config.yml'),
    join(dir, 'home'),
  )
  mkdirSync(engine.root)
  return Promise.resolve()
    .then(() => run(dir, engine))
    .finally(() => rmSync(dir, { recursive: true, force: true }))
}
function begin(engine: FlowEngine) {
  return (
    engine.begin('cut-scopes', { input: 'Order search', owner: 'Alex' }).payload.subject?.id ?? ''
  )
}
function approve(engine: FlowEngine, id: string, decision = 'approve-scopes') {
  engine.answer(`decision.${decision}`, 'approved', { scope: 'run', subject: id, by: 'Alex' })
}
function first<T>(values: readonly T[]): T {
  const value = values[0]
  if (!value) throw new Error('Fixture needs an entry')
  return value
}

describe('scope definition contracts', () => {
  it.each([
    {
      name: 'metric ownership',
      value: plan([{ ...main, metrics: [], measurementReason: 'Only acceptance tests' }]),
      error: 'has no scope owner',
    },
    {
      name: 'flag',
      value: plan([{ ...main, delivery: { mode: 'feature' } }]),
      error: 'name a flag',
    },
    {
      name: 'complexity',
      value: plan([{ ...main, complexity: { level: 'simple', why: ' ' } }]),
      error: 'argued complexity',
    },
    {
      name: 'unknown metric',
      value: plan([{ ...main, metrics: ['retrieval-time', 'invented'] }]),
      error: 'unknown metric',
    },
    {
      name: 'duplicate keys',
      value: plan([main, { ...main, title: 'Other cut' }]),
      error: 'keys must be unique',
    },
    {
      name: 'dependency cycle',
      value: plan([
        { ...main, after: ['other'] },
        { ...main, key: 'other', after: ['main'] },
      ]),
      error: 'cycle',
    },
    {
      name: 'unknown dependency',
      value: plan([{ ...main, after: ['missing'] }]),
      error: 'Unknown scope dependency',
    },
  ])('rejects $name', ({ value, error }) => {
    expect(() =>
      checkScopePlan(parseScopePlan(artifact(value)), { metrics: [], stories: [] }),
    ).toThrow(error)
  })

  it('requires explicit standalone measurement inputs and preserves spec coverage', () => {
    expect(() =>
      checkScopePlan(
        { schema: 'wholeloop/scope-plan@1', scopes: [main] },
        { metrics: [], stories: [] },
      ),
    ).toThrow('Standalone')
    const unmeasured = {
      ...plan([
        {
          ...main,
          metrics: [],
          measurementReason: 'Contractual behavior tested through acceptance criteria',
        },
      ]),
      metricIds: [],
      measurementException: { reason: 'Mandatory contract', who: 'Alex' },
    }
    expect(() =>
      checkScopePlan(parseScopePlan(artifact(unmeasured)), { metrics: [], stories: [] }),
    ).not.toThrow()
    const context = {
      sourceSpec: 'pinned.md',
      metrics: ['retrieval-time'],
      stories: ['find-order'],
    }
    expect(() => checkScopePlan(plan(), context)).toThrow('pin the current')
    expect(() =>
      checkScopePlan(
        { ...plan(), sourceSpec: 'pinned.md', scopes: [{ ...main, stories: [] }] },
        context,
      ),
    ).toThrow('Story find-order')
    expect(() =>
      checkScopePlan({ ...plan(), sourceSpec: 'pinned.md', metricIds: [] }, context),
    ).toThrow('must match')
    expect(() =>
      checkScopePlan(
        {
          ...plan(),
          sourceSpec: 'pinned.md',
          measurementException: { reason: 'Skip measurement', who: 'Alex' },
        },
        context,
      ),
    ).toThrow('cannot replace')
  })
})

describe('scope persistence and approval', () => {
  it('leaves the journal unchanged when metric ownership is missing', () =>
    fixture((_dir, engine) => {
      const id = begin(engine)
      const before = engine.store.events()
      expect(() =>
        engine.complete(
          'cut-scopes',
          id,
          artifact(plan([{ ...main, metrics: [], measurementReason: 'Only acceptance criteria' }])),
        ),
      ).toThrow('Metric retrieval-time has no scope owner')
      expect(engine.store.events()).toEqual(before)
      expect(engine.store.list()).toHaveLength(1)
    }))

  it('retains remote tracker publication as a pending handoff', () =>
    fixture((_dir, engine) => {
      const folder = join(engine.root, '.wholeloop/providers/team-tracker')
      mkdirSync(folder, { recursive: true })
      writeFileSync(
        join(folder, 'provider.json'),
        JSON.stringify({
          schema: 1,
          id: 'team-tracker',
          name: 'Team tracker',
          description: 'Shared tracker',
          access: {
            mcp: {
              server: 'team-tracker',
              install: { transport: 'http', url: 'https://tracker.example.com/mcp' },
            },
          },
          capabilities: ['tracker'],
          operations: { 'tracker.create-item': { tool: 'create_issue' } },
          degrade: { 'tracker.create-item': 'handoff-artifact' },
        }),
      )
      writeFileSync(
        join(engine.root, '.wholeloop/config.yml'),
        'version: 1\nproviders: {tracker: team-tracker}\n',
      )
      const id = begin(engine)
      const child = first(engine.complete('cut-scopes', id, artifact(plan())).scopes ?? [])
      expect(child.tracker).toMatchObject({ provider: 'team-tracker', status: 'pending' })
      expect(engine.store.get(child.id).notes.at(-1)?.text).toContain(
        'Publication pending: team-tracker',
      )
      expect(engine.store.get(child.id).links).toEqual([])
    }))

  it('creates local tracker children atomically, reuses keys and rebuilds without duplicating', () =>
    fixture((_dir, engine) => {
      const id = begin(engine)
      expect(engine.store.get(id).kind).toBe('initiative')
      const receipt = engine.complete('cut-scopes', id, artifact(plan()))
      const child = first(receipt.scopes ?? [])
      expect(child).toMatchObject({
        key: 'main',
        tracker: { provider: 'local-tracker', status: 'stored', ref: child.id },
      })
      expect(engine.store.get(child.id)).toMatchObject({
        kind: 'scope',
        parent: id,
        owner: 'Alex',
        repository: engine.store.get(id).repository,
      })
      expect(engine.store.events().find((entry) => entry.type === 'scope.defined')).toMatchObject({
        subject: child.id,
        data: { after: [], tracker: { ref: child.id } },
      })
      expect(next(engine, id).code).toBe(2)
      expect(next(engine, child.id).payload.questions?.[0]).toMatchObject({
        id: 'decision.approve-scopes',
        subject: id,
      })
      approve(engine, id)
      expect(engine.plan(child.id)).toMatchObject({ next: 'slice-work', pending: [] })
      expect(next(engine, id).code).toBe(3)
      engine.begin('cut-scopes', { subject: id })
      const revised = engine.complete(
        'cut-scopes',
        id,
        artifact(plan([{ ...main, title: 'Find archived orders' }])),
      )
      expect(first(revised.scopes ?? []).id).toBe(child.id)
      expect(engine.store.list().filter((item) => item.kind === 'scope')).toHaveLength(1)
      expect(engine.plan(child.id).pending.map((decision) => decision.id)).toContain(
        'approve-scopes',
      )
      const saved = engine.store.files.read(receipt.artifact)
      engine.store.rebuild()
      expect(engine.store.files.read(receipt.artifact)).toBe(saved)
      expect(engine.store.get(child.id).title).toBe('Find archived orders')
    }))

  it('blocks stale spec approvals at begin and complete without partial child writes', () =>
    fixture((_dir, engine) => {
      const id =
        engine.begin('write-spec', {
          input: 'Order search',
          owner: 'Alex',
          impact: 'Reduce retrieval time',
        }).payload.subject?.id ?? ''
      engine.complete('write-spec', id, spec)
      expect(() => engine.begin('cut-scopes', { subject: id })).toThrow('approve-spec')
      approve(engine, id, 'approve-spec')
      engine.begin('cut-scopes', { subject: id })
      const scoped = {
        ...plan(),
        sourceSpec: scopeContext(engine.store.events(), id).sourceSpec ?? '',
      }
      engine.begin('write-spec', { subject: id })
      const before = engine.store.events()
      expect(() => engine.complete('cut-scopes', id, artifact(scoped))).toThrow('approve-spec')
      expect(engine.store.events()).toEqual(before)
      engine.complete('write-spec', id, spec)
      approve(engine, id, 'approve-spec')
      expect(() => engine.complete('cut-scopes', id, artifact(scoped))).toThrow('pin the current')
      engine.complete(
        'cut-scopes',
        id,
        artifact({
          ...scoped,
          sourceSpec: scopeContext(engine.store.events(), id).sourceSpec ?? '',
        }),
      )
      expect(engine.store.list().filter((item) => item.kind === 'scope')).toHaveLength(1)
    }))

  it('detects cycles through stored scope IDs and rolls back every child update', () =>
    fixture((_dir, engine) => {
      const id = begin(engine)
      const receipt = engine.complete(
        'cut-scopes',
        id,
        artifact(plan([main, { ...main, key: 'other', after: ['main'] }])),
      )
      const a = first(receipt.scopes ?? [])
      const b = (receipt.scopes ?? [])[1]
      if (!b) throw new Error('Expected second scope')
      engine.begin('cut-scopes', { subject: id })
      const before = engine.store.events()
      expect(() =>
        engine.complete('cut-scopes', id, artifact(plan([{ ...main, after: [b.id] }]))),
      ).toThrow('cycle')
      expect(engine.store.events()).toEqual(before)
      engine.store.update(a.id, { status: 'closed' })
      expect(() => engine.complete('cut-scopes', id, artifact(plan()))).toThrow('closed')
    }))

  it('resolves dependencies, retains omitted scopes and asks which approved scope to continue', () =>
    fixture((_dir, engine) => {
      const id = begin(engine)
      const receipt = engine.complete(
        'cut-scopes',
        id,
        artifact(plan([main, { ...main, key: 'other', after: ['main'] }])),
      )
      const a = first(receipt.scopes ?? [])
      expect(
        engine.store
          .events()
          .filter((entry) => entry.type === 'scope.defined')
          .at(-1),
      ).toMatchObject({ data: { after: [a.id] } })
      approve(engine, id)
      expect(next(engine, id).payload.questions?.[0]?.options).toHaveLength(2)
      engine.begin('cut-scopes', { subject: id })
      engine.complete('cut-scopes', id, artifact(plan()))
      expect(engine.store.list().filter((item) => item.kind === 'scope')).toHaveLength(2)
    }))

  it('reads bound flag naming guidance before drafting and validates the result', () =>
    fixture(async (_dir, engine) => {
      const guide = '.agents/skills/flag-names/SKILL.md'
      mkdirSync(dirname(join(engine.root, guide)), { recursive: true })
      writeFileSync(
        join(engine.root, guide),
        '---\nname: flag-names\ndescription: Name product flags.\nmetadata:\n  wholeloop.slot: flags.naming\n---\n\nUse orders_search_v1 for the search feature.\n',
      )
      const begun = engine.begin('cut-scopes', { input: 'Order search', owner: 'Alex' })
      const binding = begun.payload.bindings['flags.naming']?.selected
      expect(binding?.ref).toBe(guide)
      const calls: string[] = []
      const drafted = await draftScopes(
        { metrics: [], stories: [] },
        begun.payload.profile,
        binding ?? null,
        {
          async readGuidance(ref) {
            calls.push('read')
            return readFileSync(join(engine.root, ref), 'utf8')
          },
          async draft(input) {
            calls.push('draft')
            expect(input.flagGuidance).toContain('orders_search_v1')
            return artifact(plan())
          },
        },
      )
      expect(calls).toEqual(['read', 'draft'])
      expect(
        engine.complete('cut-scopes', begun.payload.subject?.id ?? '', drafted).scopes,
      ).toHaveLength(1)
    }))

  it('runs standalone scope planning, schema, completion and approval through the compiled CLI', () =>
    fixture((dir, engine) => {
      const cli = (...args: string[]) => {
        const response = spawnSync(process.execPath, [resolve('dist/wl.mjs'), ...args, '--json'], {
          cwd: engine.root,
          env: {
            ...process.env,
            XDG_CONFIG_HOME: join(dir, 'config'),
            XDG_STATE_HOME: join(dir, 'cli-state'),
            WL_WORKSPACE: '',
          },
          encoding: 'utf8',
        })
        return { code: response.status, value: JSON.parse(response.stdout) }
      }
      expect(cli('scopes', 'schema').value.scopeSchema.$id).toBe('wholeloop/scope-plan@1')
      const id = cli('step', 'begin', 'cut-scopes', '--input', 'Order search', '--owner', 'Alex')
        .value.subject.id
      const suggestion = cli('scopes', 'plan', '--for', id)
      expect(suggestion.code).toBe(0)
      expect(suggestion.value.suggestedScopes).toHaveLength(1)
      expect(suggestion.value.questions.map((question: { id: string }) => question.id)).toContain(
        'scope:metricIds',
      )
      const file = join(dir, 'scopes.md')
      writeFileSync(file, artifact(plan()))
      const receipt = cli('step', 'complete', 'cut-scopes', '--for', id, '--artifact', file)
      expect(receipt.code).toBe(0)
      const child = receipt.value.scopes[0].id
      expect(cli('next', child).value.questions[0].subject).toBe(id)
      expect(
        cli('answer', 'decision.approve-scopes=approved', '--for', id, '--by', 'Alex').code,
      ).toBe(0)
      expect(cli('step', 'plan', '--for', child).value.pending).toEqual([])
    }))
})
