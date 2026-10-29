import { describe, expect, it } from 'vitest'
import { observedDockerAcceptanceCase } from '../../../src/acceptance/case-observation.js'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { acceptanceFixture } from '../../support/acceptance.js'

describe('original fixed Docker assertion observations', () => {
  it.each(['foreign-host', 'copied-host-label'] as const)(
    'refuses %s without replay or journal mutation',
    async (mode) => {
      await acceptanceFixture(async ({ acceptance, plan, boundary, host, calls }) => {
        const pinned = acceptance.prepare(plan),
          result = await acceptance.executeCase(
            pinned.digest,
            'find-title',
            'audit',
            boundary,
            mode === 'copied-host-label' ? { ...host, id: 'docker-behavior' } : host,
          )
        expect(result.status).toBe('passed')
        const before = contractDigest(acceptance.budgets.lifecycle.journal.events())
        expect(() =>
          observedDockerAcceptanceCase(acceptance, pinned.digest, 'find-title', 'audit'),
        ).toThrow(
          mode === 'foreign-host'
            ? 'original-docker-case-host-required'
            : 'original-docker-case-evidence-required',
        )
        expect(calls.count).toBe(1)
        expect(contractDigest(acceptance.budgets.lifecycle.journal.events())).toBe(before)
      })
    },
  )
})
