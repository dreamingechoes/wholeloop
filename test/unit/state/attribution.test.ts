import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { run as cli } from '../../../src/cli/main.js'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import {
  type DeliveryPayload,
  deliveryEvent,
  validateDeliveryEvent,
} from '../../../src/delivery/events.js'
import { DeliveryJournal } from '../../../src/delivery/journal.js'
import { replayDelivery } from '../../../src/delivery/reducer.js'
import { deliveryDiagnostics, deliveryReport } from '../../../src/runner/operator-report.js'
import { RATIONALE_BYTES, type StateActor } from '../../../src/state/attribution.js'
import {
  type EventData,
  event,
  replay,
  type StateEvent,
  validateEvent,
} from '../../../src/state/events.js'
import { projections } from '../../../src/state/projections.js'
import { contextPack } from '../../../src/state/resume.js'
import { StateStore } from '../../../src/state/store.js'

const subject = 'init-1234abcd',
  at = '2026-11-04T12:00:00.000Z',
  privateReason = 'PRIVATE_RATIONALE_CANARY',
  client = {
    client: 'codex',
    version: '0.166.0',
    model: 'reference-model',
    source: 'declared' as const,
  },
  person = { kind: 'person', name: 'Owner', channel: 'terminal' } as const,
  creation = () =>
    event(
      subject,
      {
        type: 'item.created',
        data: { kind: 'initiative', title: 'A fixture', owner: 'Owner', body: '' },
      },
      at,
    ),
  decision = (basis: string) => ({
    type: 'decision.recorded' as const,
    data: { decision: 'go', outcome: 'approved' as const, by: 'Owner', basis },
  })

