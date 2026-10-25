import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { acceptanceShape } from '../../../src/acceptance/contracts.js'
import output from '../../../src/cli/schemas/output-v1.json' with { type: 'json' }
import type { Schema } from '../../../src/config/schema.js'

it('inspects and materializes a closed CLI fixture without revealing private expected values', () => {
  const directory = mkdtempSync(join(tmpdir(), 'wholeloop-fixture-cli-')),
    bin = resolve('dist/wl.mjs'),
    catalog = resolve('test/fixtures/delivery-applications/catalog.json'),
    store = join(directory, 'state')
  try {
    const cli = (args: string[], expected = 0) => {
      const result = spawnSync(process.execPath, [bin, 'eval', ...args, '--json'], {
        cwd: directory,
        encoding: 'utf8',
      })
      expect(result.status, result.stderr || result.stdout).toBe(expected)
      const value = JSON.parse(result.stdout) as {
        schema: string
        digest: string
        status?: string
        executed?: boolean
      }
      const rule = output.oneOf.find((v) => v.properties.schema.const === value.schema)
      if (!rule) throw new Error('Missing fixture output contract')
      acceptanceShape(value, rule as unknown as Schema)
      return value
    }
    expect(cli(['delivery-schema']).executed).toBe(false)
    expect(cli(['delivery-catalog', catalog]).executed).toBe(false)
    const seed = cli([
      'delivery-seed',
      catalog,
      '--scenario',
      'durable-board',
      '--key',
      'cli',
      '--store',
      store,
    ])
    expect(seed.status).toBe('ready')
    expect(JSON.stringify(seed)).not.toContain('Persistent café task')
    expect(cli(['delivery-inspect', seed.digest, '--store', store]).status).toBe('ready')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
