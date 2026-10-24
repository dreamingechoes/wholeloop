import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import type { BrokerBoundary } from '../../../src/delivery/broker.js'
import { DEFAULT_DELIVERY_BUDGETS } from '../../../src/delivery/plan.js'
import { DeliveryQueue } from '../../../src/delivery/queue.js'
import {
  currentWorkerAssignment,
  workerContextForClaim,
} from '../../../src/delivery/worker-context.js'
import {
  createWorkerAssignment,
  decodeWorkerResult,
  stampWorkerExecution,
  validateWorkerAssignment,
  type WorkerAssignment,
  type WorkerResult,
  type WorkerRole,
  workerResponseSchema,
  workerResumePack,
  workerTools,
} from '../../../src/delivery/worker-protocol.js'
import { authorization, entry, fixture, git } from '../../support/delivery.js'

const at = '2026-10-24T10:00:00.000Z'
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')
const roles: WorkerRole[] = [
  'builder',
  'verifier',
  'reviewer',
  'refuter',
  'researcher',
  'planner',
  'challenger',
]
function assignment(role: WorkerRole = 'verifier'): WorkerAssignment {
  return createWorkerAssignment({
    identity: {
      run: 'delivery-0123456789abcdef',
      plan: 'a'.repeat(64),
      revision: ['planner', 'challenger'].includes(role) ? 0 : 1,
      ...(['planner', 'challenger'].includes(role) ? {} : { unit: 'search' }),
      role,
      attempt: 'attempt-0123456789abcdef',
      generation: 1,
    },
    grantDigest: 'b'.repeat(64),
    source: 'c'.repeat(64),
    brief: 'Find tasks by title. Keep missing evidence unknown.',
    endpoint: 'local-handoff',
    intervention: 'none',
    environment: { id: 'fixture-environment', recipe: 'd'.repeat(64), boundary: 'e'.repeat(64) },
    candidates: [{ repository: 'app', head: 'a'.repeat(40), snapshot: 'f'.repeat(64) }],
    criteria: ['search'],
    findings: ['prior-finding'],
    contracts: ['search-api'],
    context: [],
    deadline: '2026-10-24T10:00:01.000Z',
    limits: { ...DEFAULT_DELIVERY_BUDGETS },
  })
}
function resultFor(value: WorkerAssignment): WorkerResult {
  return {
    schema: 'wholeloop/delivery-worker-result@1',
    assignment: value.assignment,
    identity: structuredClone(value.identity),
    status: 'complete',
    origin: 'worker-claim',
    summary: 'Observed the assigned fixture.',
    artifacts: [{ ref: 'artifacts/result.json', sha256: hash('{}'), bytes: 2, kind: 'evidence' }],
    criteria:
      value.identity.role === 'verifier'
        ? [{ id: 'search', status: 'pass', evidence: ['artifacts/result.json'] }]
        : [],
    findings: [],
    unknowns: [],
  }
}
const encode = (value: unknown) => Buffer.from(JSON.stringify(value))
function resign(value: WorkerAssignment) {
  const { assignment: _digest, ...body } = value
  value.assignment = contractDigest(body)
  return value
}
function execution(value: WorkerAssignment) {
  const boundary: BrokerBoundary = {
    instance: 'fixture-instance',
    assignment: value.assignment,
    containment: 'isolated',
    controllerStore: 'denied',
    credentials: 'denied',
    tools: 'restricted',
    interactive: 'disabled',
    provenance: 'fixture',
  }
  const observation = {
    runtime: { backend: 'fixture', instance: 'fixture-instance', worker: 'fixture-worker' },
    status: 'succeeded' as const,
    code: 0,
    stdout: hash(encode(resultFor(value))),
    stderr: hash(''),
    startedAt: at,
    finishedAt: '2026-10-24T10:00:00.100Z',
    provenance: 'fixture' as const,
  }
  const options = {
    boundary,
    tools: value.tools,
    current: () => true,
    result: resultFor(value),
    readArtifact: () => Buffer.from('{}'),
  }
  return { observation, options }
}

