import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { RunnerAssemblyReadiness } from '../../../src/runner/assembly-readiness.js'
import { RunnerMilestoneReadiness } from '../../../src/runner/milestone-readiness.js'
import { RunnerStore } from '../../../src/runner/store.js'
import { runnerGitFixture } from '../../support/runner-git.js'

describe('current unit QA joined to owned assembly', () => {
  it.each(['pending-qa', 'unknown-milestone', 'foreign-unit-reader'] as const)(
    'refuses %s without a candidate or journal change',
    async (mode) => {
      await runnerGitFixture(async ({ store, request }) => {
        const before = contractDigest(store.lifecycle.journal.events()),
          units = new RunnerMilestoneReadiness(
            mode === 'foreign-unit-reader'
              ? new RunnerStore(join(store.files.root, '..', 'foreign-state'))
              : store,
            new Map(),
          )
        if (mode === 'foreign-unit-reader')
          expect(() => new RunnerAssemblyReadiness(store, units)).toThrow(
            'assembly-readiness-fixed-unit-reader-required',
          )
        else {
          const result = await new RunnerAssemblyReadiness(store, units).inspect(
            request,
            mode === 'unknown-milestone' ? 'absent' : 'feature',
            'a'.repeat(64),
          )
          expect(result.status).toBe(mode === 'pending-qa' ? 'blocked' : 'unknown')
          expect(result.candidates).toBeUndefined()
          expect(result.assembly).toBeUndefined()
          expect(result.integrationQa).toBe('not-established')
          expect(result.acceptance).toBe('not-established')
        }
        expect(contractDigest(store.lifecycle.journal.events())).toBe(before)
      })
    },
  )
})
