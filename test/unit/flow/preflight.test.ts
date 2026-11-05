import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { CliError } from '../../../src/cli/errors.js'
import { FlowEngine } from '../../../src/flow/engine.js'
import { STEPS } from '../../../src/flow/registry.js'
import { event, type StateEvent } from '../../../src/state/events.js'
import { StateStore } from '../../../src/state/store.js'

function fixture(run: (engine: FlowEngine) => void) {
  const root = mkdtempSync(join(tmpdir(), 'wholeloop-preflight-'))
  try {
    mkdirSync(join(root, 'repo'))
    mkdirSync(join(root, 'home'))
    run(
      new FlowEngine(
        new StateStore(join(root, 'state')),
        join(root, 'repo'),
        join(root, 'user.yml'),
        join(root, 'home'),
      ),
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('read-only step admission before the first required mutation', () => {
  it.each(STEPS.map((step) => step.name))(
    '%s returns missing-input questions without creating state or locking',
    (name) =>
      fixture((engine) => {
        const locked = vi.spyOn(engine.store.files, 'locked'),
          transaction = vi.spyOn(engine.store, 'transaction')
        let code: number
        try {
          code = engine.begin(name, {}).code
        } catch (error) {
          if (!(error instanceof CliError)) throw error
          code = error.code
        }
        expect(code).toBe(2)
        expect(locked).not.toHaveBeenCalled()
        expect(transaction).not.toHaveBeenCalled()
        expect(existsSync(engine.store.files.root)).toBe(false)
      }),
  )

  it('returns an existing active step without opening another writer transaction', () =>
    fixture((engine) => {
      const first = engine.begin('frame-problem', {
          input: 'Fixture idea',
          owner: 'Fixture Owner',
        }),
        events = engine.store.events()
      const transaction = vi.spyOn(engine.store, 'transaction'),
        locked = vi.spyOn(engine.store.files, 'locked')
      const repeat = engine.begin('frame-problem', { subject: first.payload.subject?.id ?? '' })
      expect(repeat.payload.run).toBe(first.payload.run)
      expect(repeat.code).toBe(0)
      expect(transaction).not.toHaveBeenCalled()
      expect(locked).not.toHaveBeenCalled()
      expect(engine.store.events()).toEqual(events)
    }))

  it('rechecks fresh state under the real lock before the first admitted write', () =>
    fixture((engine) => {
      const item = engine.store.create({
          kind: 'initiative',
          title: 'Fixture idea',
          owner: 'Fixture Owner',
          body: '',
        }),
        transaction = engine.store.transaction.bind(engine.store)
      vi.spyOn(engine.store, 'transaction').mockImplementationOnce((operation) => {
        transaction((_events, append) =>
          append(item.id, { type: 'item.updated', data: { status: 'closed' } }),
        )
        return transaction(operation)
      })
      expect(() => engine.begin('frame-problem', { subject: item.id })).toThrow('is closed')
      expect(engine.store.get(item.id).status).toBe('closed')
      expect(engine.store.events().some((entry) => entry.type === 'step.started')).toBe(false)
    }))

  it('keeps active-step history lookup linear as completed runs grow', () => {
    const counts: number[] = []
    for (const count of [100, 400])
      fixture((engine) => {
        const id = 'init-12345678',
          ts = '2026-11-01T00:00:00.000Z',
          events: StateEvent[] = [
            event(
              id,
              {
                type: 'item.created',
                data: {
                  kind: 'initiative',
                  title: 'Fixture idea',
                  owner: 'Fixture Owner',
                  body: '',
                },
              },
              ts,
            ),
          ]
        for (let i = 0; i < count; i++) {
          const run = `run-${i.toString(16).padStart(16, '0')}`
          events.push(
            event(
              id,
              {
                type: 'step.started',
                data: { step: 'write-spec', run, mode: 'standalone', input: 'Fixture idea' },
              },
              ts,
            ),
          )
          events.push(
            event(
              id,
              {
                type: 'step.completed',
                data: {
                  step: 'write-spec',
                  run,
                  artifact: {
                    path: `items/${id}/artifacts/write-spec/${run}.md`,
                    content: 'Fixture specification',
                  },
                },
              },
              ts,
            ),
          )
        }
        let reads = 0
        const observed = events.map(
          (entry) =>
            new Proxy(entry, {
              get(target, key, receiver) {
                if (['type', 'subject', 'data'].includes(String(key))) reads++
                return Reflect.get(target, key, receiver)
              },
            }),
        )
        vi.spyOn(engine.store, 'events').mockImplementation(() => observed)
        expect(engine.begin('write-spec', { subject: id }).code).toBe(2)
        counts.push(reads)
      })
    expect(counts[1]).toBeLessThan((counts[0] ?? 0) * 5)
  })
})
