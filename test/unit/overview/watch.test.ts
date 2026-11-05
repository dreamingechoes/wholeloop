import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { JsonSchemaType } from '@modelcontextprotocol/sdk/validation'
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv'
import { describe, expect, it } from 'vitest'
import { projectOverview } from '../../../src/overview/project.js'
import { readOverview } from '../../../src/overview/read.js'
import overviewSchema from '../../../src/overview/schemas/overview-v1.json' with { type: 'json' }
import watchSchema from '../../../src/overview/schemas/watch-frame-v1.json' with { type: 'json' }
import { type WatchFrame, watchOverview } from '../../../src/overview/watch.js'
import { StateStore } from '../../../src/state/store.js'

const at = '2026-11-05T00:00:00.000Z',
  provider = new AjvJsonSchemaValidator()
provider.getValidator(overviewSchema as unknown as JsonSchemaType)
const validate = provider.getValidator(watchSchema as unknown as JsonSchemaType)
async function fixture(
  run: (context: {
    root: string
    store: StateStore
    options: { root: string; store: string; at: string; userFile: string }
  }) => Promise<void>,
) {
  const root = mkdtempSync(join(tmpdir(), 'wholeloop-watch-'))
  try {
    const store = new StateStore(join(root, 'store'))
    await run({
      root,
      store,
      options: { root, store: store.files.root, at, userFile: join(root, 'user.yml') },
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}
function capture(frames: WatchFrame[], frame: WatchFrame) {
  expect(validate(frame)).toMatchObject({ valid: true })
  frames.push(frame)
}
const activities = (frames: WatchFrame[]) =>
  frames.flatMap((frame) => (frame.kind === 'events' ? frame.events : []))
const views = (frames: WatchFrame[]) =>
  frames.flatMap((frame) => (frame.kind === 'overview' ? [frame] : []))

describe('local read-only change feed', () => {
  it.each([true, false])(
    'equals the core read after an appended event, forced poll %s',
    async (poll) =>
      fixture(async ({ store, options }) => {
        const stop = new AbortController(),
          frames: WatchFrame[] = [],
          timeout = setTimeout(() => stop.abort(), 5000)
        try {
          expect(
            await watchOverview({ ...options, poll, pollMs: 25, signal: stop.signal }, (frame) => {
              capture(frames, frame)
              if (frame.kind === 'overview' && frame.change === 'initial')
                store.create({
                  kind: 'initiative',
                  title: 'PRIVATE_WATCH_TITLE',
                  owner: 'PRIVATE_WATCH_OWNER',
                  body: 'PRIVATE_WATCH_BODY',
                })
              if (frame.kind === 'overview' && frame.change === 'journal') {
                expect(frame.overview).toEqual(projectOverview(readOverview(options)))
                stop.abort()
              }
            }),
          ).toBe(0)
          expect(activities(frames)).toHaveLength(1)
          expect(views(frames).at(-1)?.overview.headline).toBe('ready')
          expect(JSON.stringify(frames)).not.toContain('PRIVATE_WATCH_')
          expect(frames.map((frame) => frame.sequence)).toEqual(frames.map((_, index) => index + 1))
        } finally {
          clearTimeout(timeout)
        }
      }),
  )
  it('acknowledges complete delivered batches and resumes a backlog without repeating activity', async () =>
    fixture(async ({ store, options }) => {
      const since = readOverview(options).cursor
      store.transaction((_events, append) => {
        for (let index = 0; index < 150; index++)
          append(`init-${index.toString(16).padStart(8, '0')}`, {
            type: 'item.created',
            data: { kind: 'initiative', title: 'Fixture', owner: 'Owner', body: '' },
          })
      })
      const first: WatchFrame[] = [],
        stop = new AbortController()
      await watchOverview({ ...options, since, poll: true, signal: stop.signal }, (frame) => {
        capture(first, frame)
        if (frame.kind === 'overview' && frame.change === 'initial') {
          expect(frame.resumeCursor).toBe(since)
          expect(frame.overview.cursor).not.toBe(since)
        }
        if (frame.kind === 'events') stop.abort()
      })
      expect(activities(first)).toHaveLength(128)
      const checkpoint = first.at(-1)?.resumeCursor
      if (!checkpoint) throw new Error('A complete frame checkpoint is required')
      const second: WatchFrame[] = [],
        again = new AbortController()
      await watchOverview(
        { ...options, since: checkpoint, poll: true, signal: again.signal },
        (frame) => {
          capture(second, frame)
          if (frame.kind === 'overview' && frame.change === 'journal') again.abort()
        },
      )
      const all = [...activities(first), ...activities(second)]
      expect(all).toHaveLength(150)
      expect(new Set(all.map((event) => event.id)).size).toBe(150)
      expect(second.at(-1)?.resumeCursor).toBe(readOverview(options).cursor)
    }))
  it('does not echo malformed resume input in a problem frame', async () =>
    fixture(async ({ options }) => {
      const frames: WatchFrame[] = []
      expect(
        await watchOverview({ ...options, since: 'PRIVATE_CURSOR_CANARY' }, (frame) =>
          capture(frames, frame),
        ),
      ).toBe(3)
      expect(frames).toEqual([
        expect.objectContaining({
          kind: 'problem',
          problem: 'invalid-cursor',
          resumeCursor: null,
          progress: false,
        }),
      ])
      expect(JSON.stringify(frames)).not.toContain('PRIVATE_CURSOR_CANARY')
    }))
  it('refuses a changed retained prefix without advancing the feed', async () =>
    fixture(async ({ store, options }) => {
      store.create({ kind: 'initiative', title: 'Original', owner: 'Owner', body: '' })
      const since = readOverview(options).cursor,
        name = readdirSync(store.files.path('journal'))[0]
      if (!name) throw new Error('Fixture journal required')
      const path = store.files.path(`journal/${name}`),
        value = JSON.parse(readFileSync(path, 'utf8'))
      value.data.title = 'Changed valid event'
      writeFileSync(path, `${JSON.stringify(value)}\n`)
      const frames: WatchFrame[] = []
      expect(await watchOverview({ ...options, since }, (frame) => capture(frames, frame))).toBe(3)
      expect(frames).toHaveLength(1)
      expect(frames[0]).toMatchObject({
        kind: 'problem',
        problem: 'cursor-diverged',
        resumeCursor: since,
      })
    }))
  it('keeps liveness separate from work and waits through a held writer lock', async () =>
    fixture(async ({ store, options }) => {
      const stop = new AbortController(),
        frames: WatchFrame[] = [],
        timeout = setTimeout(() => stop.abort(), 5000)
      try {
        await watchOverview(
          { ...options, poll: true, pollMs: 25, livenessMs: 1, signal: stop.signal },
          (frame) => {
            capture(frames, frame)
            if (frame.kind === 'overview' && frame.change === 'initial')
              mkdirSync(store.files.path('.lock'), { recursive: true })
            if (frame.kind === 'liveness' && frame.state === 'writer-busy') {
              expect(frame.progress).toBe(false)
              expect(frame.resumeCursor).toBe(frames[0]?.resumeCursor)
              rmSync(store.files.path('.lock'), { recursive: true })
              store.create({ kind: 'initiative', title: 'After lock', owner: 'Owner', body: '' })
            }
            if (frame.kind === 'overview' && frame.change === 'journal') stop.abort()
          },
        )
        expect(
          frames.some((frame) => frame.kind === 'liveness' && frame.state === 'writer-busy'),
        ).toBe(true)
        expect(activities(frames)).toHaveLength(1)
        expect(views(frames).at(-1)?.overview.headline).toBe('ready')
      } finally {
        clearTimeout(timeout)
      }
    }))
  it('retains a supplied checkpoint while an initially locked store is unavailable', async () =>
    fixture(async ({ store, options }) => {
      const since = readOverview(options).cursor,
        stop = new AbortController(),
        frames: WatchFrame[] = [],
        timeout = setTimeout(() => stop.abort(), 5000)
      mkdirSync(store.files.path('.lock'), { recursive: true })
      try {
        await watchOverview(
          { ...options, since, poll: true, pollMs: 25, signal: stop.signal },
          (frame) => {
            capture(frames, frame)
            if (frame.kind === 'overview' && frame.change === 'initial') {
              expect(frame.resumeCursor).toBe(since)
              expect(frame.overview).toMatchObject({
                headline: 'unavailable',
                cursor: null,
                counts: null,
              })
            }
            if (frame.kind === 'liveness' && frame.state === 'writer-busy') {
              rmSync(store.files.path('.lock'), { recursive: true })
              store.create({
                kind: 'initiative',
                title: 'After initial lock',
                owner: 'Owner',
                body: '',
              })
            }
            if (frame.kind === 'overview' && frame.change === 'journal') stop.abort()
          },
        )
        expect(activities(frames)).toHaveLength(1)
        expect(views(frames).at(-1)?.overview.headline).toBe('ready')
      } finally {
        clearTimeout(timeout)
      }
    }))
})
