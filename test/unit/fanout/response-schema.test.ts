import { mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type Schema, validate } from '../../../src/config/schema.js'
import { WORKER_PROPOSAL_SCHEMA } from '../../../src/delivery/worker-proposal.js'
import { headlessAdapter } from '../../../src/fanout/adapters.js'
import { stageWorkerPolicy } from '../../../src/fanout/policy-files.js'
import { generationSchema, headlessResponseSchema } from '../../../src/fanout/response-schema.js'
import { GATE_SCHEMAS, validateGateResult, validateGateVote } from '../../../src/gates/contracts.js'

const identity = { assignment: 'a'.repeat(64), run: 'gate-0123456789abcdef', round: 1 }
const result = {
  unit: 'correctness',
  status: 'ok',
  evidence: ['Observed app.ts:1'],
  findings: [],
  reason: 'Inspection completed',
}
const envelope = () => ({
  schema: 'wholeloop/headless-result@1',
  ...identity,
  result: structuredClone(result),
})

function strictObjects(rule: Schema) {
  expect(rule).not.toHaveProperty('$id')
  expect(rule).not.toHaveProperty('minLength')
  if (rule.type === 'object') {
    expect(rule.additionalProperties).toBe(false)
    expect(rule.required?.slice().sort()).toEqual(Object.keys(rule.properties ?? {}).sort())
    Object.values(rule.properties ?? {}).forEach(strictObjects)
  }
  if (rule.type === 'array' && rule.items) strictObjects(rule.items)
}

describe('native exact headless response constraints', () => {
  it('binds complete inspect/refute envelopes while retaining the existing public schemas', () => {
    const before = structuredClone(GATE_SCHEMAS)
    const inspect = headlessResponseSchema(identity, 'inspect', { id: 'correctness' })
    strictObjects(inspect)
    expect(validate(envelope(), inspect)).toEqual([])
    expect(inspect.properties?.result?.properties).not.toHaveProperty('execution')
    expect(inspect.properties?.result?.required).toContain('reason')
    validateGateResult(result)
    const vote = {
      finding: 'correctness:defect',
      verifier: 2,
      outcome: 'uncertain',
      reason: 'Evidence not observable',
      evidence: [],
    }
    const refute = headlessResponseSchema(identity, 'refute', vote)
    strictObjects(refute)
    expect(validate({ schema: 'wholeloop/headless-result@1', ...identity, vote }, refute)).toEqual(
      [],
    )
    validateGateVote(vote)
    expect(GATE_SCHEMAS).toEqual(before)
  })

  it.each(['bare', 'assignment', 'run', 'round', 'unit', 'extra', 'missing', 'suite-status'])(
    'keeps %s output invalid instead of reconstructing identity',
    (kind) => {
      const schema = headlessResponseSchema(identity, 'inspect', { id: 'correctness' })
      const value: Record<string, unknown> = envelope()
      if (kind === 'assignment') value.assignment = 'b'.repeat(64)
      if (kind === 'run') value.run = 'gate-fedcba9876543210'
      if (kind === 'round') value.round = 2
      if (kind === 'unit') (value.result as typeof result).unit = 'security'
      if (kind === 'extra') value.private = 'not an allowed field'
      if (kind === 'missing') delete value.assignment
      if (kind === 'suite-status')
        Object.assign(value.result as object, { execution: { status: 'passed' } })
      expect(validate(kind === 'bare' ? value.result : value, schema)).not.toEqual([])
    },
  )

  it('leaves semantic/nonempty evidence enforcement in the unchanged core validator', () => {
    const value = envelope()
    value.result.evidence = []
    const schema = headlessResponseSchema(identity, 'inspect', { id: 'correctness' })
    expect(validate(value, schema)).toEqual([])
    expect(() => validateGateResult(value.result)).toThrow('observed evidence')
    const refute = headlessResponseSchema(identity, 'refute', {
      finding: 'correctness:defect',
      verifier: 2,
    })
    const vote = {
      finding: 'correctness:defect',
      verifier: 2,
      outcome: 'refute',
      reason: 'No evidence',
      evidence: [],
    }
    expect(validate({ schema: 'wholeloop/headless-result@1', ...identity, vote }, refute)).toEqual(
      [],
    )
    expect(() => validateGateVote(vote)).toThrow('observed evidence')
  })

  it.each(['digest', 'run', 'round', 'unit', 'suite', 'finding', 'verifier'])(
    'refuses invalid %s schema context',
    (kind) => {
      const current = { ...identity }
      const unit: Record<string, unknown> = { id: 'correctness' }
      if (kind === 'digest') current.assignment = 'unknown'
      if (kind === 'run') current.run = 'another'
      if (kind === 'round') current.round = 0
      if (kind === 'unit') unit.id = ' '
      if (kind === 'suite') unit.id = 'suite'
      if (kind === 'finding' || kind === 'verifier') {
        expect(() =>
          headlessResponseSchema(current, 'refute', {
            finding: kind === 'finding' ? 'unbound' : 'correctness:defect',
            verifier: kind === 'verifier' ? 0 : 2,
          }),
        ).toThrow()
      } else expect(() => headlessResponseSchema(current, 'inspect', unit)).toThrow()
    },
  )

  it('stages one closed non-secret schema and preserves existing files and links', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wl-worker-output-schema-'))
    try {
      const schema = headlessResponseSchema(identity, 'inspect', { id: 'correctness' })
      const adapter = headlessAdapter('codex')
      const invocation = adapter.invocation({
        repository: '/assigned/repository',
        directory: dir,
        responseSchema: schema,
      })
      const path = join(dir, 'response.schema.json')
      expect(invocation.args.slice(-3)).toEqual(['--output-schema', path, '-'])
      expect(invocation.args).toContain('read-only')
      expect(invocation.args.join(' ')).not.toContain(identity.assignment)
      stageWorkerPolicy(dir, invocation.files)
      expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(schema)
      expect(statSync(path).mode & 0o777).toBe(0o600)
      expect(() => stageWorkerPolicy(dir, invocation.files)).toThrow('already exists')
      const other = join(dir, 'sentinel')
      writeFileSync(other, 'unchanged')
      const linked = mkdtempSync(join(tmpdir(), 'wl-worker-output-linked-'))
      try {
        symlinkSync(other, join(linked, 'response.schema.json'))
        expect(() => stageWorkerPolicy(linked, invocation.files)).toThrow('already exists')
        expect(readFileSync(other, 'utf8')).toBe('unchanged')
      } finally {
        rmSync(linked, { recursive: true, force: true })
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('native generation keeps rules it cannot enforce visible', () => {
  it('turns a dropped string pattern into a description the producer can read', () => {
    const rule = generationSchema(WORKER_PROPOSAL_SCHEMA as Schema)
    const ref = rule.properties?.artifacts?.items?.properties?.ref
    // A live Codex builder returned an artifact ref outside artifacts/ because
    // its schema carried no trace of the pattern the core enforces on readback.
    expect(ref).not.toHaveProperty('pattern')
    expect(ref?.description).toBe(
      `Must match the regular expression ${WORKER_PROPOSAL_SCHEMA.properties.artifacts.items.properties.ref.pattern}`,
    )
    expect(rule.properties?.summary).not.toHaveProperty('description')
  })
})
