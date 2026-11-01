import { describe, expect, it } from 'vitest'
import {
  type MergeEligibilityInput,
  mergeEligibility,
  pathMatches,
} from '../../../src/runner/merge-eligibility.js'

const head = 'b'.repeat(40),
  now = '2026-11-01T12:00:30.000Z',
  url = 'https://github.com/fixture/app/pull/7'
function input(): MergeEligibilityInput {
  return {
    now,
    policy: {
      method: 'squash',
      checks: { required: [{ name: 'verify', issuer: 'github-app:1' }] },
      denylist: ['.github/workflows/**', '**/*.pem', 'policy/**', 'db/migrations/*.sql'],
      exceptions: [],
    },
    grant: {
      active: true,
      endpoint: 'to-merge',
      effects: ['git.push', 'pr.create', 'pr.ready', 'pr.merge'],
      repository: 'app',
      target: 'refs/heads/main',
      methods: ['squash'],
      expiresAt: '2026-11-01T13:00:00.000Z',
    },
    runtime: { allowsMerge: true },
    candidate: { repository: 'app', head, target: 'refs/heads/main' },
    evidence: {
      acceptance: 'current',
      verify: 'passed',
      review: 'passed',
      refutation: 'passed',
      integration: 'passed',
      humanObservations: 'not-required',
    },
    pr: {
      codeHost: 'github',
      url,
      state: 'open',
      draft: false,
      head,
      base: 'main',
      mergeable: true,
      files: ['src/search.ts', 'test/search.test.ts'],
      unresolvedDiscussions: 0,
      allowedMethods: ['merge', 'squash'],
    },
    ci: {
      schema: 'wholeloop/delivery-ci@1',
      codeHost: 'github',
      repository: 'https://github.com/fixture/app',
      pr: url,
      candidate: head,
      head,
      base: 'main',
      observedAt: '2026-11-01T12:00:00.000Z',
      complete: true,
      checks: [
        {
          name: 'verify',
          issuer: 'github-app:1',
          attempt: 1,
          head,
          status: 'completed',
          conclusion: 'success',
        },
      ],
      protection: {
        status: 'observed',
        required: [{ name: 'verify', issuer: 'github-app:1' }],
        strict: true,
      },
      reviews: { status: 'observed', required: 1, approvals: 1 },
      provenance: 'host-observed',
    },
    base: { observedAt: '2026-11-01T12:00:10.000Z', current: true },
    dependencies: [{ repository: 'web', delivered: true }],
    requested: { adminBypass: false, force: false, protectionChange: false, autoMerge: false },
  }
}
type Mutation = (value: MergeEligibilityInput) => void

