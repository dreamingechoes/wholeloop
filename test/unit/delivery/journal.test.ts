import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { buildSync } from 'esbuild'
import { describe, expect, it } from 'vitest'
import { harnessAssets } from '../../../scripts/harness-assets.mjs'
import {
  type AttemptPayload,
  type ControlPayload,
  type DeliveryActor,
  type DeliveryEvent,
  type DeliveryPayload,
  deliveryEvent,
  type GrantPayload,
  type RegistrationPayload,
  validateDeliveryEvent,
} from '../../../src/delivery/events.js'
import { DeliveryJournal } from '../../../src/delivery/journal.js'
import { journalLayout } from '../../../src/delivery/journal-layout.js'
import { DeliveryLifecycle } from '../../../src/delivery/lifecycle.js'
import { deliveryAttempts, replayDelivery } from '../../../src/delivery/reducer.js'
import { pullRequestPlans } from '../../../src/pull-requests/contracts.js'
import { authorization, entry, envelope, fixture } from '../../support/delivery.js'

const at = '2026-10-24T10:00:00.000Z'
const controller: DeliveryActor = { kind: 'controller', name: 'Fixture Controller' }
const run = 'delivery-0123456789abcdef'
const registration = (): RegistrationPayload => ({
  schema: 'wholeloop/delivery-registration-event@1',
  basis: { kind: 'plan', digest: 'a'.repeat(64), revision: 1 },
  source: 'b'.repeat(64),
  policy: { digest: 'c'.repeat(64), endpoint: 'local-handoff', intervention: 'supervised' },
  units: [{ id: 'search', role: 'implementation', repository: 'app' }],
})
function history(payloads: DeliveryPayload[], actor = controller): DeliveryEvent[] {
  const result: DeliveryEvent[] = []
  for (const payload of payloads) result.push(deliveryEvent(run, actor, payload, result.at(-1), at))
  return result
}
const grant = (): GrantPayload => ({
  schema: 'wholeloop/delivery-grant-event@1',
  id: 'authorization-0123456789abcdef',
  digest: 'd'.repeat(64),
  basis: 'a'.repeat(64),
  status: 'active',
})
const control = (
  from: 'planned' | 'queued' | 'running' | 'stopping',
  to: 'queued' | 'running' | 'waiting-input' | 'stopping' | 'stopped' | 'completed',
): ControlPayload => ({
  schema: 'wholeloop/delivery-control-event@1',
  from,
  to,
  basis: 'a'.repeat(64),
  reason: 'Exercise a structural lifecycle transition.',
})
const attempt = (action: AttemptPayload['action'] = 'claimed'): AttemptPayload => ({
  schema: 'wholeloop/delivery-attempt-event@1',
  id: 'attempt-0123456789abcdef',
  basis: 'a'.repeat(64),
  unit: 'search',
  role: 'builder',
  generation: 1,
  action,
})
const queued = () => [registration(), grant(), control('planned', 'queued')]

