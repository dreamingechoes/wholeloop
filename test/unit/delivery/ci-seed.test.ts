import { renameSync } from 'node:fs'
import { expect, it } from 'vitest'
import { ciCorrectionSeed } from '../../../src/delivery/ci-seed.js'
import { continueCiDelivery } from '../../../src/runner/ci-continuation.js'
import { originalCiFailure } from '../../../src/runner/ci-failure.js'
import { git } from '../../support/delivery.js'
import { runnerCiFailureFixture } from '../../support/runner-ci.js'

it('selects the exact original published product head beyond the checked unit root, never a newer object', async () => {
  await runnerCiFailureFixture(
    ({ store, request, input, paths }) => {
      const owner = store.record(input.request),
        proof = originalCiFailure(store, input)
      if (!owner.controller) throw new Error('Original fixture controller required')
      store.release(
        { request: input.request, controller: owner.controller, generation: owner.generation },
        'Close the original fixture controller.',
      )
      store.lifecycle.transition(request.run, {
        to: 'failed',
        outcome: 'failed',
        reason: 'Preserve the synthetic CI failure.',
      })
      continueCiDelivery(
        store.lifecycle,
        request.run,
        { request: input.request, unit: 'search' },
        { operator: 'Fixture Operator', reason: 'Record the exact CI correction proposal.' },
      )
      const plan = store.planning.getPlan(request.run, 2).plan,
        repository = plan.repositories[0]
      if (!repository) throw new Error('Pinned repository required')
      const before = JSON.stringify(store.lifecycle.journal.events())
      expect(proof.target.head).not.toBe(repository.base)
      expect(ciCorrectionSeed(store.lifecycle, plan, repository, repository.base)).toBe(
        proof.target.head,
      )
      const unrelated = git(repository.root, [
        'commit-tree',
        git(repository.root, ['rev-parse', 'HEAD^{tree}']),
        '-m',
        'test: retain an unrelated fixture root',
        '-m',
        'Reject a real object that is not an ancestor of the original publication.',
      ])
      expect(() => ciCorrectionSeed(store.lifecycle, plan, repository, unrelated)).toThrow(
        'workspace-ci-seed-original-publication',
      )
      const path = store.files.path(paths.at(-1) ?? '')
      renameSync(path, `${path}.fixture-backup`)
      try {
        expect(() => ciCorrectionSeed(store.lifecycle, plan, repository, repository.base)).toThrow(
          'ci-correction-original-basis-unavailable',
        )
      } finally {
        renameSync(`${path}.fixture-backup`, path)
      }
      expect(JSON.stringify(store.lifecycle.journal.events())).toBe(before)
      const entry = plan.corrections?.[0]
      if (!entry) throw new Error('CI correction entry required')
      expect(
        ciCorrectionSeed(
          store.lifecycle,
          {
            ...plan,
            revision: 3,
            previous: store.planning.getPlan(request.run, 2).digest,
            corrections: [
              entry,
              { ...entry, origin: 'integration', revision: 3, stage: 'integration:feature' },
            ],
          },
          repository,
          repository.base,
        ),
      ).toBeUndefined()
    },
    {},
    'failure',
    { integratedHead: true },
  )
})
