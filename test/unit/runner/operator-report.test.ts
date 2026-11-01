import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DeliveryLifecycle } from '../../../src/delivery/lifecycle.js'
import {
  deliveryDiagnostics,
  deliveryReport,
  exportRecoveryBundle,
  importRecoveryBundle,
  outcomeCategory,
} from '../../../src/runner/operator-report.js'
import { authorization, fixture, git } from '../../support/delivery.js'

const canary = 'SECRET-CANARY-7f3e9a'
async function setup(
  run: (input: {
    store: string
    runId: string
    root: string
    dir: string
    lifecycle: DeliveryLifecycle
  }) => Promise<void> | void,
) {
  await fixture(async ({ planning, plan, root, dir }) => {
    plan.policy.intervention = 'none'
    const prepared = planning.preparePlan(plan),
      lifecycle = new DeliveryLifecycle(planning.sources.files.root),
      grant = lifecycle.authority.authorize(authorization(plan, prepared.digest))
    lifecycle.track({ run: plan.run, revision: 1, grant: grant.grant.id })
    lifecycle.transition(plan.run, { to: 'queued', reason: 'Queue the fixture run.' })
    lifecycle.transition(plan.run, {
      to: 'paused',
      reason: `Operator paused after reading token ${canary} from a provider response.`,
    })
    await run({ store: planning.sources.files.root, runId: plan.run, root, dir, lifecycle })
  })
}

describe('operator report (read-only)', () => {
  it('explains state, category, waits and exact next actions without changing the journal', () =>
    setup(({ store, runId, lifecycle }) => {
      const before = JSON.stringify(lifecycle.journal.events()),
        report = deliveryReport(store, runId)
      expect(report).toMatchObject({
        schema: 'wholeloop/delivery-report@1',
        state: 'paused',
        outcome: null,
        category: 'in-progress',
        endpoint: 'local-handoff',
        intervention: 'none',
        waits: { human: 0, external: 0 },
        unresolved: false,
        next: [
          `wl delivery resume --run ${runId} --operator <name>`,
          `wl delivery stop --run ${runId} --operator <name>`,
        ],
      })
      expect(JSON.stringify(lifecycle.journal.events())).toBe(before)
      lifecycle.transition(runId, {
        to: 'blocked',
        outcome: 'blocked',
        reason: 'Terminal fixture.',
      })
      expect(deliveryReport(store, runId)).toMatchObject({ category: 'blocked', next: [] })
    }))
  it('exports diagnostics with categories and digests but no reasons, source or secrets', () =>
    setup(({ store, runId }) => {
      const text = JSON.stringify(deliveryDiagnostics(store, runId))
      expect(text).not.toContain(canary)
      expect(text).not.toContain('Find tasks by title')
      expect(text).not.toContain('Fixture Owner')
      expect(JSON.parse(text)).toMatchObject({
        schema: 'wholeloop/delivery-diagnostics@1',
        state: 'paused',
        events: expect.arrayContaining([
          expect.objectContaining({ kind: 'control-event', to: 'paused' }),
        ]),
      })
    }))
})

describe('outcome categories', () => {
  it.each([
    ['research-report-complete', 'report'],
    ['completed-with-unknowns', 'report'],
    ['code-ready', 'code'],
    ['draft-pr', 'pr'],
    ['ready-pr', 'pr'],
    ['merge-queued', 'queue'],
    ['merged', 'merge'],
    ['partial', 'partial'],
    ['blocked', 'blocked'],
    ['failed', 'failed'],
    ['exhausted', 'exhausted'],
    ['stopped', 'stopped'],
    [undefined, 'in-progress'],
  ] as const)('maps %s to %s', (outcome, category) => {
    expect(outcomeCategory(outcome)).toBe(category)
  })
})