describe('role-bound worker protocol', () => {
  it.each(roles)('binds fresh %s contexts and results without granting acceptance', (role) => {
    const value = assignment(role),
      result = resultFor(value)
    validateWorkerAssignment(value)
    expect(decodeWorkerResult(encode(result), value)).toEqual(result)
    expect(value.tools).toMatchObject({
      askUser: false,
      interactive: false,
      artifacts: 'own-output-only',
    })
    expect(value.tools.workspace === 'write').toBe(role === 'builder')
    expect(
      value.tools.broker.some((method) => /push|merge|publish|authorize|ask/.test(method)),
    ).toBe(false)
    const schema = workerResponseSchema(value)
    expect(schema.properties?.assignment?.const).toBe(value.assignment)
    expect(schema.properties?.identity?.additionalProperties).toBe(false)
  })

  it.each(['run', 'plan', 'revision', 'role', 'attempt', 'generation', 'unit'] as const)(
    'refuses a response from another %s',
    (field) => {
      const value = assignment(),
        result = resultFor(value)
      const replacements = {
        run: 'delivery-aaaaaaaaaaaaaaaa',
        plan: '0'.repeat(64),
        revision: 2,
        role: 'reviewer',
        attempt: 'attempt-aaaaaaaaaaaaaaaa',
        generation: 2,
        unit: 'other',
      }
      Object.assign(result.identity, { [field]: replacements[field] })
      expect(() => decodeWorkerResult(encode(result), value)).toThrow('result-identity')
    },
  )

  it.each(['code', 'runtime', 'execution', 'humanTested', 'grant', 'tools'])(
    'refuses a worker-supplied %s observation or authority claim',
    (field) => {
      const value = assignment()
      expect(() =>
        decodeWorkerResult(encode({ ...resultFor(value), [field]: true }), value),
      ).toThrow('shape')
    },
  )

  it('refuses tampered identity and role tools even after an input digest is recomputed', () => {
    const value = assignment('reviewer')
    value.brief = 'Changed source.'
    expect(() => validateWorkerAssignment(value)).toThrow('assignment-digest')
    value.tools.workspace = 'write'
    expect(() => validateWorkerAssignment(resign(value))).toThrow('role-tools')
    value.tools = workerTools('reviewer')
    Object.assign(value.tools, { askUser: true })
    expect(() => validateWorkerAssignment(resign(value))).toThrow('shape')
  })

  it('keeps hidden acceptance in its own verifier attempt and rejects copied contexts', () => {
    const verifier = assignment(),
      bytes = Buffer.from('Independent scenario.')
    verifier.context = [
      {
        kind: 'hidden-acceptance',
        audience: 'assignment',
        attempt: verifier.identity.attempt,
        artifact: { ref: 'artifacts/hidden.json', sha256: hash(bytes), bytes: bytes.length },
      },
    ]
    validateWorkerAssignment(resign(verifier))
    expect(workerResumePack(verifier, () => bytes)[0]?.bytes).toEqual(bytes)
    const builder = assignment('builder')
    builder.context = structuredClone(verifier.context)
    expect(() => validateWorkerAssignment(resign(builder))).toThrow('hidden-acceptance')
    entry(verifier.context, 0).attempt = 'attempt-aaaaaaaaaaaaaaaa'
    expect(() => validateWorkerAssignment(resign(verifier))).toThrow('context-owner')
  })

  it('pins bounded binary resume bytes and rejects aliases or changed content', () => {
    const value = assignment(),
      bytes = Buffer.from([0, 255, 1])
    value.context = [
      {
        kind: 'resume',
        audience: 'shared',
        artifact: { ref: 'artifacts/resume.bin', sha256: hash(bytes), bytes: bytes.length },
      },
    ]
    resign(value)
    expect(workerResumePack(value, () => bytes)[0]?.bytes).toEqual(bytes)
    expect(() => workerResumePack(value, () => Buffer.from([0, 254, 1]))).toThrow('changed-context')
    entry(value.context, 0).artifact.ref = 'artifacts/nested/../private/grants.json'
    expect(() => validateWorkerAssignment(resign(value))).toThrow('artifact-boundary')
    entry(value.context, 0).artifact.ref = 'artifacts/first.bin'
    entry(value.context, 0).artifact.bytes = 1024 * 1024
    value.context.push({
      kind: 'resume',
      audience: 'shared',
      artifact: { ref: 'artifacts/second.bin', sha256: hash('x'), bytes: 1 },
    })
    expect(() => validateWorkerAssignment(resign(value))).toThrow('resume-limit')
  })

  it('refuses truncated, oversized and non-UTF-8 output without reconstructing identities', () => {
    const value = assignment()
    expect(() => decodeWorkerResult(Buffer.from('{"schema":'), value)).toThrow('truncated')
    expect(() => decodeWorkerResult(Buffer.alloc(1024 * 1024 + 1), value)).toThrow('output-limit')
    expect(() => decodeWorkerResult(Buffer.from([255]), value)).toThrow('output-encoding')
    const result = resultFor(value)
    expect(() => decodeWorkerResult(encode({ status: result.status }), value)).toThrow('shape')
  })

  it('refuses out-of-scope criteria, invented evidence and overwriting context references', () => {
    const value = assignment(),
      result = resultFor(value)
    entry(result.criteria, 0).id = 'unassigned'
    expect(() => decodeWorkerResult(encode(result), value)).toThrow('result-scope')
    entry(result.criteria, 0).id = 'search'
    entry(result.criteria, 0).evidence = ['artifacts/not-observed.json']
    expect(() => decodeWorkerResult(encode(result), value)).toThrow('unknown-evidence')
    value.context = [
      {
        kind: 'resume',
        audience: 'shared',
        artifact: { ref: 'artifacts/result.json', sha256: hash('{}'), bytes: 2 },
      },
    ]
    resign(value)
    const duplicate = resultFor(value)
    expect(() => decodeWorkerResult(encode(duplicate), value)).toThrow('output-overwrites-input')
  })

  it('preserves owned unknowns as a claim and never creates a human wait', () => {
    const value = assignment(),
      result = resultFor(value)
    result.status = 'blocked'
    result.criteria = []
    result.unknowns = [
      {
        question: 'What is the baseline?',
        reason: 'No observation is available.',
        owner: 'Research owner',
      },
    ]
    expect(decodeWorkerResult(encode(result), value)).toEqual(result)
    expect(value.intervention).toBe('none')
    expect(value.tools.askUser).toBe(false)
  })

  it('stamps actual controller metadata separately and retains fixture provenance', () => {
    const value = assignment(),
      { observation, options } = execution(value)
    expect(stampWorkerExecution(value, observation, options)).toMatchObject({
      origin: 'controller-observation',
      provenance: 'fixture',
      acceptance: 'not-established',
      result: contractDigest(resultFor(value)),
    })
    expect(() =>
      stampWorkerExecution(value, { ...observation, provenance: 'host-observed' }, options),
    ).toThrow('boundary')
    expect(() =>
      stampWorkerExecution(value, observation, { ...options, current: () => false }),
    ).toThrow('unobserved-success')
    expect(() =>
      stampWorkerExecution(value, observation, {
        ...options,
        readArtifact: () => Buffer.from('x'),
      }),
    ).toThrow('changed-output-artifact')
    expect(() => stampWorkerExecution(value, { ...observation, code: 1 }, options)).toThrow(
      'unobserved-success',
    )
    expect(() =>
      stampWorkerExecution(value, { ...observation, finishedAt: value.deadline }, options),
    ).toThrow('unobserved-success')
    expect(() =>
      stampWorkerExecution(value, observation, {
        ...options,
        boundary: { ...options.boundary, interactive: 'permitted' },
      }),
    ).toThrow('boundary')
    let reads = 0
    expect(() =>
      stampWorkerExecution(value, observation, { ...options, current: () => ++reads === 1 }),
    ).toThrow('stale-after-artifact-read')
    const failed = { ...observation, status: 'cancelled' as const }
    delete (failed as { code?: number }).code
    const { result: _result, ...withoutResult } = options
    expect(
      stampWorkerExecution(value, failed, { ...withoutResult, current: () => false }),
    ).not.toHaveProperty('result')
  })
})