describe('conditional merge eligibility', () => {
  it('is eligible only with every proof current, and expires 60 seconds after the oldest read', () => {
    expect(mergeEligibility(input())).toMatchObject({
      schema: 'wholeloop/merge-eligibility@1',
      status: 'eligible',
      reasons: [],
      expiresAt: '2026-11-01T12:01:00.000Z',
    })
  })
  it.each<[string, Mutation, string]>([
    [
      'no merge effect despite green tests',
      (v) => {
        v.grant.effects = v.grant.effects.filter((e) => e !== 'pr.merge')
      },
      'merge-not-granted',
    ],
    [
      'a to-pr endpoint',
      (v) => {
        v.grant.endpoint = 'to-pr'
      },
      'endpoint-not-to-merge',
    ],
    [
      'a revoked grant',
      (v) => {
        v.grant.active = false
      },
      'inactive-grant',
    ],
    [
      'an expired grant',
      (v) => {
        v.grant.expiresAt = '2026-11-01T12:00:00.000Z'
      },
      'grant-expired',
    ],
    [
      'a runtime policy without merge',
      (v) => {
        v.runtime.allowsMerge = false
      },
      'runtime-policy-denies-merge',
    ],
    [
      'an ungranted method',
      (v) => {
        v.grant.methods = ['merge']
      },
      'method-not-granted',
    ],
    [
      'another target',
      (v) => {
        v.grant.target = 'refs/heads/release'
      },
      'grant-target',
    ],
    [
      'stale acceptance',
      (v) => {
        v.evidence.acceptance = 'stale'
      },
      'acceptance-stale',
    ],
    [
      'a failed refutation',
      (v) => {
        v.evidence.refutation = 'failed'
      },
      'refutation-failed',
    ],
    [
      'missing integration',
      (v) => {
        v.evidence.integration = 'missing'
      },
      'integration-missing',
    ],
    [
      'unsatisfied human observations',
      (v) => {
        v.evidence.humanObservations = 'unsatisfied'
      },
      'human-observations-unsatisfied',
    ],
    [
      'a draft PR',
      (v) => {
        v.pr.draft = true
      },
      'pull-request-draft',
    ],
    [
      'a moved PR head',
      (v) => {
        v.pr.head = 'c'.repeat(40)
      },
      'pull-request-head-changed',
    ],
    [
      'a retargeted PR',
      (v) => {
        v.pr.base = 'release'
      },
      'pull-request-base-changed',
    ],
    [
      'a workflow change',
      (v) => {
        v.pr.files = ['.github/workflows/ci.yml']
      },
      'sensitive-path',
    ],
    [
      'a key file',
      (v) => {
        v.pr.files = ['config/server.pem']
      },
      'sensitive-path',
    ],
    [
      'a destructive migration',
      (v) => {
        v.pr.files = ['db/migrations/004_drop.sql']
      },
      'sensitive-path',
    ],
    [
      'a failed required check',
      (v) => {
        const c = v.ci.checks[0]
        if (c) c.conclusion = 'failure'
      },
      'required-check-failed',
    ],
    [
      'a missing required review',
      (v) => {
        v.ci.reviews = { status: 'observed', required: 2, approvals: 1 }
      },
      'required-review-missing',
    ],
    [
      'an unresolved discussion',
      (v) => {
        v.pr.unresolvedDiscussions = 1
      },
      'unresolved-discussion',
    ],
    [
      'a conflict',
      (v) => {
        v.pr.mergeable = false
      },
      'merge-conflict',
    ],
    [
      'an undelivered dependency',
      (v) => {
        v.dependencies = [{ repository: 'web', delivered: false }]
      },
      'dependency-undelivered:web',
    ],
    [
      'a stale base',
      (v) => {
        v.base.current = false
      },
      'stale-base',
    ],
    [
      'no strict current-base check',
      (v) => {
        v.ci.protection.strict = false
      },
      'no-server-current-base-check',
    ],
    [
      'a method the repository disallows',
      (v) => {
        v.pr.allowedMethods = ['merge']
      },
      'method-not-allowed',
    ],
    [
      'an admin bypass request',
      (v) => {
        v.requested.adminBypass = true
      },
      'admin-bypass-requested',
    ],
    [
      'a force request',
      (v) => {
        v.requested.force = true
      },
      'force-requested',
    ],
    [
      'a protection change',
      (v) => {
        v.requested.protectionChange = true
      },
      'protection-change-requested',
    ],
    [
      'armed auto-merge',
      (v) => {
        v.requested.autoMerge = true
      },
      'auto-merge-requested',
    ],
    [
      'a 61-second-old observation',
      (v) => {
        v.ci.observedAt = '2026-11-01T11:59:29.000Z'
      },
      'stale-observation',
    ],
    [
      'a non-GitHub host',
      (v) => {
        v.pr.codeHost = 'gitlab'
      },
      'unsupported-merge-host',
    ],
    [
      'CI for another PR',
      (v) => {
        v.ci.pr = 'https://github.com/fixture/app/pull/8'
      },
      'ci-pull-request-mismatch',
    ],
  ])('is ineligible with %s', (_name, mutate, reason) => {
    const value = input()
    mutate(value)
    const result = mergeEligibility(value)
    expect(result.status).toBe('ineligible')
    expect(result.reasons).toContain(reason)
  })
  it.each<[string, Mutation, string]>([
    [
      'pending checks',
      (v) => {
        const c = v.ci.checks[0]
        if (c) {
          c.status = 'in_progress'
          delete c.conclusion
        }
      },
      'required-check-pending',
    ],
    [
      'unknown protection',
      (v) => {
        v.ci.protection = { status: 'unknown', required: [] }
      },
      'ci-unknown-protection',
    ],
    [
      'unknown reviews',
      (v) => {
        v.ci.reviews = { status: 'unknown' }
      },
      'reviews-unknown',
    ],
    [
      'unknown mergeability',
      (v) => {
        v.pr.mergeable = 'unknown'
      },
      'mergeability-unknown',
    ],
    [
      'unknown changed files',
      (v) => {
        v.pr.files = 'unknown'
      },
      'changed-files-unknown',
    ],
    [
      'an unknown dependency',
      (v) => {
        v.dependencies = [{ repository: 'web', delivered: 'unknown' }]
      },
      'dependency-unknown:web',
    ],
    [
      'unknown base currency',
      (v) => {
        v.base.current = 'unknown'
      },
      'base-currency-unknown',
    ],
    [
      'unknown discussions',
      (v) => {
        v.pr.unresolvedDiscussions = 'unknown'
      },
      'discussions-unknown',
    ],
    [
      'unknown merge methods',
      (v) => {
        v.pr.allowedMethods = 'unknown'
      },
      'merge-methods-unknown',
    ],
    [
      'a spoofed issuer',
      (v) => {
        const c = v.ci.checks[0]
        if (c) c.issuer = 'github-app:666'
      },
      'check-wrong-issuer:verify',
    ],
  ])('is unknown with %s', (_name, mutate, reason) => {
    const value = input()
    mutate(value)
    const result = mergeEligibility(value)
    expect(result.status).toBe('unknown')
    expect(result.reasons).toContain(reason)
  })
  it('honours only the operator exception for an exact sensitive path', () => {
    const value = input()
    value.pr.files = ['policy/merge.yml']
    expect(mergeEligibility(value).status).toBe('ineligible')
    value.policy.exceptions = ['policy/merge.yml']
    expect(mergeEligibility(value).status).toBe('eligible')
    value.policy.exceptions = ['policy/**']
    expect(mergeEligibility(value).status).toBe('ineligible')
  })
  it.each([
    ['**/*.pem', 'a/b/c.pem', true],
    ['**/*.pem', 'c.pem', true],
    ['policy/**', 'policy/x/y.yml', true],
    ['policy/**', 'policyx/y.yml', false],
    ['db/migrations/*.sql', 'db/migrations/sub/1.sql', false],
    ['.github/workflows/**', '.github/workflows/ci.yml', true],
  ])('matches %s against %s as %s', (pattern, path, expected) => {
    expect(pathMatches(pattern, path)).toBe(expected)
  })
})
