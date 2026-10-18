import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { stringify } from 'yaml'
import { draftSlices } from '../../../harness/workflows/slicing.js'
import { FlowEngine } from '../../../src/flow/engine.js'
import { SCOPE_SECTIONS, scopeContext } from '../../../src/scopes/contract.js'
import {
  checkSlicePlan,
  parseSlicePlan,
  type SlicePlan,
  slicingContext,
} from '../../../src/slices/contract.js'
import { blockingDependencies } from '../../../src/slices/routing.js'
import { contextPack } from '../../../src/state/resume.js'
import { StateStore } from '../../../src/state/store.js'
import { next } from '../../../src/utilities/next.js'

const source = readFileSync(new URL('../../fixtures/slicing/plan.md', import.meta.url), 'utf8')
const spec = readFileSync(new URL('../../fixtures/spec/spec.md', import.meta.url), 'utf8')
const body = source.replace(/^---\n[\s\S]*?\n---\n/, '')
const artifact = (value: unknown) => `---\n${stringify(value)}---\n${body}`
function first<T>(values: readonly T[]): T {
  const value = values[0]
  if (!value) throw new Error('Fixture needs an entry')
  return value
}
function plan(dir: string, count = 2): SlicePlan {
  const value = parseSlicePlan(source)
  value.repositories = Array.from({ length: count }, (_, index) => ({
    key: `repo${index}`,
    path: join(dir, `repo${index}`),
  }))
  const slice = first(value.slices)
  slice.repositories = value.repositories.map((repo) => repo.key).reverse()
  if (count > 1)
    slice.contract = {
      repository: 'repo0',
      interface: 'GET /orders?number= returns owned matching orders',
      examples: ['GET /orders?number=123 returns the owned order'],
    }
  else delete slice.contract
  return value
}
function fixture(run: (dir: string, engine: FlowEngine) => void | Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-slices-'))
  const root = join(dir, 'repo0')
  for (let index = 0; index < 4; index++) mkdirSync(join(dir, `repo${index}`))
  const engine = new FlowEngine(
    new StateStore(join(dir, 'state')),
    root,
    join(dir, 'user/config.yml'),
    join(dir, 'home'),
  )
  return Promise.resolve()
    .then(() => run(dir, engine))
    .finally(() => rmSync(dir, { recursive: true, force: true }))
}
const begin = (engine: FlowEngine) =>
  engine.begin('slice-work', { input: 'Order search', owner: 'Alex' }).payload.subject?.id ?? ''

describe('vertical slice structure', () => {
  it.each([
    {
      name: 'two outcomes',
      change: (value: SlicePlan) => {
        first(value.slices).outcomes.push('Export unrelated invoices')
        return value
      },
      error: 'exactly one user-visible outcome',
    },
    {
      name: 'missing demonstration',
      change: (value: SlicePlan) => ({
        ...value,
        slices: [{ ...first(value.slices), demonstration: undefined }],
      }),
      error: 'demonstration',
    },
    {
      name: 'empty demonstration',
      change: (value: SlicePlan) => {
        first(value.slices).demonstration.expected = ' '
        return value
      },
      error: 'end-to-end demonstration',
    },
    {
      name: 'missing criteria',
      change: (value: SlicePlan) => {
        first(value.slices).criteria = []
        return value
      },
      error: 'at least 1',
    },
    {
      name: 'missing test cases',
      change: (value: SlicePlan) => {
        first(value.slices).tests = []
        return value
      },
      error: 'at least 1',
    },
    {
      name: 'uncovered criterion',
      change: (value: SlicePlan) => {
        first(value.slices).criteria.push({
          id: 'empty-result',
          text: 'Unknown order numbers show an empty result.',
          test: 'Query a missing ID and assert the empty state.',
        })
        return value
      },
      error: 'needs a test case',
    },
    {
      name: 'unknown test criterion',
      change: (value: SlicePlan) => {
        first(first(value.slices).tests).criteria.push('unknown')
        return value
      },
      error: 'unknown criterion',
    },
    {
      name: 'missing contract',
      change: (value: SlicePlan) => {
        delete first(value.slices).contract
        return value
      },
      error: 'contract-first',
    },
    {
      name: 'unknown contract owner',
      change: (value: SlicePlan) => {
        const contract = first(value.slices).contract
        if (contract) contract.repository = 'unknown'
        return value
      },
      error: 'contract repository',
    },
    {
      name: 'duplicate repository',
      change: (value: SlicePlan) => {
        value.repositories.push(first(value.repositories))
        return value
      },
      error: 'unique',
    },
    {
      name: 'unknown repository',
      change: (value: SlicePlan) => {
        first(value.slices).repositories.push('unknown')
        return value
      },
      error: 'unknown repository',
    },
  ])('rejects $name', ({ change, error }) => {
    expect(() =>
      checkSlicePlan(parseSlicePlan(artifact(change(plan('/example')))), { criteria: [] }),
    ).toThrow(error)
  })

  it('defaults slices to a sequential chain and detects cycles while allowing explicit independence', () => {
    const value = plan('/example')
    const initial = first(value.slices)
    initial.blockedBy = ['later']
    value.slices.push({ ...initial, key: 'later', blockedBy: ['search'] })
    expect(() => checkSlicePlan(value, { criteria: [] })).toThrow('cycle')
    delete first(value.slices.slice(1)).blockedBy
    expect(() => checkSlicePlan(value, { criteria: [] })).toThrow('cycle')
    first(value.slices.slice(1)).blockedBy = []
    expect(() => checkSlicePlan(value, { criteria: [] })).not.toThrow()
  })
})

