import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { JsonSchemaType } from '@modelcontextprotocol/sdk/validation'
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv'
import { describe, expect, it } from 'vitest'
import { FlowEngine } from '../../../src/flow/engine.js'
import { OVERVIEW_LIMITS, projectOverview } from '../../../src/overview/project.js'
import { readOverview } from '../../../src/overview/read.js'
import schema from '../../../src/overview/schemas/overview-v1.json' with { type: 'json' }
import { RunnerHumanDecisions } from '../../../src/runner/human-decisions.js'
import { type RunnerRequest, RunnerStore } from '../../../src/runner/store.js'
import {
  withClientAttribution,
  withPersonAttribution,
} from '../../../src/state/attribution-context.js'
import { StateStore } from '../../../src/state/store.js'
import { authorization, fixture } from '../../support/delivery.js'

async function temporary(run: (root: string) => void | Promise<void>) {
  const root = mkdtempSync(join(tmpdir(), 'wholeloop-overview-project-'))
  try {
    await run(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}
const privateText = 'PRIVATE_OVERVIEW_CONTENT',
  at = '2026-11-04T20:00:00.000Z'
const validate = new AjvJsonSchemaValidator().getValidator(schema as unknown as JsonSchemaType)
function conforms(value: ReturnType<typeof projectOverview>) {
  expect(validate(value)).toMatchObject({ valid: true })
  return value
}
describe('bounded operator overview projection', () => {
  it('changes its semantic digest when an exact private human record arrives without a journal append', async () => {
    await fixture(({ planning, plan, root, dir }) => {
      const runner = new RunnerStore(planning.sources.files.root, () => at),
        prepared = planning.preparePlan(plan),
        grant = runner.lifecycle.authority.authorize(authorization(plan, prepared.digest))
      runner.lifecycle.track({ run: plan.run, revision: 1, grant: grant.grant.id })
      const request: RunnerRequest = {
          schema: 'wholeloop/delivery-runner-request@1',
          key: 'human-overview',
          run: plan.run,
          revision: 1,
          plan: prepared.digest,
          grant: grant.grant.id,
          host: { id: 'fixture', version: '1', configuration: 'a'.repeat(64) },
          pollMs: 50,
        },
        digest = runner.prepare(request).digest,
        lease = runner.claim(digest, `controller-${'a'.repeat(32)}`)
      runner.append(lease, { action: 'dispatched', stage: 'plan', invocation: 'b'.repeat(64) })
      const stage = runner.stage(digest, 'plan'),
        human = new RunnerHumanDecisions(runner, () => at)
      if (!stage) throw new Error('Fixture requires an issued stage')
      human.open(request, stage, 'c'.repeat(64))
      runner.lifecycle.transition(plan.run, {
        to: 'waiting-input',
        reason: 'Fixture human request.',
      })
      const options = { root, store: runner.files.root, userFile: join(dir, 'user.yml'), at },
        before = conforms(projectOverview(readOverview(options)))
      expect(before.attention.map((entry) => entry.reason)).toContain('human-decision')
      human.record({
        request: digest,
        stage: 'plan',
        decision: 'delivery-plan',
        subject: 'c'.repeat(64),
        outcome: 'accept',
        by: privateText,
        note: privateText,
      })
      const after = conforms(projectOverview(readOverview(options)))
      expect(after.cursor).toBe(before.cursor)
      expect(after.digest).not.toBe(before.digest)
      expect(after.attention.map((entry) => entry.reason)).not.toContain('human-decision')
      expect(after.deliveries[0]?.humanDecisions[0]?.status).toBe('recorded')
      expect(JSON.stringify(after)).not.toContain(privateText)
      conforms(projectOverview(readOverview({ ...options, at: '2026-11-06T20:00:00.000Z' })))
    })
  })
  it('reports the live deadline with active authority without inventing usage or suggesting more work', async () => {
    await fixture(({ planning, plan, root, dir }) => {
      const runner = new RunnerStore(planning.sources.files.root, () => at),
        prepared = planning.preparePlan(plan),
        grant = runner.lifecycle.authority.authorize(authorization(plan, prepared.digest))
      runner.lifecycle.track({ run: plan.run, revision: 1, grant: grant.grant.id })
      runner.budgets.start(plan.run)
      const view = conforms(
        projectOverview(
          readOverview({
            root,
            store: runner.files.root,
            userFile: join(dir, 'user.yml'),
            at: '2026-11-05T01:00:00.000Z',
          }),
        ),
      )
      expect(view.headline).toBe('blocked')
      expect(view.attention.map((entry) => entry.reason)).toContain('budget-boundary')
      expect(view.deliveries[0]?.grant?.status).toBe('active')
      expect(view.deliveries[0]?.budget?.problem).toBeTruthy()
      expect(view.deliveries[0]?.next.some((command) => command.argv[2] === 'run')).toBe(false)
    })
  })
  it('deduplicates one parent approval inherited by several visible children', async () => {
    await temporary((root) => {
      const store = new StateStore(join(root, 'store')),
        userFile = join(root, 'user.yml'),
        engine = new FlowEngine(store, root, userFile, root),
        parent = store.create({ kind: 'initiative', title: 'Parent', owner: 'Owner', body: '' })
      for (const title of ['First scope', 'Second scope'])
        store.create({ kind: 'scope', title, owner: 'Owner', body: '', parent: parent.id })
      engine.skip('write-spec', parent.id, 'Use a specification')
      const view = conforms(
          projectOverview(readOverview({ root, store: store.files.root, userFile, at })),
        ),
        entries = view.attention.filter((entry) => entry.reason === 'item-decision')
      expect(entries).toHaveLength(1)
      expect(entries[0]?.target.id).toBe(parent.id)
      expect(entries[0]?.next[0]?.argv).toContain('--basis')
      expect(entries[0]?.next[0]?.inputs).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'operator', kind: 'person' })]),
      )
    })
  })
  it('is empty on an unused store and ignores timestamp-only changes in its semantic digest', async () => {
    await temporary((root) => {
      const options = { root, store: join(root, 'store'), userFile: join(root, 'user.yml') },
        first = projectOverview(readOverview({ ...options, at })),
        later = projectOverview(readOverview({ ...options, at: '2026-11-04T20:01:00.000Z' }))
      expect(first).toMatchObject({
        schema: 'wholeloop/overview@1',
        headline: 'empty',
        items: [],
        deliveries: [],
        agents: [],
        counts: { items: 0 },
        nativeAcceptance: 'not-established-by-inspection',
      })
      conforms(first)
      conforms(later)
      expect(later.digest).toBe(first.digest)
      expect(later.asOf).not.toBe(first.asOf)
    })
  })
  it('retains declared identity as last-seen while excluding item text, notes, person names and private rationale', async () => {
    await temporary((root) => {
      const store = new StateStore(join(root, 'store')),
        userFile = join(root, 'user.yml'),
        engine = new FlowEngine(store, root, userFile, root),
        item = store.create({
          kind: 'initiative',
          title: privateText,
          body: privateText,
          owner: privateText,
        })
      withClientAttribution(
        { client: 'codex', model: 'declared-fixture-model', source: 'declared' },
        () => store.note(item.id, privateText),
      )
      engine.skip('write-spec', item.id, privateText)
      withPersonAttribution(
        {
          actor: { kind: 'person', name: privateText, channel: 'terminal' },
          rationale: privateText,
        },
        () =>
          engine.answer('decision.approve-spec', 'approved', {
            scope: 'run',
            subject: item.id,
            by: privateText,
          }),
      )
      const view = projectOverview(readOverview({ root, store: store.files.root, userFile, at }))
      conforms(view)
      expect(JSON.stringify(view)).not.toContain(privateText)
      expect(view.agents).toContainEqual(
        expect.objectContaining({
          kind: 'session',
          status: 'last-seen',
          source: 'declared',
          client: { client: 'codex', model: 'declared-fixture-model', source: 'declared' },
        }),
      )
      expect(view.items[0]?.flow.pending).toEqual([])
      store.rebuild()
      expect(
        projectOverview(readOverview({ root, store: store.files.root, userFile, at })).digest,
      ).toBe(view.digest)
    })
  })
  it('orders urgent attention across the complete store before limiting the visible tree', async () => {
    await temporary((root) => {
      const store = new StateStore(join(root, 'store')),
        userFile = join(root, 'user.yml'),
        urgent = 'init-ffffffff'
      store.transaction((_events, append) => {
        for (let index = 0; index < 599; index++)
          append(`init-${index.toString(16).padStart(8, '0')}`, {
            type: 'item.created',
            data: { kind: 'initiative', title: privateText, owner: 'Owner', body: privateText },
          })
        append(urgent, {
          type: 'item.created',
          data: { kind: 'initiative', title: privateText, owner: 'Owner', body: privateText },
        })
      })
      new FlowEngine(store, root, userFile, root).skip('write-spec', urgent, privateText)
      const view = projectOverview(readOverview({ root, store: store.files.root, userFile, at }))
      expect(view.items).toHaveLength(OVERVIEW_LIMITS.items)
      expect(view.counts.items).toBe(600)
      expect(view.omitted.items).toBe(600 - OVERVIEW_LIMITS.items)
      expect(view.items.some((item) => item.id === urgent)).toBe(false)
      expect(view.attention[0]).toMatchObject({ reason: 'item-decision', target: { id: urgent } })
      conforms(view)
      expect(JSON.stringify(view)).not.toContain(privateText)
      expect(Buffer.byteLength(JSON.stringify(view))).toBeLessThan(256 * 1024)
    })
  })
  it('keeps policy authority distinct from observed execution and suppresses new work after expiry', async () => {
    await fixture(({ planning, plan, root, dir }) => {
      const runner = new RunnerStore(planning.sources.files.root, () => at),
        prepared = planning.preparePlan(plan),
        grant = runner.lifecycle.authority.authorize(authorization(plan, prepared.digest))
      runner.lifecycle.track({ run: plan.run, revision: 1, grant: grant.grant.id })
      const request: RunnerRequest = {
        schema: 'wholeloop/delivery-runner-request@1',
        key: 'overview',
        run: plan.run,
        revision: 1,
        plan: prepared.digest,
        grant: grant.grant.id,
        host: { id: 'fixture', version: '1', configuration: 'a'.repeat(64) },
        pollMs: 50,
      }
      runner.prepare(request)
      const options = { root, store: runner.files.root, userFile: join(dir, 'user.yml') },
        current = projectOverview(readOverview({ ...options, at })),
        expired = projectOverview(readOverview({ ...options, at: '2026-11-06T20:00:00.000Z' }))
      conforms(current)
      conforms(expired)
      expect(current.deliveries[0]?.grant).toMatchObject({
        status: 'active',
        provenance: 'operator-control',
      })
      expect(current.deliveries[0]?.route.total).toBeGreaterThan(0)
      expect(current.agents).toEqual([])
      expect(expired.headline).toBe('blocked')
      expect(expired.deliveries[0]?.route.total).toBeNull()
      expect(expired.deliveries[0]?.next.some((command) => command.argv[2] === 'run')).toBe(false)
      expect(expired.nativeAcceptance).toBe('not-established-by-inspection')
    })
  })
})
