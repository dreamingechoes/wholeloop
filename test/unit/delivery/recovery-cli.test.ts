import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { DeliveryQueue } from '../../../src/delivery/queue.js'
import { authorization, fixture } from '../../support/delivery.js'

it('captures and verifies checkpoint inputs and resumes the same queued run through compiled commands', () =>
  fixture(({ planning, plan, dir, source }) => {
    const prepared = planning.preparePlan(plan)
    const queue = new DeliveryQueue(planning.sources.files.root)
    queue.lifecycle.authority.authorize(authorization(plan, prepared.digest))
    queue.lifecycle.track({ run: plan.run, revision: 1, grant: 'authorization-0123456789abcdef' })
    queue.enqueue(plan.run, { unit: 'contract' })
    const files = queue.lifecycle.journal.files
    files.atomic('delivery/artifacts/probe.txt', 'Original checkpoint input.\n')
    const file = join(dir, 'checkpoint.json')
    writeFileSync(
      file,
      JSON.stringify({
        schema: 'wholeloop/delivery-checkpoint-request@1',
        key: 'inputs',
        stage: 'source-adopted',
        inputs: [`delivery/sources/${source.id}.json`, 'delivery/artifacts/probe.txt'],
      }),
    )
    const cli = (args: string[], status = 0) => {
      const name = args[0]
      const result = spawnSync(
        process.execPath,
        [
          resolve('dist/wl.mjs'),
          'delivery',
          ...args,
          ...(name === 'lock-status' || name === 'repair-lock' || name === 'recovery-schema'
            ? []
            : ['--run', plan.run]),
          ...(name === 'recovery-schema' ? [] : ['--store', files.root]),
          '--json',
        ],
        { encoding: 'utf8' },
      )
      expect(result.status, result.stdout || result.stderr).toBe(status)
      return JSON.parse(result.stdout)
    }
    const captured = cli(['checkpoint', '--file', file, '--root', dir])
    expect(captured.checkpoints[0]?.status).toBe('current')
    expect(cli(['checkpoints'])).toEqual(captured)
    const events = queue.lifecycle.journal.events()
    expect(cli(['checkpoint', '--file', file, '--root', dir])).toEqual(captured)
    expect(queue.lifecycle.journal.events()).toEqual(events)
    files.atomic('delivery/artifacts/probe.txt', 'Changed checkpoint input.\n')
    expect(cli(['checkpoints']).checkpoints[0]?.status).toBe('stale')
    expect(cli(['recover', '--resume'], 3)).toMatchObject({
      ready: false,
      problems: ['stale-checkpoint-inputs'],
      state: { state: 'paused' },
    })
    files.atomic('delivery/artifacts/probe.txt', 'Original checkpoint input.\n')
    const recovered = cli(['recover', '--resume'])
    expect(recovered).toMatchObject({
      ready: true,
      problems: [],
      state: { run: plan.run, state: 'queued' },
      workers: 'not-started',
      effects: 'not-invoked',
    })
    expect(cli(['effects']).records).toEqual([])
    expect(cli(['lock-status']).inspection.status).toBe('clear')
    expect(cli(['recovery-schema']).effectIntentSchema.$id).toBe(
      'wholeloop/delivery-effect-intent@1',
    )
    mkdirSync(files.path('.lock'))
    files.atomic(
      '.lock/owner.json',
      JSON.stringify({ pid: process.pid, started: new Date().toISOString() }),
    )
    const owner = cli(['lock-status'])
    const bytes = readFileSync(files.path('.lock/owner.json'))
    expect(owner.inspection.status).toBe('held')
    cli(['repair-lock', '--owner-digest', owner.inspection.digest], 3)
    expect(readFileSync(files.path('.lock/owner.json'))).toEqual(bytes)
  }))
