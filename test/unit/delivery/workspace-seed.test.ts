import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DeliveryWorkspaces } from '../../../src/delivery/workspaces.js'
import { authorization, git } from '../../support/delivery.js'
import { runnerGitFixture } from '../../support/runner-git.js'

type Fixture = Parameters<Parameters<typeof runnerGitFixture>[0]>[0]

/**
 * Revision 1 commits the unit through owned effects; revision 2 is then
 * registered under a new exact-plan grant, as a continuation is.
 */
async function committedThenRevised(fixture: Fixture) {
  const { store, request, dispatch, observe, host } = fixture
  observe(await host.execute(dispatch('workspace:search')))
  const workspace = host.workspace(request, 'search').repository.path
  writeFileSync(join(workspace, 'app.txt'), 'Original owned implementation.\n')
  observe(await host.execute(dispatch('commit:search')))
  const committed = host.candidate(request, 'search'),
    current = store.basis(request),
    plan = { ...structuredClone(current.plan), revision: 2, previous: current.digest },
    next = store.planning.preparePlan(plan),
    grant = store.lifecycle.authority.authorize({
      ...authorization(plan, next.digest),
      id: 'authorization-fedcba9876543210',
    })
  store.lifecycle.track({ run: request.run, revision: 2, grant: grant.grant.id })
  return { committed, next }
}
const seeded = (fixture: Fixture, plan: string, commit: string, extra: object = {}) =>
  new DeliveryWorkspaces(fixture.store.files.root).prepare({
    schema: 'wholeloop/delivery-workspace-request@1',
    run: fixture.request.run,
    revision: 2,
    plan,
    unit: 'search',
    key: 'seeded-search',
    parts: [],
    seed: { commit },
    ...extra,
  })

describe('seeded correction workspaces (ADR-0208)', () => {
  it('starts the new topic at the predecessor revision committed head', () =>
    runnerGitFixture(
      async (fixture) => {
        const { committed, next } = await committedThenRevised(fixture),
          record = seeded(fixture, next.digest, committed.receipt.record)
        expect(record.seed).toEqual({
          commit: committed.receipt.record,
          head: committed.receipt.head,
        })
        const run = fixture.request.run
        if (fixture.store.lifecycle.journal.get(run).state !== 'queued')
          fixture.store.lifecycle.transition(run, {
            to: 'queued',
            reason: 'Queue the registered revision for its seeded workspace.',
          })
        await new DeliveryWorkspaces(fixture.store.files.root).execute(record.digest)
        expect(git(record.repository.path, ['rev-parse', 'HEAD'])).toBe(committed.receipt.head)
        // The creation effect itself is observed against the seed, not the base.
        expect(
          new DeliveryWorkspaces(fixture.store.files.root).inspect(record.digest),
        ).toMatchObject({ status: 'ready', head: committed.receipt.head })
        expect(record.repository.branch).not.toBe(committed.allocation.repository.branch)
      },
      { singleUnit: true },
    ))
  it.each(['unknown-commit', 'same-revision', 'with-parts'] as const)(
    'refuses a seed with %s before any Git effect',
    (mode) =>
      runnerGitFixture(
        async (fixture) => {
          const { committed, next } = await committedThenRevised(fixture),
            effects = () => fixture.store.lifecycle.journal.get(fixture.request.run)
          const before = JSON.stringify(effects().facets)
          expect(() =>
            mode === 'unknown-commit'
              ? seeded(fixture, next.digest, 'f'.repeat(64))
              : mode === 'same-revision'
                ? new DeliveryWorkspaces(fixture.store.files.root).prepare({
                    schema: 'wholeloop/delivery-workspace-request@1',
                    run: fixture.request.run,
                    revision: 1,
                    plan: fixture.request.plan,
                    unit: 'search',
                    key: 'seeded-again',
                    parts: [],
                    seed: { commit: committed.receipt.record },
                  })
                : seeded(fixture, next.digest, committed.receipt.record, {
                    parts: [
                      { work: 'contract', repository: 'app', path: '.', commit: 'a'.repeat(64) },
                    ],
                  }),
          ).toThrow()
          expect(JSON.stringify(effects().facets)).toBe(before)
        },
        { singleUnit: true },
      ),
  )
})