describe('versioned delivery reducers and immutable event identities (RUN-02, AUTH-07)', () => {
  it('keeps an honest planned state, independent of authority or a mutable projection', () => {
    const events = history([registration()])
    const before = structuredClone(events)
    const state = replayDelivery(events).get(run)
    expect(state).toMatchObject({
      schema: 'wholeloop/delivery-state@1',
      state: 'planned',
      basis: registration().basis,
      sequence: 1,
      clockWentBackwards: false,
    })
    expect(state?.grant).toBeUndefined()
    expect(events).toEqual(before)
  })

  it.each([
    { schema: 'wholeloop/delivery-event@2' },
    { payload: { ...registration(), schema: 'wholeloop/delivery-registration-event@2' } },
    { actor: { kind: 'worker', name: 'A worker cannot stamp controller events.' } },
    { digest: 'f'.repeat(64) },
    { sequence: 0 },
  ])('refuses unknown versions or malformed envelope identity %#', (patch) => {
    const first = entry(history([registration()]), 0)
    expect(() => validateDeliveryEvent({ ...first, ...patch })).toThrow()
  })

  it('refuses reordered, duplicated and removed events rather than replaying a partial view', () => {
    const events = history(queued())
    expect(() => replayDelivery([entry(events, 1), entry(events, 0)])).toThrow('event-order')
    expect(() => replayDelivery([entry(events, 0), entry(events, 0)])).toThrow('event-order')
    expect(() => replayDelivery([entry(events, 0), entry(events, 2)])).toThrow('event-order')
  })

  it.each([
    [registration(), control('planned', 'queued')],
    [registration(), grant(), control('queued', 'running')],
    [registration(), grant(), control('planned', 'running')],
    [...queued(), control('queued', 'running')],
    [...queued(), attempt(), control('queued', 'queued')],
  ])('refuses impossible state transitions %#', (...payloads) => {
    expect(() => replayDelivery(history(payloads))).toThrow()
  })

  it('never admits a human wait in none mode', () => {
    const request = registration()
    request.policy.intervention = 'none'
    expect(() => replayDelivery(history([request, control('planned', 'waiting-input')]))).toThrow(
      'forbidden-human-wait',
    )
  })

  it('requires a matching observed endpoint outcome and no active attempt for completion', () => {
    const start = [...queued(), attempt(), control('queued', 'running')]
    const completed = {
      ...control('running', 'completed'),
      outcome: 'code-ready' as const,
      evidence: 'e'.repeat(64),
    }
    expect(() => replayDelivery(history([...start, completed]))).toThrow('unconfirmed-stop')
    const stopped = { ...attempt('stopped'), evidence: 'f'.repeat(64) }
    const state = replayDelivery(history([...start, stopped, completed])).get(run)
    expect(state?.state).toBe('completed')
    expect(state?.outcome).toBe('code-ready')
    expect(() =>
      replayDelivery(history([...start, stopped, { ...completed, outcome: 'merged' }])),
    ).toThrow('endpoint-outcome')
  })

  it('binds attempts, generations, role/cell identity and the observed runtime', () => {
    const claimed = [...queued(), attempt()]
    expect(() =>
      replayDelivery(
        history([...claimed, { ...attempt(), id: 'attempt-aaaaaaaaaaaaaaaa', generation: 2 }]),
      ),
    ).toThrow('attempt-generation')
    expect(() =>
      replayDelivery(history([...claimed, { ...attempt('started'), generation: 2 }])),
    ).toThrow('attempt-identity')
    expect(() => replayDelivery(history([...claimed, attempt('started')]))).toThrow(
      'missing-runtime-identity',
    )
    const started = {
      ...attempt('started'),
      runtime: { backend: 'fixture', instance: 'instance-1', worker: 'process-1' },
    }
    expect(() =>
      replayDelivery(
        history([
          ...claimed,
          started,
          { ...attempt('heartbeat'), runtime: { ...started.runtime, worker: 'process-2' } },
        ]),
      ),
    ).toThrow('changed-runtime-identity')
    const stopped = { ...attempt('stopped'), evidence: 'e'.repeat(64) }
    const state = replayDelivery(
      history([
        ...claimed,
        started,
        stopped,
        attempt('fenced'),
        { ...attempt(), id: 'attempt-aaaaaaaaaaaaaaaa', generation: 2 },
      ]),
    ).get(run)
    expect(state && deliveryAttempts(state).records.map((record) => record.generation)).toEqual([
      1, 2,
    ])
  })

  it('does not revive revoked grants or bind one grant to a different delivery', () => {
    const revoked = { ...grant(), status: 'revoked' } as DeliveryPayload
    expect(() => replayDelivery(history([registration(), grant(), revoked, grant()]))).toThrow(
      'revived-grant',
    )
    const events = history([registration(), grant()])
    events.push(
      deliveryEvent('delivery-aaaaaaaaaaaaaaaa', controller, registration(), events.at(-1), at),
    )
    events.push(deliveryEvent('delivery-aaaaaaaaaaaaaaaa', controller, grant(), events.at(-1), at))
    expect(() => replayDelivery(events)).toThrow('grant-bound-to-another-run')
  })

  it('records wall-clock regression separately from authoritative sequence order', () => {
    const events = history([registration()])
    events.push(deliveryEvent(run, controller, grant(), events.at(-1), '2026-10-24T09:00:00.000Z'))
    const state = replayDelivery(events).get(run)
    expect(state).toMatchObject({
      clockWentBackwards: true,
      maxObservedAt: at,
      updatedAt: '2026-10-24T09:00:00.000Z',
      sequence: 2,
    })
  })

  it('retains grant ownership after a later revision clears the current observation', () => {
    const events = history([
      registration(),
      grant(),
      {
        ...registration(),
        basis: { kind: 'plan', digest: 'e'.repeat(64), revision: 2 },
        previous: 'a'.repeat(64),
      },
    ])
    events.push(
      deliveryEvent('delivery-aaaaaaaaaaaaaaaa', controller, registration(), events.at(-1), at),
    )
    events.push(deliveryEvent('delivery-aaaaaaaaaaaaaaaa', controller, grant(), events.at(-1), at))
    expect(() => replayDelivery(events)).toThrow('grant-bound-to-another-run')
  })
})

