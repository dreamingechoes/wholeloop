import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COMMANDS } from '../../src/cli/commands.js'
import { checkCommandSchemas } from '../../src/cli/contracts.js'
import output from '../../src/cli/schemas/output-v1.json' with { type: 'json' }
import { conformanceMatrix } from '../../src/conformance/matrix.js'
import { releaseNotes } from '../../src/release/notes.js'
import eventData from '../fixtures/contracts/event-data-v1.json' with { type: 'json' }
import { sourceSchemas } from '../support/contracts.js'

describe('public JSON contract registration', () => {
  it.each(eventData)('preserves the prior event payload rules in $file', ({ file, sha256 }) => {
    const schema = JSON.parse(readFileSync(file, 'utf8'))
    expect(createHash('sha256').update(JSON.stringify(schema.properties)).digest('hex')).toBe(
      sha256,
    )
  })
  it('covers every source and compiled command with exactly one versioned output variant', () => {
    expect(checkCommandSchemas(COMMANDS, output)).toEqual([])
    const help = spawnSync(process.execPath, [resolve('dist/wl.mjs'), '--help', '--json'], {
      encoding: 'utf8',
    })
    expect(help.status, help.stderr).toBe(0)
    expect(checkCommandSchemas(JSON.parse(help.stdout).commands, output)).toEqual([])
  })
  it('detects the missing-schema regression instead of accepting only a command declaration', () => {
    const incomplete = structuredClone(output)
    incomplete.oneOf = incomplete.oneOf.filter(
      (variant) => variant.properties.schema.const !== 'wholeloop/release-notes@1',
    )
    expect(checkCommandSchemas(COMMANDS, incomplete)).toContain(
      'Missing command output: wholeloop/release-notes@1',
    )
  })
  it('rejects duplicate and unversioned variants and malformed output envelopes', () => {
    expect(
      checkCommandSchemas(COMMANDS, { ...output, oneOf: [...output.oneOf, output.oneOf[0]] }),
    ).toContain(`Duplicate output variant: ${output.oneOf[0]?.properties.schema.const}`)
    expect(checkCommandSchemas([{ path: 'fixture', schema: 'unversioned' }], output)).toContain(
      'Unversioned command output: fixture',
    )
    expect(
      checkCommandSchemas([], {
        ...output,
        oneOf: [{ properties: { schema: { const: 'unknown' } } }],
      }),
    ).not.toEqual([])
    for (const invalid of [null, {}, { ...output, required: [] }, { ...output, oneOf: [] }])
      expect(checkCommandSchemas(COMMANDS, invalid)).not.toEqual([])
  })
  it('keeps actual matrix, release draft and compiled delivery receipts covered by their declared fields', () => {
    const matrix = conformanceMatrix(
      { schema: 'wholeloop/conformance-results@1', runs: [] },
      '2026-10-20T12:00:00.000Z',
    )
    const notes = { ...releaseNotes([], '1.0.0'), from: null, to: 'a'.repeat(40) }
    const root = mkdtempSync(join(tmpdir(), 'wholeloop-output-contracts-'))
    try {
      const delivery = spawnSync(
        process.execPath,
        [
          resolve('dist/wl.mjs'),
          'release',
          'artifacts',
          '--out',
          join(root, 'preview'),
          '--dry-run',
          '--json',
        ],
        { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
      )
      expect(delivery.status, delivery.stderr).toBe(0)
      for (const value of [matrix, notes, JSON.parse(delivery.stdout)]) {
        const variant = output.oneOf.find((entry) => entry.properties.schema.const === value.schema)
        expect(variant, value.schema).toBeDefined()
        for (const field of variant?.required ?? [])
          expect(Object.hasOwn(value, field), `${value.schema}.${field}`).toBe(true)
      }
      expect(readdirSync(root)).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
  it('keeps source schema identities unique', () => {
    const ids = sourceSchemas().map(({ schema }) => (schema as { $id: string }).$id)
    expect(ids.length).toBeGreaterThan(0)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it.each(sourceSchemas())('versions the public schema $file at one', ({ schema: declaration }) => {
    const schema = declaration as { $schema: string; $id: string }
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
    expect(schema.$id).toMatch(/^wholeloop\/[a-z][a-z0-9-]*@1$/)
  })
})
