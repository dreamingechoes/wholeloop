import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import type { JsonSchemaType } from '@modelcontextprotocol/sdk/validation'
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv'
import { describe, expect, it } from 'vitest'
import { ATTENTION_REASONS } from '../../../src/overview/attention.js'
import schema from '../../../src/overview/schemas/overview-v1.json' with { type: 'json' }
import {
  OVERVIEW_CASES,
  overviewFixture,
  replayOverviewFixture,
} from '../../support/overview-fixtures.js'

const directory = 'test/fixtures/overview',
  validate = new AjvJsonSchemaValidator().getValidator(schema as unknown as JsonSchemaType)
const headlines = new Set<string>(),
  reasons = new Set<string>()
describe('portable overview contract kit', () => {
  it.each(OVERVIEW_CASES)(
    'replays the %s fixture without an operational store or authority',
    (name) => {
      const source = overviewFixture(name),
        expected = replayOverviewFixture(source),
        path = `${directory}/${name}.json`
      if (process.env.WHOLELOOP_UPDATE_OVERVIEW_FIXTURES === '1') {
        mkdirSync(directory, { recursive: true })
        writeFileSync(path, `${JSON.stringify({ ...source, expected }, null, 2)}\n`)
      }
      const frozen = JSON.parse(readFileSync(path, 'utf8')) as typeof source & { expected: unknown }
      expect(source).toEqual(expect.objectContaining({ provenance: 'fixture' }))
      expect(frozen).toEqual({ ...source, expected })
      expect(replayOverviewFixture(frozen)).toEqual(frozen.expected)
      expect(validate(expected)).toMatchObject({ valid: true })
      expect(JSON.stringify(expected)).not.toContain('PRIVATE_FIXTURE_')
      if (ATTENTION_REASONS.some((reason) => reason === name))
        expect(expected.attention.map((entry) => entry.reason)).toContain(name)
      if (name === 'running')
        expect(expected.agents[0]).toMatchObject({
          source: 'claimed',
          runtimeDigest: null,
          semanticProvenance: 'unknown',
        })
      if (name === 'fixture-worker' || name === 'host-worker')
        expect(expected.agents[0]).toMatchObject({
          source: 'observed-process',
          semanticProvenance: name === 'fixture-worker' ? 'fixture' : 'host-observed',
        })
      headlines.add(expected.headline)
      expected.attention.forEach((entry) => {
        reasons.add(entry.reason)
      })
    },
  )
  it('includes every headline and attention kind', () => {
    expect([...headlines].sort()).toEqual(
      [
        'unavailable',
        'attention',
        'blocked',
        'running',
        'waiting',
        'ready',
        'complete',
        'empty',
        'idle',
      ].sort(),
    )
    expect([...reasons].sort()).toEqual([...ATTENTION_REASONS].sort())
  })
})
