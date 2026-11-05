import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { originalCiFailure } from '../../../src/runner/ci-failure.js'
import { authorization } from '../../support/delivery.js'
import { runnerCiFailureFixture } from '../../support/runner-ci.js'

it('reads the exact historical CI failure after revocation and revision without effects or host reads', async () => {
  await runnerCiFailureFixture(async ({ store, input, request, publication, reads, writes }) => {
    const original = originalCiFailure(store, input),
      beforeReads = reads(),
      beforeWrites = writes()
    expect(original).toMatchObject({
      historical: true,
      request: input.request,
      publication,
      target: { branch: 'wl/ci-history', pr: 'https://github.com/fixture/app/pull/1' },
      failures: [
        { check: 'test', issuer: 'github-app:15368', state: 'failure', class: 'code-test' },
      ],
    })
    store.lifecycle.authority.revoke({
      schema: 'wholeloop/delivery-revocation-request@1',
      grant: request.grant,
      operator: 'Fixture Operator',
      reason: 'Historical feedback restores no authority.',
    })
    const plan = store.planning.getPlan(request.run, 1).plan,
      next = store.planning.preparePlan({ ...plan, revision: 2, previous: request.plan }),
      grant = store.lifecycle.authority.authorize({
        ...authorization(next.plan, next.digest),
        id: 'authorization-fedcba9876543210',
      })
    store.lifecycle.track({ run: request.run, revision: 2, grant: grant.grant.id })
    const journal = contractDigest(store.lifecycle.journal.events())
    expect(originalCiFailure(store, input)).toEqual(original)
    expect(() => store.basis(request)).toThrow()
    expect(contractDigest(store.lifecycle.journal.events())).toBe(journal)
    expect(reads()).toBe(beforeReads)
    expect(writes()).toEqual(beforeWrites)
  })
})
it('refuses missing, changed and substituted exact receipts without searching for replacements', async () => {
  await runnerCiFailureFixture(async ({ store, input, paths }) => {
    const original = originalCiFailure(store, input)
    for (const path of paths) {
      const file = store.files.path(path),
        bytes = readFileSync(file),
        backup = `${file}.fixture-backup`
      renameSync(file, backup)
      try {
        expect(() => originalCiFailure(store, input), path).toThrow(
          'original-ci-failure-unavailable',
        )
      } finally {
        renameSync(backup, file)
      }
      writeFileSync(file, path.endsWith('consumed') ? 'c'.repeat(64) : '{}')
      try {
        expect(() => originalCiFailure(store, input), path).toThrow(
          'original-ci-failure-unavailable',
        )
      } finally {
        writeFileSync(file, bytes)
      }
    }
    expect(originalCiFailure(store, input)).toEqual(original)
    for (const changed of [
      { failure: '0'.repeat(64) },
      { repository: 'foreign' },
      { request: 'c'.repeat(64) },
    ])
      expect(() => originalCiFailure(store, { ...input, ...changed })).toThrow(
        'original-ci-failure-unavailable',
      )
  })
})
it('refuses recanonicalized private bindings rather than treating their new hash as original', async () => {
  await runnerCiFailureFixture(({ store, input, paths }) => {
    for (const index of [1, 3]) {
      const file = store.files.path(paths[index] ?? ''),
        consumed = store.files.path(paths[index - 1] ?? ''),
        before = readFileSync(file),
        oldConsumed = readFileSync(consumed),
        changed = JSON.parse(before.toString('utf8'))
      changed.at = new Date(Date.parse(changed.at) + 1).toISOString()
      writeFileSync(file, JSON.stringify(changed))
      writeFileSync(consumed, `${contractDigest(changed)}\n`)
      try {
        expect(() => originalCiFailure(store, input)).toThrow('original-ci-failure-unavailable')
      } finally {
        writeFileSync(file, before)
        writeFileSync(consumed, oldConsumed)
      }
    }
    expect(originalCiFailure(store, input).historical).toBe(true)
  })
})
it.each(['timed_out', 'action_required', null] as const)(
  'refuses non-code conclusion %s',
  async (conclusion) => {
    await runnerCiFailureFixture(
      ({ store, input }) => {
        expect(() => originalCiFailure(store, input)).toThrow('original-ci-failure-unavailable')
      },
      {},
      conclusion,
    )
  },
)
it.each([{ repository: 'https://github.com/other/app' }, { base: 'foreign' }])(
  'refuses an observation of another repository or base',
  async (overrides) => {
    await runnerCiFailureFixture(({ store, input }) => {
      expect(() => originalCiFailure(store, input)).toThrow('original-ci-failure-unavailable')
    }, overrides)
  },
)