describe('slice and part persistence', () => {
  it('asks before creating standalone work and creates only the minimal initiative/scope hierarchy', () =>
    fixture((_dir, engine) => {
      expect(engine.begin('slice-work', {}).payload.missing).toEqual(['input', 'owner'])
      expect(engine.store.events()).toEqual([])
      const id = begin(engine)
      const scope = engine.store.get(id)
      expect(scope.kind).toBe('scope')
      expect(engine.store.get(scope.parent ?? '').kind).toBe('initiative')
      expect(engine.store.events().filter((entry) => entry.type === 'step.started')).toHaveLength(1)
      expect(engine.store.events().some((entry) => entry.type === 'step.skipped')).toBe(false)
      expect(engine.begin('slice-work', { subject: id }).payload.subject?.id).toBe(id)
      expect(engine.store.events()).toHaveLength(3)
    }))

  it.each([1, 2, 3, 4])('makes at most %i repository parts with the contract first', (count) =>
    fixture((dir, engine) => {
      const id = begin(engine)
      const receipt = engine.complete('slice-work', id, artifact(plan(dir, count)))
      const slice = first(receipt.slices ?? [])
      expect(slice.parts.length).toBeLessThanOrEqual(count)
      expect(slice.parts).toHaveLength(count === 1 ? 0 : count)
      if (count > 1) {
        const contract = first(slice.parts)
        expect(contract).toMatchObject({ repository: 'repo0', role: 'contract' })
        for (const part of slice.parts.slice(1)) {
          expect(blockingDependencies(engine.store.events(), part.id)).toEqual([contract.id])
          expect(engine.store.get(part.id)).toMatchObject({ kind: 'part', parent: slice.id })
        }
      }
      expect(slice.tracker).toMatchObject({
        provider: 'local-tracker',
        status: 'stored',
        ref: slice.id,
      })
      expect(engine.store.get(slice.id)).toMatchObject({ kind: 'slice', parent: id })
      const saved = engine.store.files.read(receipt.artifact)
      engine.store.rebuild()
      expect(engine.store.files.read(receipt.artifact)).toBe(saved)
    }),
  )

  it('reuses slice and repository-part identity and routes the contract before implementation', () =>
    fixture((dir, engine) => {
      const id = begin(engine)
      const value = plan(dir)
      const slice = first(engine.complete('slice-work', id, artifact(value)).slices ?? [])
      expect(next(engine, id)).toMatchObject({
        code: 0,
        payload: { contract: { subject: { id: first(slice.parts).id } } },
      })
      const implementation = first(slice.parts.slice(1))
      expect(() => engine.begin('build-slice', { subject: implementation.id })).toThrow(
        'Blocked by',
      )
      expect(next(engine, implementation.id)).toMatchObject({
        code: 3,
        payload: { blockedBy: [first(slice.parts).id] },
      })
      engine.begin('slice-work', { subject: id })
      first(value.slices).title = 'Find an archived order by number'
      const revised = first(engine.complete('slice-work', id, artifact(value)).slices ?? [])
      expect(revised.id).toBe(slice.id)
      expect(revised.parts).toEqual(slice.parts)
      engine.store.update(first(slice.parts).id, { status: 'closed' })
      expect(next(engine, id)).toMatchObject({
        code: 0,
        payload: { contract: { subject: { id: implementation.id } } },
      })
      expect(engine.store.get(slice.id).title).toBe('Find an archived order by number')
    }))

  it('records sequential blocked-by links, asks between independent slices and rejects stored cycles atomically', () =>
    fixture((dir, engine) => {
      const id = begin(engine)
      const value = plan(dir, 1)
      value.slices.push({ ...first(value.slices), key: 'empty-state' })
      const receipt = engine.complete('slice-work', id, artifact(value))
      const initial = first(receipt.slices ?? [])
      const second = first((receipt.slices ?? []).slice(1))
      expect(second.blockedBy).toEqual([initial.id])
      expect(next(engine, second.id).code).toBe(3)
      expect(next(engine, id)).toMatchObject({
        payload: { contract: { subject: { id: initial.id } } },
      })
      engine.begin('slice-work', { subject: id })
      const before = engine.store.events()
      const cycle = plan(dir, 1)
      first(cycle.slices).blockedBy = [second.id]
      expect(() => engine.complete('slice-work', id, artifact(cycle))).toThrow('cycle')
      expect(engine.store.events()).toEqual(before)
      first(value.slices.slice(1)).blockedBy = []
      engine.complete('slice-work', id, artifact(value))
      expect(next(engine, id).payload.questions?.[0]?.options).toHaveLength(2)
    }))

  it('rejects symlink-aliased repository roots and preserves the entire journal on validation failure', () =>
    fixture((dir, engine) => {
      const id = begin(engine)
      const before = engine.store.events()
      const value = plan(dir)
      symlinkSync(join(dir, 'repo0'), join(dir, 'alias'))
      first(value.repositories.slice(1)).path = join(dir, 'alias')
      expect(() => engine.complete('slice-work', id, artifact(value))).toThrow('distinct')
      expect(engine.store.events()).toEqual(before)
      first(value.slices).outcomes.push('Export invoices')
      expect(() => engine.complete('slice-work', id, artifact(value))).toThrow(
        'one user-visible outcome',
      )
      expect(engine.store.events()).toEqual(before)
    }))

  it('rejects implicit reopening and changing a stable part repository without partial writes', () =>
    fixture((dir, engine) => {
      const id = begin(engine)
      const receipt = engine.complete('slice-work', id, artifact(plan(dir)))
      const contract = first(first(receipt.slices ?? []).parts).id
      engine.begin('slice-work', { subject: id })
      const changed = plan(dir)
      first(changed.repositories).path = join(dir, 'repo3')
      const before = engine.store.events()
      expect(() => engine.complete('slice-work', id, artifact(changed))).toThrow(
        'cannot change repository identity',
      )
      expect(engine.store.events()).toEqual(before)
      engine.store.update(contract, { status: 'closed' })
      const closed = engine.store.events()
      expect(() => engine.complete('slice-work', id, artifact(plan(dir)))).toThrow('closed')
      expect(engine.store.events()).toEqual(closed)
    }))

  it('requires parent approval and preserves pinned spec criteria before creating slices', () =>
    fixture((dir, engine) => {
      const init =
        engine.begin('write-spec', {
          input: 'Order search',
          owner: 'Alex',
          impact: 'Reduce retrieval time',
        }).payload.subject?.id ?? ''
      engine.complete('write-spec', init, spec)
      engine.answer('decision.approve-spec', 'approved', {
        scope: 'run',
        subject: init,
        by: 'Alex',
      })
      engine.begin('cut-scopes', { subject: init })
      const scopes = {
        schema: 'wholeloop/scope-plan@1',
        sourceSpec: scopeContext(engine.store.events(), init).sourceSpec,
        scopes: [
          {
            key: 'main',
            title: 'Order search',
            goal: 'Retrieve owned orders',
            metrics: ['retrieval-time'],
            stories: ['find-order'],
            delivery: { mode: 'feature', flag: 'orders_v1' },
            complexity: { level: 'simple', why: 'Existing endpoint' },
          },
        ],
      }
      const scopeArtifact = () =>
        `---\n${stringify(scopes)}---\n${SCOPE_SECTIONS.map((section) => `## ${section}\n\nReview the structured cut.\n`).join('\n')}`
      const scope = first(engine.complete('cut-scopes', init, scopeArtifact()).scopes ?? []).id
      expect(() => engine.begin('slice-work', { subject: scope })).toThrow('approve-scopes')
      engine.answer('decision.approve-scopes', 'approved', {
        scope: 'run',
        subject: init,
        by: 'Alex',
      })
      engine.begin('slice-work', { subject: scope })
      const context = slicingContext(engine.store.events(), scope)
      const value = {
        ...plan(dir),
        sourceScope: context.sourceScope ?? '',
        sourceSpec: context.sourceSpec ?? '',
      }
      first(value.slices).criteria = context.criteria
      first(value.slices).tests = context.criteria.map((criterion) => ({
        id: criterion.id,
        criteria: [criterion.id],
        steps: [criterion.test],
        expected: criterion.text,
      }))
      const before = engine.store.events()
      const missing = structuredClone(value)
      first(missing.slices).criteria = [first(first(missing.slices).criteria)]
      first(missing.slices).tests = [first(first(missing.slices).tests)]
      expect(() => engine.complete('slice-work', scope, artifact(missing))).toThrow(
        'Spec criterion no-match has no slice owner',
      )
      expect(engine.store.events()).toEqual(before)
      const changed = structuredClone(value)
      first(first(changed.slices).criteria).text = 'Return every order without ownership filtering.'
      expect(() => engine.complete('slice-work', scope, artifact(changed))).toThrow(
        'Preserve spec criterion',
      )
      engine.begin('cut-scopes', { subject: init })
      expect(() => engine.complete('slice-work', scope, artifact(value))).toThrow('approve-scopes')
      engine.complete('cut-scopes', init, scopeArtifact())
      engine.answer('decision.approve-scopes', 'approved', {
        scope: 'run',
        subject: init,
        by: 'Alex',
      })
      expect(() => engine.complete('slice-work', scope, artifact(value))).toThrow(
        'current sourceScope',
      )
      const completed = engine.complete(
        'slice-work',
        scope,
        artifact({
          ...value,
          sourceScope: slicingContext(engine.store.events(), scope).sourceScope ?? '',
        }),
      )
      expect(completed.slices).toHaveLength(1)
      const contract = first(first(completed.slices ?? []).parts).id
      engine.begin('cut-scopes', { subject: init })
      expect(contextPack(engine.store.events(), contract).flow.pending).toEqual([
        expect.objectContaining({ id: 'approve-scopes', subject: init }),
      ])
      expect(next(engine, contract).code).toBe(2)
    }))

  it('reads repository slicing conventions before drafting and keeps remote tracker publication pending', () =>
    fixture(async (dir, engine) => {
      const guide = '.agents/skills/vertical-slices/SKILL.md'
      mkdirSync(dirname(join(engine.root, guide)), { recursive: true })
      writeFileSync(
        join(engine.root, guide),
        '---\nname: vertical-slices\ndescription: Slice by user-visible outcomes.\nmetadata:\n  wholeloop.slot: slice.conventions\n---\n\nKeep authorization checks in each end-to-end demonstration.\n',
      )
      mkdirSync(join(engine.root, '.wholeloop'))
      writeFileSync(
        join(engine.root, '.wholeloop/config.yml'),
        'version: 1\nproviders: {tracker: github-issues}\n',
      )
      const begun = engine.begin('slice-work', { input: 'Order search', owner: 'Alex' })
      const calls: string[] = []
      const drafted = await draftSlices(
        { criteria: [] },
        begun.payload.profile,
        begun.payload.bindings['slice.conventions']?.selected ?? null,
        {
          async readGuidance(ref) {
            calls.push('read')
            return readFileSync(join(engine.root, ref), 'utf8')
          },
          async draft(input) {
            calls.push('draft')
            expect(input.guidance).toContain('authorization')
            return artifact(plan(dir))
          },
        },
      )
      expect(calls).toEqual(['read', 'draft'])
      const slice = first(
        engine.complete('slice-work', begun.payload.subject?.id ?? '', drafted).slices ?? [],
      )
      expect(slice.tracker).toMatchObject({ provider: 'github-issues', status: 'pending' })
      expect(engine.store.get(slice.id).notes.at(-1)?.text).toContain('Publication pending')
    }))

  it('runs standalone planning, validation, completion and contract routing through the compiled CLI', () =>
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
      mkdirSync(join(engine.root, '.wholeloop'))
      writeFileSync(
        join(engine.root, '.wholeloop/config.yml'),
        stringify({
          version: 1,
          slots: Object.fromEntries(
            [
              'slice.conventions',
              'build.backend',
              'build.frontend',
              'build.design-system',
              'commit.convention',
            ].map((slot) => [slot, 'default']),
          ),
        }),
      )
      expect(cli('slices', 'schema').value.sliceSchema.$id).toBe('wholeloop/slice-plan@1')
      const id = cli('step', 'begin', 'slice-work', '--input', 'Order search', '--owner', 'Alex')
        .value.subject.id
      expect(cli('slices', 'plan', '--for', id).value.suggestedSlices).toHaveLength(1)
      const file = join(dir, 'slices.md')
      writeFileSync(file, artifact(plan(dir)))
      expect(cli('slices', 'check', file, '--for', id).code).toBe(0)
      expect(cli('challenge', 'plan', 'slicing', '--file', file, '--for', id).code).toBe(0)
      const receipt = cli('step', 'complete', 'slice-work', '--for', id, '--artifact', file)
      expect(receipt.code).toBe(0)
      const contract = receipt.value.slices[0].parts[0].id
      expect(cli('next', id)).toMatchObject({
        code: 0,
        value: { contract: { subject: { id: contract } } },
      })
    }))
})