describe('recovery bundles', () => {
  it('imports a verified bundle as an inert archive with explicit rebinding', () =>
    setup(({ store, runId, root, dir }) => {
      const bundle = join(dir, 'bundle'),
        exported = exportRecoveryBundle(store, runId, bundle)
      expect(exported.files).toBeGreaterThan(1)
      expect(() => exportRecoveryBundle(store, runId, bundle)).toThrow('recovery-bundle-exists')
      const target = join(dir, 'other-host')
      mkdirSync(target)
      expect(() => importRecoveryBundle(bundle, target, {})).toThrow('rebinding-required')
      expect(() => importRecoveryBundle(bundle, target, { app: root, web: root })).toThrow(
        'rebinding-unknown',
      )
      const unrelated = join(dir, 'unrelated')
      mkdirSync(unrelated)
      git(unrelated, ['init', '-b', 'main'])
      expect(() => importRecoveryBundle(bundle, target, { app: unrelated })).toThrow(
        'rebinding-base',
      )
      const record = importRecoveryBundle(bundle, target, { app: root })
      expect(record).toMatchObject({
        schema: 'wholeloop/delivery-recovery-import@1',
        run: runId,
        bindings: [{ repository: 'app', path: resolve(root) }],
        authority: 'not-restored',
        claims: 'not-restored',
      })
      // Nothing becomes live on the other host: no journal, claim or grant.
      expect(existsSync(join(target, 'delivery/journal'))).toBe(false)
      expect(existsSync(join(target, 'delivery/authority'))).toBe(false)
      expect(() => new DeliveryLifecycle(target).journal.get(runId)).toThrow()
      expect(() => importRecoveryBundle(bundle, target, { app: root })).toThrow('already-imported')
    }))
  it.each(['tampered', 'unlisted'] as const)('refuses a %s bundle before writing', (mode) =>
    setup(({ store, runId, root, dir }) => {
      const bundle = join(dir, 'bundle')
      exportRecoveryBundle(store, runId, bundle)
      const manifest = JSON.parse(readFileSync(join(bundle, 'manifest.json'), 'utf8')) as {
        files: { path: string }[]
      }
      if (mode === 'tampered')
        appendFileSync(join(bundle, 'files', manifest.files[0]?.path ?? ''), 'x')
      else writeFileSync(join(bundle, 'files', 'extra.json'), '{}')
      const target = join(dir, 'other-host')
      mkdirSync(target)
      expect(() => importRecoveryBundle(bundle, target, { app: root })).toThrow(
        mode === 'tampered' ? 'tampered' : 'unlisted-file',
      )
      expect(existsSync(join(target, 'delivery'))).toBe(false)
    }),
  )
  it('requires the explicit private flag in the compiled CLI', () =>
    setup(({ store, runId, dir }) => {
      const cli = resolve('dist/wl.mjs'),
        invoke = (args: string[]) =>
          spawnSync(process.execPath, [cli, ...args, '--store', store, '--json'], {
            cwd: dir,
            encoding: 'utf8',
          })
      const refused = invoke(['delivery', 'recovery-export', '--run', runId, '--out', 'bundle'])
      expect(refused.status).not.toBe(0)
      expect(existsSync(join(dir, 'bundle'))).toBe(false)
      const exported = invoke([
        'delivery',
        'recovery-export',
        '--run',
        runId,
        '--out',
        'bundle',
        '--include-private',
      ])
      expect(exported.status, exported.stderr).toBe(0)
      expect(JSON.parse(exported.stdout)).toMatchObject({
        schema: 'wholeloop/delivery-recovery-export@1',
        private: true,
        authority: 'not-restored',
      })
      const report = invoke(['delivery', 'report', '--run', runId])
      expect(report.status, report.stderr).toBe(0)
      expect(JSON.parse(report.stdout)).toMatchObject({ schema: 'wholeloop/delivery-report@1' })
      const diagnostics = invoke(['delivery', 'diagnostics', '--run', runId])
      expect(diagnostics.stdout).not.toContain(canary)
    }))
})
