import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { DeliveryQueue } from '../../../src/delivery/queue.js'
import { authorization, fixture } from '../../support/delivery.js'

it('persists and inspects queue metadata in fresh compiled processes without dispatch', () =>
  fixture(({ planning, plan }) => {
    const prepared = planning.preparePlan(plan)
    const queue = new DeliveryQueue(planning.sources.files.root)
    const grant = queue.lifecycle.authority.authorize(authorization(plan, prepared.digest))
    queue.lifecycle.track({ run: plan.run, revision: 1, grant: grant.grant.id })
    const cli = (args: string[], status = 0) => {
      const result = spawnSync(
        process.execPath,
        [
          resolve('dist/wl.mjs'),
          'delivery',
          ...args,
          '--run',
          plan.run,
          '--store',
          planning.sources.files.root,
          '--json',
        ],
        { encoding: 'utf8' },
      )
      expect(result.status, result.stderr || result.stdout).toBe(status)
      return JSON.parse(result.stdout)
    }
    expect(cli(['enqueue', '--unit', 'search']).entries).toMatchObject([
      { unit: 'search', status: 'pending', reason: 'dependencies-pending' },
    ])
    const first = cli(['enqueue', '--unit', 'contract', '--priority', '10'])
    const retained = queue.lifecycle.journal.events()
    expect(cli(['enqueue', '--unit', 'contract', '--priority', '10'])).toEqual(first)
    expect(queue.lifecycle.journal.events()).toEqual(retained)
    expect(cli(['queue'])).toEqual(first)
    expect(first).toMatchObject({
      state: 'queued',
      workers: 'not-started-by-this-command',
      effects: 'not-performed',
    })
    expect(
      cli(['status']).state.facets.find(
        (facet: { schema: string }) => facet.schema === 'wholeloop/delivery-attempts@1',
      ).records,
    ).toEqual([])
    cli(['enqueue', '--unit', 'contract', '--priority', '101'], 2)
    cli(['enqueue', '--unit', 'contract', '--role', 'operator'], 2)
  }))
