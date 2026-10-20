import { describe, expect, it } from 'vitest'
import { generateDistribution } from '../../../src/adapters/distribution.js'
import { ADAPTERS, generateAdapter } from '../../../src/adapters/generate.js'
import artifactSchema from '../../../src/adapters/schemas/artifacts-v1.json' with { type: 'json' }
import distributionSchema from '../../../src/adapters/schemas/distribution-v1.json' with {
  type: 'json',
}
import { COMMANDS } from '../../../src/cli/commands.js'
import { EXIT } from '../../../src/cli/io.js'
import { validate } from '../../../src/config/schema.js'
import {
  checkCompatibility,
  contractDigest,
  schemaContracts,
} from '../../../src/contracts/compatibility.js'
import { STEPS } from '../../../src/flow/registry.js'
import baseline from '../../fixtures/contracts/v1-baseline.json' with { type: 'json' }
import { sourceSchemas } from '../../support/contracts.js'

const current = schemaContracts(sourceSchemas().map((entry) => entry.schema))
for (const step of STEPS) current.set(`step:${step.name}`, contractDigest(step))
describe('v1 declaration compatibility baseline', () => {
  it.each([...current])('preserves the frozen declaration %s', (id, digest) => {
    expect(digest).toBe((baseline.contracts as Record<string, string>)[id])
  })
  it('covers every declaration and retains command/exit contracts', () => {
    expect([...current.keys()].sort()).toEqual(Object.keys(baseline.contracts).sort())
    expect(
      checkCompatibility(baseline, { contracts: current, commands: COMMANDS, exitCodes: EXIT }),
    ).toEqual([])
  })
  it('ignores object key formatting without ignoring changed constraints or array order', () => {
    expect(contractDigest({ b: 2, a: 1 })).toBe(
      '43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777',
    )
    expect(contractDigest({ b: 2, a: 1 })).toBe(contractDigest({ a: 1, b: 2 }))
    expect(contractDigest({ enum: [1, 2] })).not.toBe(contractDigest({ enum: [2, 1] }))
  })
  it.each(['required', 'constraint', 'removed-output'])(
    'detects %s changes under existing identities',
    (kind) => {
      const config = {
        $id: 'wholeloop/config@1',
        type: 'object',
        required: ['version'],
        properties: { version: { const: 1 } },
      }
      const output = {
        $id: 'wholeloop/cli-output@1',
        required: ['schema'],
        oneOf: [{ properties: { schema: { const: 'wholeloop/fixture@1' } } }],
      }
      const old = {
        contracts: Object.fromEntries(schemaContracts([config, output])),
        commands: [],
        exitCodes: {},
      }
      if (kind === 'required') config.required.push('new-field')
      else if (kind === 'constraint') config.properties.version.const = 2
      else output.oneOf = []
      expect(
        checkCompatibility(old, {
          contracts: schemaContracts([config, output]),
          commands: [],
          exitCodes: {},
        }),
      ).not.toEqual([])
    },
  )
  it.each(['remove', 'schema', 'arguments', 'flag', 'exit'])(
    'detects a changed command %s contract',
    (kind) => {
      const command = {
        path: 'fixture',
        schema: 'wholeloop/fixture@1',
        arguments: '<id>',
        options: ['--named'],
      }
      const old = { contracts: {}, commands: [structuredClone(command)], exitCodes: { ok: 0 } }
      if (kind === 'schema') command.schema = 'wholeloop/fixture@2'
      if (kind === 'arguments') command.arguments = '<id> <extra>'
      if (kind === 'flag') command.options = []
      expect(
        checkCompatibility(old, {
          contracts: new Map(),
          commands: kind === 'remove' ? [] : [command],
          exitCodes: { ok: kind === 'exit' ? 1 : 0 },
        }),
      ).not.toEqual([])
    },
  )
  it('permits additive new identities, commands and flags while retaining the old declarations', () => {
    const contracts = new Map(current)
    contracts.set('output:wholeloop/new-command@1', contractDigest({ required: ['schema'] }))
    const commands = COMMANDS.map((entry) => ({
      ...entry,
      options: [...entry.options, '--new-optional'],
    }))
    commands.push({
      path: 'new-command',
      schema: 'wholeloop/new-command@1',
      arguments: '',
      options: [],
      summary: 'New fixture command',
    })
    expect(checkCompatibility(baseline, { contracts, commands, exitCodes: EXIT })).toEqual([])
  })
  it('rejects duplicate, missing or ambiguous declaration identities', () => {
    const schema = { $id: 'wholeloop/fixture@1' }
    expect(() => schemaContracts([schema, schema])).toThrow(/Duplicate/)
    for (const declaration of [null, {}, { $id: 'unknown' }, { $id: 'wholeloop/cli-output@1' }])
      expect(() => schemaContracts([declaration])).toThrow()
  })
})

const canonical = new Map([
  [
    'harness/skills/next/SKILL.md',
    '---\nname: next\ndescription: Continue fixture work.\n---\n# Next\n\nRead the next receipt.\n',
  ],
  [
    'harness/agents/reviewer.md',
    '---\nname: reviewer\ndescription: Observe the fixture.\nmetadata:\n  wholeloop.capabilities: read\n---\n# Review\n\nReturn evidence.\n',
  ],
])
const core = '#!/usr/bin/env node\nconsole.log("fixture core")\n'
describe('versioned public delivery manifest declarations', () => {
  it.each(ADAPTERS)(
    'validates actual $id output and refuses changed integrity fields',
    ({ id }) => {
      const { manifest } = generateAdapter(id, canonical, core, '0.0.0')
      expect(validate(manifest, artifactSchema)).toEqual([])
      expect(validate({ ...manifest, core: 'invalid' }, artifactSchema)).not.toEqual([])
      expect(
        validate(
          { ...manifest, files: [{ path: 'core.mjs', mode: 0o777, sha256: 'a'.repeat(64) }] },
          artifactSchema,
        ),
      ).not.toEqual([])
    },
  )
  it('validates the complete delivery index without permitting a publication claim', () => {
    const { manifest } = generateDistribution(canonical, core, '0.0.0')
    expect(validate(manifest, distributionSchema)).toEqual([])
    expect(validate({ ...manifest, publication: 'published' }, distributionSchema)).not.toEqual([])
  })
})
