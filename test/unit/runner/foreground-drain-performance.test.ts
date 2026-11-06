import { readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { journalLayout } from '../../../src/delivery/journal-layout.js'
import * as segments from '../../../src/delivery/journal-segment.js'
import { ForegroundOwner } from '../../../src/runner/foreground-owner.js'
import { type RunnerRequest, RunnerStore } from '../../../src/runner/store.js'
import { authorization, fixture } from '../../support/delivery.js'

afterEach(() => vi.restoreAllMocks())
function setup(
  run: (store: RunnerStore, owner: ForegroundOwner, request: RunnerRequest) => void,
  foreignOwner = false,
) {
  return fixture(({ dir, planning, plan }) => {
    const store = new RunnerStore(planning.sources.files.root),
      preparedPlan = planning.preparePlan(plan),
      grant = store.lifecycle.authority.authorize(authorization(plan, preparedPlan.digest))
    store.lifecycle.track({ run: plan.run, revision: 1, grant: grant.grant.id })
    const request: RunnerRequest = {
      schema: 'wholeloop/delivery-runner-request@1',
      key: 'drain-counter',
      run: plan.run,
      revision: 1,
      plan: preparedPlan.digest,
      grant: grant.grant.id,
      host: { id: 'fixture', version: '1', configuration: 'a'.repeat(64) },
      pollMs: 50,
    }
    const prepared = store.prepare(request),
      core = join(dir, 'fixture-core.mjs')
    // Bind a local file without invoking a controller, worker or model.
    writeFileSync(core, 'export {}\n')
    const { owner } = ForegroundOwner.claim(store, prepared.digest, core)
    if (foreignOwner)
      store.append(owner.lease, {
        action: 'registered',
        invocation: 'f'.repeat(64),
        runtime: { backend: 'fixture', instance: 'foreign', worker: 'original' },
      })
    else owner.register(process.pid)
    run(store, owner, request)
  })
}

describe('fresh foreground pipe-drain policy observations', () => {
  it.each([1, 12])('reads each required input once across %i released-owner polls', (polls) =>
    setup((store, owner, request) => {
      store.release(owner.lease, 'Release the local fixture controller before pipe drain.')
      const names = journalLayout(readdirSync(store.files.path('delivery/journal')))
          .map((file) => file.name)
          .sort(),
        segmentsRead = vi.spyOn(segments, 'readJournalSegment'),
        requestsRead = vi.spyOn(store, 'get'),
        authoritiesRead = vi.spyOn(store.lifecycle.authority, 'inspect'),
        plansRead = vi.spyOn(store.planning, 'getPlan')
      for (let poll = 0; poll < polls; poll++) expect(owner.current(false, true)).toBe(true)
      const counts = {
        polls,
        segments: segmentsRead.mock.calls.length,
        requests: requestsRead.mock.calls.length,
        authorities: authoritiesRead.mock.calls.length,
        plans: plansRead.mock.calls.length,
      }
      console.info('Foreground released drain reads:', JSON.stringify(counts))
      expect(counts).toEqual({
        polls,
        segments: polls * names.length,
        requests: polls,
        authorities: polls,
        plans: polls,
      })
      expect(segmentsRead.mock.calls.map(([, , name]) => name).sort()).toEqual(
        Array.from({ length: polls }, () => names)
          .flat()
          .sort(),
      )
      expect(request.run).toBe(store.get(owner.lease.request).run)
    }),
  )
  it('allows the original active-to-released drain without reopening dispatch and sees revocation', () =>
    setup((store, owner, request) => {
      expect(owner.current(false, true)).toBe(true)
      store.release(owner.lease, 'Finish the fixture controller without issuing another stage.')
      expect(owner.current()).toBe(false)
      expect(owner.current(true, true)).toBe(false)
      expect(owner.current(false, true)).toBe(true)
      store.lifecycle.authority.revoke({
        schema: 'wholeloop/delivery-revocation-request@1',
        grant: request.grant,
        operator: 'Fixture Operator',
        reason: 'The next drain poll must refuse the revoked grant.',
      })
      expect(owner.current(false, true)).toBe(false)
    }))
  it('requires the exact released original invocation', () =>
    setup((store, owner) => {
      store.release(owner.lease, 'Release the deliberately different fixture invocation.')
      expect(owner.current(false, true)).toBe(false)
    }, true))
  it('refreshes released cancellation and request bytes on every poll', () =>
    setup((store, owner) => {
      store.release(owner.lease, 'Release the fixture before testing current-byte inputs.')
      expect(owner.current(false, true)).toBe(true)
      store.files.atomic(`${owner.path}/cancel.json`, JSON.stringify({ nonce: 'foreign' }))
      expect(owner.current(false, true)).toBe(true)
      store.files.atomic(
        `delivery/runner-requests/${owner.lease.request}.json`,
        JSON.stringify({ ...store.get(owner.lease.request), pollMs: 51 }),
      )
      expect(owner.current(false, true)).toBe(false)
    }))
})