function temporary(operation: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'wholeloop-attribution-'))
  try {
    operation(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('optional state event attribution (ADR-0210)', () => {
  it('keeps legacy serialized events and their projections unchanged', () => {
    const legacy = JSON.parse(
        readFileSync('test/fixtures/state/attribution-legacy.json', 'utf8'),
      ) as StateEvent[],
      original = JSON.stringify(legacy),
      attributed = structuredClone(legacy)
    for (const entry of legacy) validateEvent(entry)
    for (const entry of attributed) {
      entry.actor = person
      if (entry.type === 'decision.recorded') entry.rationale = privateReason
    }
    expect(replay(attributed)).toEqual(replay(legacy))
    expect(projections(replay(attributed), attributed)).toEqual(projections(replay(legacy), legacy))
    expect(JSON.stringify(legacy)).toBe(original)
    expect(JSON.stringify(contextPack(attributed, subject))).not.toContain(privateReason)
    expect(JSON.stringify([...projections(replay(attributed), attributed)])).not.toContain(
      privateReason,
    )
  })

  it('retains explicit client provenance and leaves absent identity unknown', () => {
    const base = creation(),
      note = {
        type: 'note.added' as const,
        data: { text: 'Client text says codex and reference-model.' },
      }
    const unknown = event(subject, note, at)
    expect(unknown.actor).toEqual({ kind: 'person', name: 'local' })
    expect(unknown).not.toHaveProperty('rationale')
    for (const source of ['declared', 'host-observed'] as const) {
      const entry = event(subject, note, at, {
        actor: { kind: 'agent', name: 'Builder', client: { ...client, source } },
      })
      expect(entry.actor).toEqual({ kind: 'agent', name: 'Builder', client: { ...client, source } })
      expect(replay([base, entry]).get(subject)?.notes).toHaveLength(1)
    }
    expect(
      event(subject, note, at, { actor: { kind: 'agent', name: 'unknown' } }).actor,
    ).not.toHaveProperty('client')
  })

  it.each([
    { kind: 'person', name: 'Owner', client },
    { kind: 'system', name: 'system', channel: 'terminal' },
    { kind: 'agent', name: 'worker', client, channel: 'terminal' },
    { kind: 'agent', name: 'worker', client: { client: 'codex' } },
    { kind: 'agent', name: 'worker', client: { ...client, source: 'inferred' } },
    { kind: 'agent', name: 'worker', client: { ...client, source: ['declared'] } },
    { kind: 'agent', name: 'worker', client: { ...client, extra: 'unknown' } },
    { kind: 'agent', name: 'worker', client: { ...client, version: 'v'.repeat(129) } },
    { kind: 'agent', name: 'worker', client: { ...client, model: 'm'.repeat(257) } },
    { kind: 'agent', name: 'worker', client: { ...client, version: 'é'.repeat(65) } },
    { kind: 'agent', name: 'worker', client: { ...client, model: 'line\nbreak' } },
    { kind: 'person', name: 'Owner', channel: '../terminal' },
  ])('rejects malformed, inferred or cross-role actor metadata %#', (actor) => {
    expect(() => validateEvent({ ...creation(), actor })).toThrow('Invalid wholeloop/state-event@1')
  })

  it.each(['', 'x'.repeat(RATIONALE_BYTES + 1), 'é'.repeat(2049), '\ud800', 'a\0b'])(
    'refuses an invalid private reason without quoting it %#',
    (rationale) => {
      const base = creation()
      expect(() => event(subject, decision(base.id), at, { actor: person, rationale })).toThrow(
        'Invalid wholeloop/state-event@1',
      )
    },
  )

  it('enforces decision ownership and preserves bounded multiline reasons exactly', () => {
    const base = creation(),
      data = decision(base.id)
    for (const rationale of ['x'.repeat(RATIONALE_BYTES), 'First line.\nSecond line.\tEvidence.'])
      expect(event(subject, data, at, { actor: person, rationale }).rationale).toBe(rationale)
    for (const actor of [
      { kind: 'agent', name: 'worker', client },
      { kind: 'system', name: 'core' },
    ] as StateActor[])
      expect(() => event(subject, data, at, { actor, rationale: privateReason })).toThrow()
    expect(() =>
      event(subject, { type: 'note.added', data: { text: 'A note' } }, at, {
        actor: person,
        rationale: privateReason,
      }),
    ).toThrow('Invalid wholeloop/state-event@1')
  })

  it('refuses payload headers that impersonate a person over the supplied worker actor', () => {
    const base = creation(),
      injected = { ...decision(base.id), actor: person } as unknown as EventData
    expect(() =>
      event(subject, injected, at, {
        actor: { kind: 'agent', name: 'worker', client },
        rationale: privateReason,
      }),
    ).toThrow('Invalid event data; contents omitted')
  })

  it('journals metadata atomically, clones callers and rebuilds without disclosure', () =>
    temporary((root) => {
      const store = new StateStore(root),
        item = store.create({ kind: 'initiative', title: 'A fixture', owner: 'Owner', body: '' }),
        first = store.events()[0]
      expect(first).toBeDefined()
      const actor: StateActor = { ...person }
      store.transaction((_events, append) => {
        append(item.id, decision(first?.id ?? ''), { actor, rationale: privateReason })
        actor.name = 'Changed caller'
      })
      const before = store.events(),
        content = JSON.stringify(before)
      expect(before.at(-1)?.actor.name).toBe('Owner')
      expect(before.at(-1)?.rationale).toBe(privateReason)
      expect(JSON.stringify(store.get(item.id))).not.toContain(privateReason)
      store.rebuild()
      expect(JSON.stringify(store.events())).toBe(content)
      expect(() =>
        store.transaction((_events, append) => {
          append(item.id, { type: 'note.added', data: { text: 'This must roll back.' } })
          append(item.id, decision(first?.id ?? ''), {
            actor: { kind: 'agent', name: 'worker', client },
            rationale: privateReason,
          })
        }),
      ).toThrow()
      expect(store.events()).toEqual(before)
    }))
})

it('keeps private reasons out of compiled CLI reads and rejects argv reasons before mutation', () =>
  temporary((root) => {
    const store = new StateStore(join(root, 'wholeloop')),
      item = store.create({ kind: 'initiative', title: 'CLI fixture', owner: 'Owner', body: '' }),
      first = store.events()[0]
    store.transaction((_events, append) =>
      append(item.id, decision(first?.id ?? ''), { actor: person, rationale: privateReason }),
    )
    const before = store.events(),
      call = (args: string[]) =>
        spawnSync(process.execPath, [resolve('dist/wl.mjs'), ...args, '--json'], {
          cwd: root,
          encoding: 'utf8',
          timeout: 30000,
          env: { ...process.env, XDG_STATE_HOME: root, WL_WORKSPACE: '' },
        }),
      read = call(['state', 'get', item.id]),
      refused = call([
        'answer',
        'decision.go=approved',
        '--for',
        item.id,
        '--by',
        'Owner',
        '--rationale',
        privateReason,
      ])
    expect(read.status).toBe(0)
    expect(read.stdout).not.toContain(privateReason)
    // Unknown options use the existing shape exit code, not the input code.
    expect(refused.status).toBe(4)
    expect(`${refused.stdout}${refused.stderr}`).not.toContain(privateReason)
    expect(store.events()).toEqual(before)
    const schema = call(['delivery', 'state-schema'])
    expect(schema.status).toBe(0)
    expect(JSON.parse(schema.stdout).eventSchema.properties).toHaveProperty('rationale')
  }))

const deliveryRun = 'delivery-0123456789abcdef',
  controller = { kind: 'controller' as const, name: 'wholeloop' },
  registration: DeliveryPayload = {
    schema: 'wholeloop/delivery-registration-event@1',
    basis: { kind: 'plan', digest: 'a'.repeat(64), revision: 1 },
    source: 'b'.repeat(64),
    policy: { digest: 'c'.repeat(64), endpoint: 'local-handoff', intervention: 'supervised' },
    units: [{ id: 'status', role: 'implementation', repository: 'app' }],
  },
  pause: DeliveryPayload = {
    schema: 'wholeloop/delivery-control-event@1',
    basis: 'a'.repeat(64),
    from: 'planned',
    to: 'paused',
    reason: 'Explicit operator pause.',
  }

describe('delivery attribution and private read boundaries', () => {
  it('reopens pre-attribution delivery bytes without rewriting their digest chain', () =>
    temporary((root) => {
      const legacy = JSON.parse(
          readFileSync('test/fixtures/state/delivery-attribution-legacy.json', 'utf8'),
        ) as ReturnType<typeof deliveryEvent>[],
        journal = new DeliveryJournal(root, () => at),
        before = JSON.stringify(legacy)
      for (const entry of legacy) validateDeliveryEvent(entry)
      journal.files.atomic(
        'delivery/journal/0000000000000001.ndjson',
        `${legacy.map((entry) => JSON.stringify(entry)).join('\n')}\n`,
      )
      expect(journal.events()).toEqual(legacy)
      const projection = journal.get(deliveryRun)
      expect(projection.state).toBe('paused')
      expect(projection.digest).toBe(legacy.at(-1)?.digest)
      journal.rebuild()
      expect(journal.get(deliveryRun)).toEqual(projection)
      expect(JSON.stringify(journal.events())).toBe(before)
    }))

  it('binds channel and rationale into the digest without changing transition meaning', () => {
    const first = deliveryEvent(deliveryRun, controller, registration, undefined, at),
      legacy = deliveryEvent(deliveryRun, { kind: 'operator', name: 'Owner' }, pause, first, at),
      decorated = deliveryEvent(
        deliveryRun,
        { kind: 'operator', name: 'Owner', channel: 'terminal' },
        pause,
        first,
        at,
        { rationale: privateReason },
      )
    const current = replayDelivery([first, decorated]).get(deliveryRun),
      prior = replayDelivery([first, legacy]).get(deliveryRun)
    // Event hashes change with attribution; delivery meaning must not.
    expect({ ...current, digest: undefined }).toEqual({ ...prior, digest: undefined })
    expect(current?.digest).toBe(decorated.digest)
    expect(decorated.rationale).toBe(privateReason)
    expect(() => validateDeliveryEvent({ ...decorated, rationale: 'Changed bytes' })).toThrow(
      'event-digest',
    )
    expect(() =>
      validateDeliveryEvent({ ...decorated, actor: { ...decorated.actor, channel: 'native-cli' } }),
    ).toThrow('event-digest')
  })

  it('only accepts machine reasons on an actual delegated decision observation', () => {
    const payload: DeliveryPayload = {
      schema: 'wholeloop/delivery-runner-event@1',
      action: 'observed',
      basis: 'a'.repeat(64),
      request: 'b'.repeat(64),
      controller: `controller-${'c'.repeat(32)}`,
      generation: 1,
      stage: 'acceptance',
      invocation: 'd'.repeat(64),
      status: 'passed',
      evidence: 'e'.repeat(64),
      provenance: 'host-observed',
      reason: 'Existing decision summary.',
    }
    expect(
      deliveryEvent(deliveryRun, controller, payload, undefined, at, { rationale: privateReason })
        .rationale,
    ).toBe(privateReason)
    expect(() =>
      deliveryEvent(
        deliveryRun,
        controller,
        { ...payload, stage: 'implementation:status' },
        undefined,
        at,
        { rationale: privateReason },
      ),
    ).toThrow('invalid-attribution')
    expect(() =>
      deliveryEvent(
        deliveryRun,
        { ...controller, channel: 'terminal' } as typeof controller,
        payload,
        undefined,
        at,
      ),
    ).toThrow()
    expect(() =>
      deliveryEvent(deliveryRun, controller, registration, undefined, at, {
        rationale: privateReason,
      }),
    ).toThrow('invalid-attribution')
  })

  it('keeps reasons out of reports/diagnostics and refuses implicit private exports', () =>
    temporary((root) => {
      const journal = new DeliveryJournal(join(root, 'store'), () => at)
      journal.transaction(controller, (_view, append) => append(deliveryRun, registration))
      journal.transaction(
        { kind: 'operator', name: 'Owner', channel: 'terminal' },
        (_view, append) => append(deliveryRun, pause, { rationale: privateReason }),
      )
      const events = journal.events(),
        before = journal.get(deliveryRun)
      expect(events.at(-1)?.rationale).toBe(privateReason)
      journal.rebuild()
      expect(journal.events()).toEqual(events)
      expect(journal.get(deliveryRun)).toEqual(before)
      expect(JSON.stringify(deliveryDiagnostics(journal.files.root, deliveryRun))).not.toContain(
        privateReason,
      )
      expect(JSON.stringify(deliveryReport(journal.files.root, deliveryRun))).not.toContain(
        privateReason,
      )
      const output: string[] = [],
        out = join(root, 'export')
      expect(
        cli(
          [
            'delivery',
            'recovery-export',
            '--run',
            deliveryRun,
            '--out',
            out,
            '--store',
            journal.files.root,
            '--json',
          ],
          { out: (text) => output.push(text), err: (text) => output.push(text) },
          root,
        ),
      ).toBe(2)
      expect(output.join('')).not.toContain(privateReason)
      expect(existsSync(out)).toBe(false)
      const { digest, ...binding } = events.at(-1) ?? {}
      expect(contractDigest(binding)).toBe(digest)
    }))
})
