import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { JsonSchemaType } from '@modelcontextprotocol/sdk/validation'
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv'
import { expect, it } from 'vitest'
import overview from '../../../src/overview/schemas/overview-v1.json' with { type: 'json' }
import watch from '../../../src/overview/schemas/watch-frame-v1.json' with { type: 'json' }
import { type WatchFrame, watchOverview } from '../../../src/overview/watch.js'
import type { StateEvent } from '../../../src/state/events.js'

it('reproduces the portable recorded feed through the actual core reader and frame emitter', async () => {
  const source = JSON.parse(readFileSync('test/fixtures/overview/item-decision.json', 'utf8')) as {
      at: string
      journals: { state: StateEvent[]; delivery: [] }
    },
    root = mkdtempSync(join(tmpdir(), 'wholeloop-watch-recording-')),
    store = join(root, 'store'),
    frames: WatchFrame[] = [],
    stop = new AbortController(),
    provider = new AjvJsonSchemaValidator()
  provider.getValidator(overview as unknown as JsonSchemaType)
  const validate = provider.getValidator(watch as unknown as JsonSchemaType),
    append = (count: number) => {
      mkdirSync(join(store, 'journal'), { recursive: true })
      writeFileSync(
        join(store, 'journal', '2026-11.ndjson'),
        `${source.journals.state
          .slice(0, count)
          .map((event) => JSON.stringify(event))
          .join('\n')}\n`,
      )
    },
    timeout = setTimeout(() => stop.abort(), 5000)
  try {
    expect(
      await watchOverview(
        {
          root,
          store,
          userFile: join(root, 'user.yml'),
          at: source.at,
          poll: true,
          pollMs: 25,
          signal: stop.signal,
        },
        (frame) => {
          expect(validate(frame)).toMatchObject({ valid: true })
          frames.push(frame)
          if (frame.kind === 'overview' && frame.change === 'initial') append(1)
          if (
            frame.kind === 'overview' &&
            frame.change === 'journal' &&
            frame.overview.headline === 'ready'
          )
            append(2)
          if (
            frame.kind === 'overview' &&
            frame.change === 'journal' &&
            frame.overview.headline === 'attention'
          )
            stop.abort()
        },
      ),
    ).toBe(0)
    expect(frames).toHaveLength(5)
    expect(JSON.stringify(frames)).not.toContain('PRIVATE_FIXTURE_')
    const value = {
        schema: 'wholeloop/recorded-watch-fixture@1',
        provenance: 'fixture',
        at: source.at,
        journals: source.journals,
        frames,
      },
      path = 'test/fixtures/overview/recorded-feed.json'
    if (process.env.WHOLELOOP_UPDATE_WATCH_FIXTURES === '1')
      writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(value)
  } finally {
    clearTimeout(timeout)
    rmSync(root, { recursive: true, force: true })
  }
})
