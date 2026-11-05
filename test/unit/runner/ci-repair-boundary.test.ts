import { describe, expect, it } from 'vitest'
import { type CiCheck, type CiObservation, ciVerdict } from '../../../src/runner/ci-observations.js'
import { ciRepairRequest } from '../../../src/runner/ci-repair.js'

const head = 'a'.repeat(40),
  issuer = 'github-app:15368',
  check = (conclusion?: CiCheck['conclusion'], attempt = 1): CiCheck => ({
    name: 'test',
    issuer,
    head,
    attempt,
    status: 'completed',
    ...(conclusion ? { conclusion } : {}),
  }),
  observed = (checks: CiCheck[]): CiObservation => ({
    schema: 'wholeloop/delivery-ci@1',
    codeHost: 'github',
    repository: 'https://github.com/fixture/app',
    pr: 'https://github.com/fixture/app/pull/7',
    candidate: head,
    head,
    base: 'main',
    observedAt: '2026-11-05T00:00:00.000Z',
    complete: true,
    checks,
    protection: { status: 'observed', required: [{ name: 'test', issuer }] },
    reviews: { status: 'observed', required: 0, approvals: 0 },
    provenance: 'host-observed',
  }),
  policy = { required: [{ name: 'test', issuer }] },
  request = (checks: CiCheck[]) =>
    ciRepairRequest({
      run: 'delivery-0123456789abcdef',
      observation: observed(checks),
      policy,
      comments: [],
      admission: { pushes: 1, limit: 2, allowed: true },
    })

describe('literal CI failure admission', () => {
  it.each([
    ['timed out', 'timed_out'],
    ['action required', 'action_required'],
    ['missing conclusion', undefined],
  ] as const)('does not turn %s into a code failure', (_name, conclusion) => {
    expect(request([check(conclusion)])).toMatchObject({
      status: 'blocked',
      reasons: ['non-code-failure'],
      failures: [{ check: 'test', issuer, class: 'unknown' }],
    })
    expect(ciVerdict(observed([check(conclusion)]), policy).status).not.toBe('passed')
  })
  it.each([
    ['success', 'failure'],
    ['failure', 'success'],
    ['failure', 'failure'],
    ['success', 'success'],
  ] as const)('refuses equally latest %s/%s attempts', (first, second) => {
    const checks = [check('failure'), check(first, 2), check(second, 2)]
    for (const order of [checks, [...checks].reverse()]) {
      expect(ciVerdict(observed(order), policy)).toMatchObject({
        status: 'unknown',
        checks: [{ name: 'test', issuer, state: 'ambiguous-attempt' }],
      })
      expect(request(order)).toMatchObject({ status: 'blocked', reasons: ['non-code-failure'] })
    }
  })
  it('uses only a unique latest trusted literal failure', () => {
    expect(request([check('failure'), check('success', 2)]).status).toBe('none')
    expect(request([check('timed_out'), check('failure', 2)])).toMatchObject({
      status: 'repair',
      failures: [{ check: 'test', issuer, state: 'failure', class: 'code-test' }],
    })
    const untrusted = { ...check('failure', 99), issuer: 'github-app:666' }
    expect(request([check('success'), untrusted]).status).toBe('none')
  })
})