describe('current queue context assembly', () => {
  it('refuses an expired reservation after a successful metadata preparation', () =>
    fixture(({ planning, plan, root, dir }) => {
      const instructions = Buffer.from('Pinned guidance.'),
        contextRoot = join(dir, 'context')
      mkdirSync(join(contextRoot, 'artifacts'), { recursive: true })
      writeFileSync(join(contextRoot, 'artifacts/guidance.txt'), instructions)
      entry(plan.guidance, 0).sha256 = hash(instructions)
      plan.budgets.attemptMs = 100
      let elapsed = 0
      const now = () => new Date(Date.parse(at) + elapsed).toISOString()
      const queue = new DeliveryQueue(planning.sources.files.root, now, undefined, () => ({
        wall: now(),
        monotonicMs: elapsed,
        epoch: 'fixture-clock',
      }))
      const prepared = planning.preparePlan(plan),
        grant = queue.lifecycle.authority.authorize(authorization(plan, prepared.digest))
      queue.lifecycle.track({ run: plan.run, revision: 1, grant: grant.grant.id })
      queue.enqueue(plan.run, { unit: 'contract', role: 'verifier', cell: 'independent' })
      const lease = queue.claim('controller-0123456789abcdef0123456789abcdef', () => ({
        ready: true,
        evidence: 'a'.repeat(64),
        provenance: 'fixture',
      })).assignment
      if (!lease) throw new Error('Fixture requires one claim')
      const input = {
        workspace: root,
        contextRoot,
        environment: { id: 'fixture', recipe: 'b'.repeat(64), boundary: 'c'.repeat(64) },
        context: [
          {
            kind: 'guidance' as const,
            audience: 'shared' as const,
            artifact: {
              ref: 'artifacts/guidance.txt',
              sha256: hash(instructions),
              bytes: instructions.length,
            },
          },
        ],
      }
      expect(workerContextForClaim(queue, lease, input).assignment.tools.workspace).toBe(
        'read-only',
      )
      expect(() => workerContextForClaim(queue, lease, { ...input, criteria: ['search'] })).toThrow(
        'criteria-scope',
      )
      elapsed = 100
      expect(() => workerContextForClaim(queue, lease, input)).toThrow('expired-attempt')
    }))

  it('exports only bundled contracts in a fresh compiled process', () => {
    const result = spawnSync(
      process.execPath,
      [resolve('dist/wl.mjs'), 'delivery', 'worker-schema', '--json'],
      { encoding: 'utf8' },
    )
    expect(result.status, result.stderr || result.stdout).toBe(0)
    const value = JSON.parse(result.stdout)
    expect(value).toMatchObject({
      schema: 'wholeloop/delivery-worker-schema@1',
      resultSchema: { properties: { origin: { const: 'worker-claim' } } },
      executionSchema: { properties: { acceptance: { const: 'not-established' } } },
    })
  })

  it('pins actual guidance/worktree bytes and refuses missing context, stale fences and revoked grants', () =>
    fixture(({ planning, plan, root, dir }) => {
      const instructions = Buffer.from('Follow the fixture repository conventions.')
      entry(plan.guidance, 0).sha256 = hash(instructions)
      const prepared = planning.preparePlan(plan),
        queue = new DeliveryQueue(planning.sources.files.root, () => at)
      const grant = queue.lifecycle.authority.authorize(authorization(plan, prepared.digest))
      queue.lifecycle.track({ run: plan.run, revision: 1, grant: grant.grant.id })
      queue.enqueue(plan.run, { unit: 'contract' })
      const lease = queue.claim('controller-0123456789abcdef0123456789abcdef', () => ({
        ready: true,
        evidence: 'a'.repeat(64),
        provenance: 'fixture',
      })).assignment
      if (!lease) throw new Error('Fixture requires one claim')
      const workspace = join(dir, 'worker')
      git(root, ['worktree', 'add', '-b', 'wl/contract', workspace])
      const contextRoot = join(dir, 'inputs')
      mkdirSync(join(contextRoot, 'artifacts'), { recursive: true })
      writeFileSync(join(contextRoot, 'artifacts/guidance.txt'), instructions)
      const input = {
        workspace,
        contextRoot,
        environment: { id: 'fixture', recipe: 'b'.repeat(64), boundary: 'c'.repeat(64) },
        context: [
          {
            kind: 'guidance' as const,
            audience: 'shared' as const,
            artifact: {
              ref: 'artifacts/guidance.txt',
              sha256: hash(instructions),
              bytes: instructions.length,
            },
          },
        ],
      }
      const events = queue.lifecycle.journal.events()
      const result = workerContextForClaim(queue, lease, input)
      expect(result).toMatchObject({
        execution: 'not-started',
        authority: 'not-granted',
        assignment: {
          identity: { unit: 'contract', generation: 1 },
          tools: { workspace: 'write' },
        },
      })
      expect(result.assignment.candidates[0]?.head).toBe(entry(plan.repositories, 0).base)
      expect(JSON.parse(result.assignment.brief).unit).toEqual(entry(plan.work, 0))
      expect(queue.lifecycle.journal.events()).toEqual(events)
      expect(() => workerContextForClaim(queue, lease, { ...input, context: [] })).toThrow(
        'missing-guidance',
      )
      expect(() => workerContextForClaim(queue, { ...lease, generation: 2 }, input)).toThrow(
        'stale-lease',
      )
      expect(() => workerContextForClaim(queue, lease, { ...input, workspace: root })).toThrow(
        'unallocated-builder-workspace',
      )
      writeFileSync(join(contextRoot, 'artifacts/guidance.txt'), 'Changed instructions.')
      expect(() => workerContextForClaim(queue, lease, input)).toThrow('changed-context')
      const runtime = { backend: 'fixture', instance: 'fixture-instance', worker: 'fixture-worker' }
      expect(currentWorkerAssignment(queue, result.assignment, runtime)).toBe(false)
      queue.start(lease, runtime)
      expect(currentWorkerAssignment(queue, result.assignment, runtime)).toBe(true)
      expect(
        currentWorkerAssignment(queue, result.assignment, { ...runtime, worker: 'unrelated' }),
      ).toBe(false)
      queue.lifecycle.authority.revoke({
        schema: 'wholeloop/delivery-revocation-request@1',
        grant: grant.grant.id,
        operator: 'Fixture Operator',
        reason: 'Stop the fixture.',
      })
      expect(currentWorkerAssignment(queue, result.assignment, runtime)).toBe(false)
    }))
})
