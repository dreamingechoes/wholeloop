import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { type DeliveryEvent, validateDeliveryEvent } from '../../../src/delivery/events.js'
import { projectOverview } from '../../../src/overview/project.js'
import { readOverview } from '../../../src/overview/read.js'
import { type WatchFrame, watchOverview } from '../../../src/overview/watch.js'
import type { StateEvent } from '../../../src/state/events.js'

const at = '2026-11-05T00:00:00.000Z',
  source = JSON.parse(readFileSync('test/fixtures/overview/item-decision.json', 'utf8')) as {
    journals: { state: StateEvent[] }
  },
  legacy = JSON.parse(
    readFileSync('test/fixtures/state/delivery-attribution-legacy.json', 'utf8'),
  ) as DeliveryEvent[]
async function fixture(
  run: (options: { root: string; store: string; userFile: string; at: string }) => Promise<void>,
) {
  const root = mkdtempSync(join(tmpdir(), 'wholeloop-watch-integrity-'))
  try {
    await run({ root, store: join(root, 'store'), userFile: join(root, 'user.yml'), at })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}
function journal(store: string, path: string, values: unknown[]) {
  const target = join(store, path),
    parent = dirname(target)
  mkdirSync(parent, { recursive: true })
  writeFileSync(target, `${values.map((value) => JSON.stringify(value)).join('\n')}\n`)
}
describe('feed integrity and observation boundaries', () => {
  it.each(['changed-prefix', 'truncated-prefix', 'sequence-gap', 'digest-mismatch'])(
    'stops advancing on %s without exposing source payloads',
    async (kind) =>
      fixture(async (options) => {
        const stateCase = kind.endsWith('prefix')
        if (stateCase) journal(options.store, 'journal/2026-11.ndjson', source.journals.state)
        const frames: WatchFrame[] = [],
          stop = new AbortController(),
          timeout = setTimeout(() => stop.abort(), 5000)
        try {
          const code = await watchOverview(
            { ...options, poll: true, pollMs: 25, signal: stop.signal },
            (frame) => {
              frames.push(frame)
              if (frame.kind !== 'overview' || frame.change !== 'initial') return
              if (stateCase) {
                const changed = structuredClone(source.journals.state)
                if (kind === 'truncated-prefix') changed.pop()
                else {
                  const first = changed[0]
                  if (first?.type !== 'item.created')
                    throw new Error('Created fixture item required')
                  first.data.title = 'PRIVATE_FEED_CANARY'
                }
                journal(options.store, 'journal/2026-11.ndjson', changed)
              } else {
                const changed = structuredClone(legacy),
                  last = changed.at(-1)
                if (!last) throw new Error('Delivery fixture event required')
                if (kind === 'sequence-gap') {
                  last.sequence = 3
                  const { digest: _digest, ...body } = last
                  last.digest = contractDigest(body)
                  // Its own digest is valid: the refusal must come from the sequence gap.
                  validateDeliveryEvent(last)
                } else {
                  if (last.payload.schema !== 'wholeloop/delivery-control-event@1')
                    throw new Error('Control fixture event required')
                  last.payload.reason = 'PRIVATE_FEED_CANARY'
                }
                journal(options.store, 'delivery/journal/0000000000000001.ndjson', changed)
              }
            },
          )
          expect(code).toBe(3)
          expect(frames).toHaveLength(2)
          expect(frames.at(-1)).toMatchObject({
            kind: 'problem',
            problem: stateCase ? 'cursor-diverged' : 'store-unreadable',
            resumeCursor: frames[0]?.resumeCursor,
            progress: false,
          })
          expect(JSON.stringify(frames)).not.toContain('PRIVATE_')
        } finally {
          clearTimeout(timeout)
        }
      }),
  )
  it('preserves both prefixes through monthly and delivery-segment rollover', async () =>
    fixture(async (options) => {
      const first = structuredClone(source.journals.state[0])
      if (!first) throw new Error('Created fixture item required')
      first.ts = '2026-10-31T23:59:59.000Z'
      journal(options.store, 'journal/2026-10.ndjson', [first])
      journal(options.store, 'delivery/journal/0000000000000001.ndjson', legacy.slice(0, 1))
      const frames: WatchFrame[] = [],
        stop = new AbortController(),
        timeout = setTimeout(() => stop.abort(), 5000)
      try {
        expect(
          await watchOverview(
            { ...options, poll: true, pollMs: 25, signal: stop.signal },
            (frame) => {
              frames.push(frame)
              if (frame.kind === 'overview' && frame.change === 'initial') {
                journal(options.store, 'journal/2026-11.ndjson', source.journals.state.slice(1))
                journal(options.store, 'delivery/journal/0000000000000002.ndjson', legacy.slice(1))
              }
              if (frame.kind === 'overview' && frame.change === 'journal') {
                expect(frame.overview).toEqual(projectOverview(readOverview(options)))
                stop.abort()
              }
            },
          ),
        ).toBe(0)
        const activities = frames.flatMap((frame) => (frame.kind === 'events' ? frame.events : []))
        expect(activities.map((event) => [event.journal, event.position])).toEqual([
          ['state', 2],
          ['delivery', 2],
        ])
        expect(frames.at(-1)?.resumeCursor).toBe(readOverview(options).cursor)
      } finally {
        clearTimeout(timeout)
      }
    }))
  it('refreshes observation-only configuration changes without acknowledging new journal work', async () =>
    fixture(async (options) => {
      const frames: WatchFrame[] = [],
        stop = new AbortController(),
        timeout = setTimeout(() => stop.abort(), 5000)
      try {
        await watchOverview(
          { ...options, poll: true, pollMs: 25, signal: stop.signal },
          (frame) => {
            frames.push(frame)
            if (frame.kind === 'overview' && frame.change === 'initial')
              writeFileSync(options.userFile, 'version: 1\nlearn:\n  checkpoints: [launch, d1]\n')
            if (frame.kind === 'overview' && frame.change === 'observation') {
              expect(frame.progress).toBe(false)
              expect(frame.resumeCursor).toBe(frames[0]?.resumeCursor)
              expect(frame.overview).toEqual(projectOverview(readOverview(options)))
              stop.abort()
            }
          },
        )
        expect(frames).toHaveLength(2)
        expect(frames[0]).toMatchObject({ kind: 'overview', change: 'initial' })
        expect(frames[1]).toMatchObject({ kind: 'overview', change: 'observation' })
        if (frames[0]?.kind === 'overview' && frames[1]?.kind === 'overview')
          expect(frames[1].overview.digest).not.toBe(frames[0].overview.digest)
      } finally {
        clearTimeout(timeout)
      }
    }))
  it('emits idle liveness as non-progress without creating an absent store', async () =>
    fixture(async (options) => {
      const frames: WatchFrame[] = [],
        stop = new AbortController(),
        timeout = setTimeout(() => stop.abort(), 5000)
      try {
        await watchOverview(
          { ...options, poll: true, pollMs: 25, livenessMs: 1, signal: stop.signal },
          (frame) => {
            frames.push(frame)
            if (frame.kind === 'liveness') stop.abort()
          },
        )
        expect(frames.at(-1)).toMatchObject({
          kind: 'liveness',
          state: 'idle',
          wakeup: 'poll',
          progress: false,
          resumeCursor: frames[0]?.resumeCursor,
        })
        expect(frames.every((frame) => !frame.progress)).toBe(true)
        expect(existsSync(options.store)).toBe(false)
      } finally {
        clearTimeout(timeout)
      }
    }))
})
