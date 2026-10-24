import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fixture } from '../../support/delivery.js'

describe('compiled delivery journal in independent processes', () => {
  it('tracks idempotently, pages retained events and repairs only its cache', () =>
    fixture(({ planning, plan }) => {
      planning.preparePlan(plan)
      const store = planning.sources.files.root
      const cli = (...args: string[]) => {
        const process = spawnSync(
          globalThis.process.execPath,
          [
            resolve('dist/wl.mjs'),
            'delivery',
            ...args,
            ...(args[0] === 'state-schema' ? [] : ['--store', store]),
            '--json',
          ],
          { encoding: 'utf8' },
        )
        expect(process.status, process.stderr).toBe(0)
        return JSON.parse(process.stdout)
      }
      const tracked = cli('track', '--run', plan.run, '--revision', '1')
      expect(tracked.state).toMatchObject({ state: 'planned', sequence: 1 })
      expect(tracked).toMatchObject({ authority: 'not-implied', effects: 'not-performed' })
      expect(cli('track', '--run', plan.run, '--revision', '1').state.digest).toBe(
        tracked.state.digest,
      )
      const cache = planning.sources.files.path(`delivery/state/${plan.run}.json`)
      rmSync(cache)
      expect(cli('status', '--run', plan.run).projectionCache).toBe('missing')
      expect(cli('rebuild')).toMatchObject({ runs: 1, written: 1, authority: 'not-restored' })
      expect(cli('rebuild').written).toBe(0)
      const events = cli('events', '--run', plan.run, '--limit', '1')
      expect(events.events).toHaveLength(1)
      expect(events.nextCursor).toBeNull()
      expect(cli('events', '--run', plan.run, '--after', '1').events).toEqual([])
      const before = readFileSync(cache, 'utf8')
      writeFileSync(cache, '{interrupted cache')
      expect(cli('status', '--run', plan.run).projectionCache).toBe('stale')
      expect(cli('rebuild').written).toBe(1)
      expect(readFileSync(cache, 'utf8')).toBe(before)
      const schemas = cli('state-schema')
      expect(schemas.payloadSchemas).toContainEqual(
        expect.objectContaining({ $id: 'wholeloop/delivery-attempt-event@1' }),
      )
      expect(schemas.facetSchemas).toContainEqual(
        expect.objectContaining({ $id: 'wholeloop/delivery-attempts@1' }),
      )
      for (const args of [
        ['track', '--run', plan.run, '--revision', '0'],
        ['events', '--run', plan.run, '--limit', '1001'],
        ['events', '--run', plan.run, '--after', '-1'],
      ]) {
        const failed = spawnSync(
          globalThis.process.execPath,
          [resolve('dist/wl.mjs'), 'delivery', ...args, '--store', store, '--json'],
          { encoding: 'utf8' },
        )
        expect(failed.status, failed.stderr).toBe(2)
      }
    }))
})
