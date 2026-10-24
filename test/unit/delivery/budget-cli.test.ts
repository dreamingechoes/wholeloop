import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { DeliveryQueue } from '../../../src/delivery/queue.js'
import { authorization, fixture } from '../../support/delivery.js'

it('configures advisory usage and captures deduplicated binary evidence in independent compiled processes', () =>
  fixture(({ planning, plan, root }) => {
    plan.budgets.artifactBytes = 3
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
          ...(args[0] === 'budget-schema' ? [] : ['--store', planning.sources.files.root]),
          '--json',
        ],
        { encoding: 'utf8' },
      )
      expect(result.status, result.stderr || result.stdout).toBe(status)
      return JSON.parse(result.stdout)
    }
    writeFileSync(
      join(root, 'constraints.json'),
      JSON.stringify({
        schema: 'wholeloop/delivery-budget-constraints@1',
        operator: 'Fixture Operator',
        run: plan.run,
        basis: prepared.digest,
        grantDigest: grant.digest,
        requirements: { tokens: { limit: 100, mode: 'advisory' } },
      }),
    )
    const configure = ['budget-configure', '--file', 'constraints.json', '--root', root]
    expect(cli(configure)).toMatchObject({ started: false, usage: { tokens: { value: null } } })
    expect(cli(['budget-schema']).constraintsSchema.$id).toBe(
      'wholeloop/delivery-budget-constraints@1',
    )
    writeFileSync(join(root, 'capture.bin'), Buffer.from([0, 255, 1]))
    const capture = ['artifact', '--run', plan.run, '--file', 'capture.bin', '--root', root]
    const first = cli(capture)
    expect(first).toMatchObject({ stored: true, artifact: { bytes: 3 }, authority: 'not-granted' })
    expect(cli(capture)).toEqual(first)
    writeFileSync(join(root, 'capture.bin'), Buffer.from([2]))
    expect(cli(capture, 3)).toMatchObject({ stored: false, reason: 'artifact-byte-limit' })
    const before = queue.lifecycle.journal.events()
    expect(cli(['budget', '--run', plan.run])).toMatchObject({
      started: true,
      counters: { artifactBytes: 3 },
      usage: { tokens: { value: null } },
    })
    expect(queue.lifecycle.journal.events()).toEqual(before)
    writeFileSync(
      join(root, 'constraints.json'),
      JSON.stringify({
        schema: 'wholeloop/delivery-budget-constraints@1',
        operator: 'Fixture Operator',
        run: plan.run,
        basis: prepared.digest,
        grantDigest: grant.digest,
        requirements: { tokens: { limit: 200, mode: 'advisory' } },
      }),
    )
    const refused = spawnSync(
      process.execPath,
      [
        resolve('dist/wl.mjs'),
        'delivery',
        ...configure,
        '--store',
        planning.sources.files.root,
        '--json',
      ],
      { encoding: 'utf8' },
    )
    expect(refused.status).toBe(3)
    expect(queue.lifecycle.journal.events()).toEqual(before)
  }))
