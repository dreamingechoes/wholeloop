import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bundledCanonical } from '../../../src/adapters/canonical.js'
import { ADAPTERS, generateAdapter } from '../../../src/adapters/generate.js'
import { writeAdapter } from '../../../src/adapters/write.js'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { FlowEngine } from '../../../src/flow/engine.js'
import { retainedDecisionRationale } from '../../../src/runner/attribution.js'
import { RunnerHumanDecisions } from '../../../src/runner/human-decisions.js'
import { deliveryDiagnostics, deliveryReport } from '../../../src/runner/operator-report.js'
import {
  withClientAttribution,
  withPersonAttribution,
} from '../../../src/state/attribution-context.js'
import { event } from '../../../src/state/events.js'
import { StateStore } from '../../../src/state/store.js'
import { runnerPlanFixture } from '../../support/runner-plan.js'

const core = resolve('dist/wl.mjs'),
  reason = 'PRIVATE_PRODUCER_REASON\nKeep the bounded original scope.',
  actor = { kind: 'person' as const, name: 'Owner', channel: 'terminal' },
  note = { type: 'note.added' as const, data: { text: 'A note' } },
  at = '2026-11-04T12:00:00.000Z'

async function temporary(run: (root: string) => void | Promise<void>) {
  const root = mkdtempSync(join(tmpdir(), 'wholeloop-attribution-producer-'))
  try {
    await run(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}
function invoke(root: string, args: string[], input?: string, executable = core) {
  return spawnSync(process.execPath, [executable, ...args, '--json'], {
    cwd: root,
    encoding: 'utf8',
    ...(input !== undefined ? { input } : {}),
    env: {
      ...process.env,
      XDG_STATE_HOME: join(root, 'state'),
      XDG_CONFIG_HOME: join(root, 'config'),
      WL_WORKSPACE: '',
    },
  })
}

describe('attribution producers', () => {
  it.each([
    {
      run: 'original',
      plan: 'basis',
      decision: 'delivery-plan',
      rationale: reason,
      expected: reason,
    },
    {
      run: 'other',
      plan: 'basis',
      decision: 'delivery-plan',
      rationale: reason,
      expected: undefined,
    },
    {
      run: 'original',
      plan: 'changed',
      decision: 'delivery-plan',
      rationale: reason,
      expected: undefined,
    },
    {
      run: 'original',
      plan: 'basis',
      decision: 'acceptance',
      rationale: reason,
      expected: undefined,
    },
    {
      run: 'original',
      plan: 'basis',
      decision: 'delivery-plan',
      rationale: 'é'.repeat(2049),
      expected: undefined,
    },
    {
      run: 'original',
      plan: 'basis',
      decision: 'delivery-plan',
      rationale: '',
      expected: undefined,
    },
  ])(
    'surfaces only an exact original delegated reason %#',
    ({ run, plan, decision, rationale, expected }) => {
      expect(
        retainedDecisionRationale(
          [{ request: { run, plan, decision }, judgment: { rationale } }],
          'original',
          'basis',
          ['delivery-plan'],
        ),
      ).toBe(expected)
    },
  )
  it.each(ADAPTERS.map((entry) => entry.id))(
    'records the %s packaged declaration without guessing version or model',
    async (id) => {
      await temporary((root) => {
        const output = join(root, id)
        writeAdapter(
          output,
          generateAdapter(id, bundledCanonical(), readFileSync(core, 'utf8'), '0.0.0'),
        )
        const executable = join(output, 'bin/wl.mjs'),
          created = invoke(
            root,
            ['state', 'create', 'initiative', '--title', 'Declared', '--owner', 'Owner'],
            undefined,
            executable,
          )
        expect(created.stderr).toBe('')
        expect(created.status).toBe(0)
        const store = new StateStore(join(root, 'state/wholeloop'))
        expect(store.events()[0]?.actor).toEqual({
          kind: 'agent',
          name: id,
          client: { client: id, source: 'declared' },
        })
        const denied = invoke(
          root,
          [
            'answer',
            'decision.approve-spec=approved',
            '--by',
            'Owner',
            '--channel',
            'terminal',
            '--rationale-file',
            'PRIVATE_MISSING_PATH',
          ],
          undefined,
          executable,
        )
        expect(denied.status).not.toBe(0)
        expect(denied.stdout).toContain('cannot supply person attribution')
        expect(denied.stdout).not.toContain('PRIVATE_MISSING_PATH')
        expect(store.events()).toHaveLength(1)
      })
    },
  )

  it('isolates concurrent scopes and refuses explicit person spoofing before append', async () => {
    const results = await Promise.all(
      ['claude', 'codex'].map((client) =>
        withClientAttribution({ client, source: 'declared' }, async () => {
          await Promise.resolve()
          expect(() =>
            withPersonAttribution({ actor, rationale: reason }, () => undefined),
          ).toThrow('cannot supply person')
          expect(() => event('init-1234abcd', note, at, { actor })).toThrow('cannot replace')
          return event('init-1234abcd', note, at).actor
        }),
      ),
    )
    expect(results.map((entry) => entry.name)).toEqual(['claude', 'codex'])
    expect(event('init-1234abcd', note, at).actor).toEqual({ kind: 'person', name: 'local' })
  })

  it.each(['stdin', 'file'])(
    'records a person decision through %s without exposing its private rationale',
    async (source) => {
      await temporary((root) => {
        const store = new StateStore(join(root, 'state/wholeloop')),
          item = store.create({ kind: 'initiative', title: 'A decision', owner: 'Owner', body: '' })
        new FlowEngine(store, root, join(root, 'config/user.yml'), root).skip(
          'write-spec',
          item.id,
          'Adopt an existing specification',
        )
        writeFileSync(join(root, 'reason.txt'), reason)
        const result = invoke(
          root,
          [
            'answer',
            'decision.approve-spec=approved',
            '--for',
            item.id,
            '--by',
            'Owner',
            '--channel',
            'terminal',
            ...(source === 'stdin' ? ['--rationale-stdin'] : ['--rationale-file', 'reason.txt']),
          ],
          source === 'stdin' ? reason : undefined,
        )
        expect(result.stderr).toBe('')
        expect(result.status).toBe(0)
        expect(result.stdout).not.toContain('PRIVATE_PRODUCER_REASON')
        expect(store.events().at(-1)).toMatchObject({
          type: 'decision.recorded',
          actor,
          rationale: reason,
        })
        for (const args of [
          ['state', 'get', item.id],
          ['status', '--for', item.id],
          ['resume', '--for', item.id],
        ]) {
          const read = invoke(root, args)
          expect(read.status).toBe(0)
          expect(read.stdout).not.toContain('PRIVATE_PRODUCER_REASON')
        }
      })
    },
  )

  it('rejects conflicting, oversized, malformed, aliased and nondecision inputs without state writes', async () => {
    await temporary((root) => {
      const store = new StateStore(join(root, 'state/wholeloop')),
        item = store.create({ kind: 'initiative', title: 'A decision', owner: 'Owner', body: '' }),
        original = store.events()
      writeFileSync(join(root, 'large.txt'), 'é'.repeat(2049))
      writeFileSync(join(root, 'invalid.txt'), Buffer.from([0xff]))
      symlinkSync(join(root, 'large.txt'), join(root, 'alias.txt'))
      for (const options of [
        ['--rationale-stdin', '--rationale-file', 'PRIVATE_MISSING_PATH'],
        ['--channel', '../PRIVATE_INVALID_CHANNEL'],
        ['--rationale-file', 'large.txt'],
        ['--rationale-file', 'invalid.txt'],
        ['--rationale-file', 'alias.txt'],
        ['--rationale-stdin'],
        ['--rationale', 'PRIVATE_ARGV_CANARY'],
      ]) {
        const result = invoke(
          root,
          [
            'answer',
            'decision.approve-spec=approved',
            '--for',
            item.id,
            '--by',
            'Owner',
            ...options,
          ],
          '',
        )
        expect(result.status).not.toBe(0)
        expect(result.stdout).not.toMatch(/PRIVATE_|é/)
        expect(store.events()).toEqual(original)
      }
      expect(
        invoke(root, ['answer', 'owner=PRIVATE_SLOT', '--channel', 'terminal']).status,
      ).not.toBe(0)
      expect(store.events()).toEqual(original)
    })
  })

  it('keeps reasons off incidental events in a decision transaction', async () => {
    await temporary((root) => {
      const store = new StateStore(join(root, 'store'))
      withPersonAttribution({ actor, rationale: reason }, () => {
        const item = store.create({
          kind: 'initiative',
          title: 'A decision',
          owner: 'Owner',
          body: '',
        })
        store.transaction((events, append) =>
          append(item.id, {
            type: 'decision.recorded',
            data: { decision: 'go', outcome: 'approved', by: 'Owner', basis: events[0]?.id ?? '' },
          }),
        )
      })
      expect(store.events()[0]).not.toHaveProperty('rationale')
      expect(store.events()[1]).toMatchObject({ actor, rationale: reason })
    })
  })

  it('journals an immutable human decision description idempotently without changing approval meaning', async () => {
    await runnerPlanFixture(
      async (f) => {
        const humans = new RunnerHumanDecisions(f.store),
          record = f.store.stage(contractDigest(f.context.request), 'plan')
        if (!record) throw new Error('Original stage required')
        const pending = humans.open(f.context.request, record, 'a'.repeat(64)),
          input = {
            request: pending.request,
            stage: 'plan',
            decision: pending.decision,
            subject: pending.subject,
            outcome: 'accept' as const,
            by: 'Owner',
          },
          before = f.store.lifecycle.journal.get(f.context.request.run)
        const result = withPersonAttribution({ actor, rationale: reason }, () =>
          humans.record(input),
        )
        expect(result).not.toHaveProperty('rationale')
        const first = f.store.lifecycle.journal.events()
        expect(first.at(-1)).toMatchObject({
          actor: { kind: 'operator', name: 'Owner', channel: 'terminal' },
          payload: { schema: 'wholeloop/delivery-person-attribution@1', rationale: reason },
        })
        expect(
          withPersonAttribution({ actor, rationale: reason }, () => humans.record(input)),
        ).toEqual(result)
        expect(f.store.lifecycle.journal.events()).toEqual(first)
        expect(() =>
          withPersonAttribution({ actor, rationale: 'Different private reason' }, () =>
            humans.record(input),
          ),
        ).toThrow('human-attribution-already-recorded')
        const after = f.store.lifecycle.journal.get(f.context.request.run)
        expect(after.state).toBe(before.state)
        expect(after.facets).toEqual(before.facets)
        expect(
          JSON.stringify(deliveryDiagnostics(f.store.files.root, f.context.request.run)),
        ).not.toContain('PRIVATE_PRODUCER_REASON')
        expect(
          JSON.stringify(deliveryReport(f.store.files.root, f.context.request.run)),
        ).not.toContain('PRIVATE_PRODUCER_REASON')
      },
      { delegate: false },
    )
  })
})
