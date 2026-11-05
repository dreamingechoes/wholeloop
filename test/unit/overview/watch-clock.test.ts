import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { projectOverview } from '../../../src/overview/project.js'
import { readOverview } from '../../../src/overview/read.js'
import { type WatchFrame, watchOverview } from '../../../src/overview/watch.js'
import { RunnerStore } from '../../../src/runner/store.js'
import { StateStore } from '../../../src/state/store.js'
import { authorization, fixture } from '../../support/delivery.js'

it('lets the watch reader sample its default clock after a concurrent commit', async () => {
  await fixture(async ({ planning, plan, root, dir }) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime('2026-11-05T01:00:00.000Z')
      const runner = new RunnerStore(planning.sources.files.root, () => new Date().toISOString()),
        prepared = planning.preparePlan(plan),
        grant = runner.lifecycle.authority.authorize(authorization(plan, prepared.digest))
      runner.lifecycle.track({ run: plan.run, revision: 1, grant: grant.grant.id })
      const original = StateStore.prototype.events,
        stop = new AbortController(),
        frames: WatchFrame[] = [],
        options = { root, store: runner.files.root, userFile: join(dir, 'user.yml') }
      let entered = false
      const barrier = vi.spyOn(StateStore.prototype, 'events').mockImplementation(function (
        this: StateStore,
      ) {
        if (!entered) {
          entered = true
          vi.setSystemTime('2026-11-05T01:00:01.000Z')
          runner.lifecycle.transition(plan.run, {
            to: 'paused',
            reason: 'Commit while the watch captures its first journals.',
          })
        }
        return original.call(this)
      })
      try {
        expect(
          await watchOverview({ ...options, poll: true, signal: stop.signal }, (frame) => {
            frames.push(frame)
            stop.abort()
          }),
        ).toBe(0)
        const frame = frames[0]
        expect(frame?.kind).toBe('overview')
        if (frame?.kind !== 'overview') throw new Error('Initial view required')
        expect(frame.overview).toEqual(projectOverview(readOverview(options)))
        expect(frame.overview.asOf).toBe('2026-11-05T01:00:01.000Z')
        expect(frame.overview.attention.map((entry) => entry.reason)).not.toContain(
          'budget-boundary',
        )
      } finally {
        barrier.mockRestore()
      }
    } finally {
      vi.useRealTimers()
    }
  })
})