describe('external journal segments, projections and explicit recovery', () => {
  it.each(['segment', 'directory', 'repository'] as const)(
    'rechecks %s ownership after a previous successful flat journal observation',
    (kind) =>
      fixture(({ plan, planning }) => {
        const prepared = planning.preparePlan(plan),
          lifecycle = new DeliveryLifecycle(planning.sources.files.root, () => at),
          issued = lifecycle.authority.authorize(authorization(plan, prepared.digest)),
          original = lifecycle.track({ run: plan.run, revision: 1, grant: issued.grant.id }),
          journal = lifecycle.journal,
          directory = journal.files.path('delivery/journal')
        expect(journal.get(plan.run)).toEqual(original)
        if (kind === 'segment') {
          const name = journalLayout(readdirSync(directory))[0]?.name
          if (!name) throw new Error('Original segment required')
          const path = join(directory, name),
            retained = join(directory, 'retained-original')
          renameSync(path, retained)
          symlinkSync(retained, path)
        } else if (kind === 'directory') {
          const retained = `${directory}-retained`
          renameSync(directory, retained)
          symlinkSync(retained, directory)
        } else mkdirSync(join(journal.files.root, '.git'))
        expect(() => journal.snapshot()).toThrow(
          kind === 'repository' ? 'outside git repositories' : 'aliased-journal-path',
        )
      }),
  )
  it('never reuses a caller-mutated observation or conceals later journal damage', () =>
    fixture(({ plan, planning }) => {
      const prepared = planning.preparePlan(plan),
        lifecycle = new DeliveryLifecycle(planning.sources.files.root, () => at),
        issued = lifecycle.authority.authorize(authorization(plan, prepared.digest)),
        original = lifecycle.track({ run: plan.run, revision: 1, grant: issued.grant.id }),
        journal = lifecycle.journal,
        observed = journal.snapshot(),
        state = observed.states.get(plan.run)
      expect(state).toEqual(original)
      if (!state) throw new Error('Original journal observation required')
      state.state = 'completed'
      observed.events.length = 0
      observed.states.clear()
      expect(journal.get(plan.run)).toEqual(original)
      lifecycle.transition(plan.run, {
        to: 'queued',
        reason: 'Observe a later authorized transition.',
      })
      expect(journal.snapshot().states.get(plan.run)?.state).toBe('queued')
      const directory = journal.files.path('delivery/journal'),
        segment = journalLayout(readdirSync(directory))[0]?.name
      if (!segment) throw new Error('Original immutable segment required')
      writeFileSync(join(directory, segment), '{}\n')
      for (const read of [
        () => journal.snapshot(),
        () => journal.events(),
        () => journal.list(),
        () => journal.get(plan.run),
      ])
        expect(read).toThrow()
    }))
  it('tracks plans and grant observations idempotently without changing authority or legacy events', () =>
    fixture(({ plan, planning, state }) => {
      const prepared = planning.preparePlan(plan)
      const lifecycle = new DeliveryLifecycle(planning.sources.files.root, () => at)
      const issued = lifecycle.authority.authorize(authorization(plan, prepared.digest))
      const tracked = lifecycle.track({ run: plan.run, revision: 1, grant: issued.grant.id })
      expect(tracked.state).toBe('planned')
      expect(tracked.grant?.digest).toBe(issued.digest)
      expect(lifecycle.track({ run: plan.run, revision: 1, grant: issued.grant.id })).toEqual(
        tracked,
      )
      expect(lifecycle.journal.events()).toHaveLength(2)
      expect(lifecycle.journal.cacheStatus(tracked)).toBe('current')
      expect(state.events()).toEqual([])
      expect(lifecycle.authority.inspect(issued.grant.id).grant).toEqual(issued.grant)
    }))

  it('supports an initial envelope before detailed planning and preserves its history', () =>
    fixture(({ plan, planning }) => {
      const initial = planning.prepareEnvelope(envelope(plan))
      const lifecycle = new DeliveryLifecycle(planning.sources.files.root, () => at)
      expect(lifecycle.track({ run: plan.run, envelope: initial.digest }).basis.kind).toBe(
        'envelope',
      )
      plan.envelope = initial.digest
      const prepared = planning.preparePlan(plan)
      const state = lifecycle.track({ run: plan.run, revision: 1 })
      expect(state.envelope).toBe(initial.digest)
      expect(state.basis.digest).toBe(prepared.digest)
      expect(state.plans).toEqual([{ revision: 1, digest: prepared.digest }])
      expect(lifecycle.journal.events()).toHaveLength(2)
    }))

  it('does not persist a partially accepted transaction', () =>
    fixture(({ plan, planning }) => {
      planning.preparePlan(plan)
      const lifecycle = new DeliveryLifecycle(planning.sources.files.root, () => at)
      lifecycle.track({ run: plan.run, revision: 1 })
      const before = lifecycle.journal.events()
      expect(() =>
        lifecycle.journal.transaction(controller, (_view, append) => {
          append(plan.run, {
            ...control('planned', 'waiting-input'),
            basis:
              before[0]?.payload.schema === 'wholeloop/delivery-registration-event@1'
                ? before[0].payload.basis.digest
                : '',
          })
          append(plan.run, control('planned', 'running'))
        }),
      ).toThrow()
      expect(lifecycle.journal.events()).toEqual(before)
      expect(readdirSync(lifecycle.journal.files.path('delivery/journal'))).toHaveLength(1)
    }))

  it('repairs missing/corrupt projections without restoring deleted authority artifacts', () =>
    fixture(({ plan, planning }) => {
      const prepared = planning.preparePlan(plan)
      const lifecycle = new DeliveryLifecycle(planning.sources.files.root, () => at)
      const issued = lifecycle.authority.authorize(authorization(plan, prepared.digest))
      const state = lifecycle.track({ run: plan.run, revision: 1, grant: issued.grant.id })
      const path = lifecycle.journal.files.path(`delivery/state/${plan.run}.json`)
      writeFileSync(path, JSON.stringify({ ...state, state: 'completed', outcome: 'merged' }))
      expect(lifecycle.journal.get(plan.run).state).toBe('planned')
      expect(lifecycle.journal.cacheStatus(state)).toBe('stale')
      rmSync(lifecycle.journal.files.path(`delivery/authority/grants/${issued.grant.id}.json`))
      expect(lifecycle.journal.rebuild()).toEqual({ runs: 1, written: 1 })
      expect(lifecycle.journal.rebuild()).toEqual({ runs: 1, written: 0 })
      expect(lifecycle.journal.cacheStatus(state)).toBe('current')
      expect(() => lifecycle.authority.inspect(issued.grant.id)).toThrow(
        'missing-or-damaged-authority',
      )
      rmSync(path)
      expect(lifecycle.journal.get(plan.run)).toEqual(state)
      expect(lifecycle.journal.rebuild().written).toBe(1)
    }))

  it('preserves incomplete or unknown journal bytes and refuses subsequent writes', () =>
    fixture(({ plan, planning }) => {
      planning.preparePlan(plan)
      const lifecycle = new DeliveryLifecycle(planning.sources.files.root, () => at)
      lifecycle.track({ run: plan.run, revision: 1 })
      const name = entry(readdirSync(lifecycle.journal.files.path('delivery/journal')), 0)
      const path = lifecycle.journal.files.path(`delivery/journal/${name}`)
      const raw = readFileSync(path, 'utf8').trimEnd()
      writeFileSync(path, raw)
      expect(() => lifecycle.journal.rebuild()).toThrow('incomplete-journal-segment')
      expect(() => lifecycle.track({ run: plan.run, revision: 1 })).toThrow(
        'incomplete-journal-segment',
      )
      expect(readFileSync(path, 'utf8')).toBe(raw)
      const changed = { ...JSON.parse(raw), schema: 'wholeloop/delivery-event@2' }
      writeFileSync(path, `${JSON.stringify(changed)}\n`)
      expect(() => lifecycle.journal.events()).toThrow('unsupported-event-version')
    }))

  it('replays synthetic historical human decisions and PR receipts byte-for-byte', () =>
    fixture(({ plan, planning, state, root }) => {
      const item = state.create({
        kind: 'slice',
        title: 'Historical fixture',
        body: 'Synthetic historical data.',
        owner: 'Fixture Human',
      })
      state.transaction((events, append) => {
        append(item.id, {
          type: 'pr.planned',
          data: {
            plan: {
              root,
              repository: 'https://github.com/example/tasks',
              remote: 'origin',
              branch: 'wl/legacy',
              base: 'main',
              head: entry(plan.repositories, 0).base,
              snapshot: 'a'.repeat(64),
              title: 'feat: retain a historical fixture',
              body: 'Synthetic PR receipt.',
              provider: 'github',
              convention: { ref: 'fixture', origin: 'fixture', digest: 'b'.repeat(64) },
              gated: false,
            },
          },
        })
        const basis = events.at(-1)?.id ?? ''
        append(item.id, {
          type: 'pr.tested',
          data: {
            plan: basis,
            by: 'Fixture Human',
            note: 'Synthetic prior human testing.',
            snapshot: 'a'.repeat(64),
          },
        })
        append(item.id, {
          type: 'decision.recorded',
          data: { decision: 'test-it', outcome: 'approved', by: 'Fixture Human', basis },
        })
        append(item.id, { type: 'pr.requested', data: { plan: basis } })
        append(item.id, {
          type: 'pr.published',
          data: {
            plan: basis,
            pr: {
              url: 'https://github.com/example/tasks/pull/1',
              repository: 'https://github.com/example/tasks',
              head: 'wl/legacy',
              base: 'main',
              sha: entry(plan.repositories, 0).base,
              draft: true,
              merged: false,
              state: 'open',
            },
          },
        })
      })
      const before = state.events(),
        receipts = pullRequestPlans(before)
      const legacy = readdirSync(state.files.path('journal')).map((name) => ({
        name,
        body: readFileSync(state.files.path(`journal/${name}`), 'utf8'),
      }))
      planning.preparePlan(plan)
      const lifecycle = new DeliveryLifecycle(planning.sources.files.root, () => at)
      lifecycle.track({ run: plan.run, revision: 1 })
      lifecycle.journal.rebuild()
      expect(state.events()).toEqual(before)
      expect(pullRequestPlans(state.events())).toEqual(receipts)
      for (const file of legacy)
        expect(readFileSync(state.files.path(`journal/${file.name}`), 'utf8')).toBe(file.body)
    }))

  it('preserves recognizable future projection and facet versions on rebuild and append', () =>
    fixture(({ plan, planning }) => {
      planning.preparePlan(plan)
      const lifecycle = new DeliveryLifecycle(planning.sources.files.root, () => at)
      const state = lifecycle.track({ run: plan.run, revision: 1 })
      const path = lifecycle.journal.files.path(`delivery/state/${plan.run}.json`)
      for (const future of [
        { ...state, schema: 'wholeloop/delivery-state@2' },
        { ...state, facets: [{ schema: 'wholeloop/delivery-attempts@2', records: [] }] },
      ]) {
        const bytes = JSON.stringify(future)
        writeFileSync(path, bytes)
        expect(() => lifecycle.journal.rebuild()).toThrow(/unsupported-/)
        expect(() =>
          lifecycle.transition(plan.run, { to: 'paused', reason: 'Fixture pause.' }),
        ).toThrow(/unsupported-/)
        expect(readFileSync(path, 'utf8')).toBe(bytes)
        expect(lifecycle.journal.events()).toHaveLength(1)
      }
    }))

  it('refuses a cache alias into private authority before committing a transition', () =>
    fixture(({ plan, planning }) => {
      const prepared = planning.preparePlan(plan)
      const lifecycle = new DeliveryLifecycle(planning.sources.files.root, () => at)
      const grant = lifecycle.authority.authorize(authorization(plan, prepared.digest))
      lifecycle.track({ run: plan.run, revision: 1, grant: grant.grant.id })
      const target = lifecycle.journal.files.path(
        `delivery/authority/grants/${grant.grant.id}.json`,
      )
      const bytes = readFileSync(target, 'utf8')
      const cache = lifecycle.journal.files.path(`delivery/state/${plan.run}.json`)
      rmSync(cache)
      symlinkSync(target, cache)
      expect(() =>
        lifecycle.transition(plan.run, { to: 'queued', reason: 'Fixture queue.' }),
      ).toThrow(/aliased-journal-path/)
      expect(() => lifecycle.journal.rebuild()).toThrow(/aliased-journal-path/)
      expect(readFileSync(target, 'utf8')).toBe(bytes)
      expect(lifecycle.journal.get(plan.run).state).toBe('planned')
    }))

  it.each(['before', 'after'] as const)(
    'recovers an actual killed process %s the atomic journal commit',
    (phase) =>
      fixture(({ plan, planning, dir }) => {
        planning.preparePlan(plan)
        const script = join(dir, 'crash.mjs')
        buildSync({
          stdin: {
            contents: `import { DeliveryLifecycle } from './src/delivery/lifecycle.ts'; const [store,run,phase]=process.argv.slice(2); const lifecycle=new DeliveryLifecycle(store,()=>${JSON.stringify(at)}); const atomic=lifecycle.journal.files.atomic.bind(lifecycle.journal.files); lifecycle.journal.files.atomic=(path,body)=>{if(phase==='before'&&path.startsWith('delivery/journal/'))process.kill(process.pid,'SIGKILL');atomic(path,body);if(phase==='after'&&path.startsWith('delivery/journal/'))process.kill(process.pid,'SIGKILL')};lifecycle.track({run,revision:1});`,
            resolveDir: resolve('.'),
            sourcefile: 'delivery-crash-fixture.ts',
          },
          outfile: script,
          bundle: true,
          platform: 'node',
          format: 'esm',
          target: 'node20',
          banner: {
            js: "import {createRequire} from 'node:module';const require=createRequire(import.meta.url)",
          },
          define: {
            __WL_VERSION__: JSON.stringify('0.0.0'),
            __WL_HARNESS__: JSON.stringify(harnessAssets(resolve('.'))),
          },
        })
        const killed = spawnSync(
          process.execPath,
          [script, planning.sources.files.root, plan.run, phase],
          { encoding: 'utf8' },
        )
        expect(killed.signal, killed.stderr).toBe('SIGKILL')
        const journal = new DeliveryJournal(planning.sources.files.root, () => at)
        const owner = JSON.parse(readFileSync(journal.files.path('.lock/owner.json'), 'utf8'))
        expect(owner.pid).toBe(killed.pid)
        // This fixture owns the observed stopped child. Production stale-lock recovery remains explicit.
        rmSync(journal.files.path('.lock'), { recursive: true })
        expect(journal.events()).toHaveLength(phase === 'before' ? 0 : 1)
        if (phase === 'after') {
          expect(journal.get(plan.run).state).toBe('planned')
          expect(journal.cacheStatus(journal.get(plan.run))).toBe('missing')
          expect(journal.rebuild()).toEqual({ runs: 1, written: 1 })
        } else expect(journal.rebuild()).toEqual({ runs: 0, written: 0 })
        expect(existsSync(journal.files.path('delivery/authority/grants'))).toBe(false)
      }),
  )
})
