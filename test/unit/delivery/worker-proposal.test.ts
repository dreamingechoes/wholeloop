import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { DEFAULT_DELIVERY_BUDGETS } from '../../../src/delivery/plan.js'
import {
  decodeWorkerProposal,
  INLINE_ARTIFACT_LIMIT,
  WORKER_PROPOSAL_LIMIT,
  type WorkerProposal,
  workerProposalResponseSchema,
} from '../../../src/delivery/worker-proposal.js'
import {
  createWorkerAssignment,
  decodeWorkerResult,
  type WorkerAssignment,
  type WorkerRole,
} from '../../../src/delivery/worker-protocol.js'

function assignment(role: WorkerRole = 'verifier', context: WorkerAssignment['context'] = []) {
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
    brief: 'Return only the assigned scoped report.',
    endpoint: 'local-handoff',
    intervention: 'none',
    environment: { id: 'fixture', recipe: 'd'.repeat(64), boundary: 'e'.repeat(64) },
    candidates: [],
    criteria: ['search'],
    findings: [],
    contracts: [],
    context,
    deadline: '2030-01-01T00:00:00.000Z',
    limits: { ...DEFAULT_DELIVERY_BUDGETS },
  })
}
function proposal(selected = assignment()): WorkerProposal {
  return {
    schema: 'wholeloop/delivery-worker-proposal@1',
    assignment: selected.assignment,
    status: 'complete',
    summary: 'Keep this report as a worker claim.',
    artifacts: [
      {
        ref: 'artifacts/report.md',
        kind: 'evidence',
        text: 'Observed exact Unicode text: Δ and 漢字.\n',
      },
    ],
    criteria: [],
    findings: [],
    unknowns: [],
  }
}
const encode = (value: unknown) => Buffer.from(JSON.stringify(value))
describe('bounded inline artifact proposals from read-only workers', () => {
  it.each(['planner', 'challenger', 'researcher'] as const)(
    'retains the %s controller identity when an artifact needs no writable workspace',
    (role) => {
      const selected = assignment(role),
        value = proposal(selected),
        observed = decodeWorkerProposal(encode(value), selected)
      expect(observed.result.identity).toEqual(selected.identity)
      expect(observed.result.origin).toBe('worker-claim')
      expect(Object.hasOwn(observed.result, 'runtime')).toBe(false)
      expect(Object.hasOwn(observed.result, 'authority')).toBe(false)
    },
  )
  it('binds exact assignment and controller-derived Unicode byte metadata without granting acceptance', () => {
    const selected = assignment(),
      value = proposal(selected)
    value.criteria = [{ id: 'search', status: 'pass', evidence: ['artifacts/report.md'] }]
    const observed = decodeWorkerProposal(encode(value), selected),
      first = observed.artifacts[0]
    expect(observed.result).toMatchObject({
      schema: 'wholeloop/delivery-worker-result@1',
      assignment: selected.assignment,
      identity: selected.identity,
      origin: 'worker-claim',
      criteria: value.criteria,
    })
    expect(first?.bytes.toString('utf8')).toBe(value.artifacts[0]?.text)
    expect(first?.artifact.bytes).toBe(Buffer.byteLength(value.artifacts[0]?.text ?? ''))
    expect(first?.artifact.sha256).toBe(
      createHash('sha256')
        .update(first?.bytes ?? '')
        .digest('hex'),
    )
    expect(workerProposalResponseSchema(selected).properties?.assignment?.const).toBe(
      selected.assignment,
    )
    expect(Object.hasOwn(observed.result, 'acceptance')).toBe(false)
  })
  it.each(['', ' \n\t'])('preserves exact empty/whitespace artifact bytes %j', (text) => {
    const selected = assignment(),
      value = proposal(selected)
    value.artifacts = [{ ref: 'artifacts/empty.txt', kind: 'report', text }]
    const observed = decodeWorkerProposal(encode(value), selected)
    expect(observed.artifacts[0]?.bytes.equals(Buffer.from(text))).toBe(true)
    expect(observed.result.artifacts[0]?.bytes).toBe(Buffer.byteLength(text))
  })
  it('refuses a stale assignment echo and forged byte metadata', () => {
    const selected = assignment(),
      value = proposal(selected)
    expect(() =>
      decodeWorkerProposal(encode({ ...value, assignment: 'f'.repeat(64) }), selected),
    ).toThrow('result-identity')
    expect(() =>
      decodeWorkerProposal(
        encode({ ...value, artifacts: [{ ...value.artifacts[0], sha256: 'f'.repeat(64) }] }),
        selected,
      ),
    ).toThrow('invalid-or-unsafe-proposal')
  })
  it('keeps explicit proposal conversion separate from malformed legacy result validation', () => {
    const selected = assignment(),
      value = proposal(selected)
    expect(() => decodeWorkerResult(encode(value), selected)).toThrow('invalid-or-unsafe-shape')
    expect(() =>
      decodeWorkerProposal(
        encode({ ...value, schema: 'wholeloop/delivery-worker-result@1' }),
        selected,
      ),
    ).toThrow('invalid-or-unsafe-proposal')
  })
  it('refuses duplicate output references and overwriting an original pinned input', () => {
    const selected = assignment(),
      value = proposal(selected)
    value.artifacts.push({
      ref: 'artifacts/report.md',
      kind: 'report',
      text: 'A second body must not replace the original.',
    })
    expect(() => decodeWorkerProposal(encode(value), selected)).toThrow('output-overwrites-input')
    const body = 'Pinned input.',
      pinned = assignment('verifier', [
        {
          kind: 'guidance',
          audience: 'shared',
          artifact: {
            ref: 'artifacts/report.md',
            bytes: Buffer.byteLength(body),
            sha256: createHash('sha256').update(body).digest('hex'),
          },
        },
      ])
    expect(() => decodeWorkerProposal(encode(proposal(pinned)), pinned)).toThrow(
      'output-overwrites-input',
    )
  })
  it.each([
    'artifacts/../outside',
    'artifacts//empty',
    'artifacts/report\n',
    '/outside/report',
    'artifacts/report\0',
  ])('refuses an unsafe output reference %j', (ref) => {
    const selected = assignment(),
      value = proposal(selected)
    value.artifacts[0] = { ref, kind: 'report', text: 'A harmless scoped report.' }
    expect(() => decodeWorkerProposal(encode(value), selected)).toThrow()
  })
  it('refuses role/criterion/evidence expansion through the existing v1 guards', () => {
    const selected = assignment('reviewer'),
      value = proposal(selected)
    value.criteria = [{ id: 'search', status: 'pass', evidence: ['artifacts/report.md'] }]
    expect(() => decodeWorkerProposal(encode(value), selected)).toThrow('result-scope')
    value.criteria = []
    value.findings = [
      { id: 'issue', text: 'Keep the original issue.', evidence: ['artifacts/unobserved.md'] },
    ]
    expect(() => decodeWorkerProposal(encode(value), selected)).toThrow('unknown-evidence')
  })
  it('bounds the response before decoding and aggregate UTF-8 content before capture', () => {
    const selected = assignment(),
      value = proposal(selected)
    expect(() => decodeWorkerProposal(Buffer.alloc(WORKER_PROPOSAL_LIMIT + 1), selected)).toThrow(
      'output-limit',
    )
    value.artifacts = [
      { ref: 'artifacts/a.txt', kind: 'report', text: 'x'.repeat(INLINE_ARTIFACT_LIMIT / 2) },
      { ref: 'artifacts/b.txt', kind: 'report', text: 'y'.repeat(INLINE_ARTIFACT_LIMIT / 2 + 1) },
    ]
    expect(() => decodeWorkerProposal(encode(value), selected)).toThrow('output-artifact-limit')
  })
  it.each(['\0', '\ud800', `api_key=${'x'.repeat(40)}`])(
    'refuses invalid or credential-bearing content %j without exposing it',
    (text) => {
      const selected = assignment(),
        value = proposal(selected)
      value.artifacts[0] = { ref: 'artifacts/report.txt', kind: 'report', text }
      expect(() => decodeWorkerProposal(encode(value), selected)).toThrow(/contents omitted/)
    },
  )
})
