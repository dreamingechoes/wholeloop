import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { JsonSchemaType } from '@modelcontextprotocol/sdk/validation'
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv'
import { describe, expect, it } from 'vitest'
import { overviewProblem, projectOverview } from '../../../src/overview/project.js'
import { readOverview } from '../../../src/overview/read.js'
import overview from '../../../src/overview/schemas/overview-v1.json' with { type: 'json' }
import watch from '../../../src/overview/schemas/watch-frame-v1.json' with { type: 'json' }
import { StateStore } from '../../../src/state/store.js'

const provider = new AjvJsonSchemaValidator(),
  validateOverview = provider.getValidator(overview as unknown as JsonSchemaType),
  validateWatch = provider.getValidator(watch as unknown as JsonSchemaType),
  at = '2026-11-04T20:00:00.000Z'
describe('consumer overview and feed schemas', () => {
  it('validates actual bounded views and rejects leaked fields or malformed digests', () => {
    const root = mkdtempSync(join(tmpdir(), 'wholeloop-overview-schema-'))
    try {
      const store = new StateStore(join(root, 'store'))
      store.create({
        kind: 'initiative',
        title: 'PRIVATE_SOURCE_TITLE',
        owner: 'Owner',
        body: 'PRIVATE_SOURCE_BODY',
      })
      const value = projectOverview(
        readOverview({ root, store: store.files.root, userFile: join(root, 'user.yml'), at }),
      )
      expect(validateOverview(value)).toMatchObject({ valid: true })
      expect(validateOverview({ ...value, rationale: 'PRIVATE_REASON' }).valid).toBe(false)
      expect(validateOverview({ ...value, digest: 'invalid' }).valid).toBe(false)
      expect(validateOverview({ ...value, counts: null }).valid).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
  it.each(['store-busy', 'store-unreadable', 'cursor-diverged', 'overview-limit'] as const)(
    'represents %s without partial facts or invented zero totals',
    (problem) => {
      const value = overviewProblem(problem, at)
      expect(validateOverview(value)).toMatchObject({ valid: true })
      expect(value.counts).toBeNull()
      expect(value.cursor).toBeNull()
      expect(validateOverview({ ...value, headline: 'complete' }).valid).toBe(false)
    },
  )
  it('keeps liveness and observation-only updates separate from progress', () => {
    const base = { schema: 'wholeloop/watch-frame@1', sequence: 1, at, resumeCursor: null },
      liveness = {
        ...base,
        kind: 'liveness',
        progress: false,
        state: 'writer-busy',
        wakeup: 'poll',
      },
      initial = {
        ...base,
        kind: 'overview',
        change: 'initial',
        progress: false,
        overview: overviewProblem('store-busy', at),
      }
    expect(validateWatch(liveness)).toMatchObject({ valid: true })
    expect(validateWatch({ ...liveness, progress: true }).valid).toBe(false)
    expect(validateWatch(initial)).toMatchObject({ valid: true })
    expect(validateWatch({ ...initial, progress: true }).valid).toBe(false)
    expect(validateWatch({ ...liveness, kind: 'unknown-frame' }).valid).toBe(false)
    expect(validateWatch({ ...liveness, prompt: 'PRIVATE_PROMPT' }).valid).toBe(false)
  })
})
