import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import {
  privateBaseline,
  privateExecutionIdentity,
  relevantBaselineFailure,
} from '../../../src/acceptance/private-identity.js'
import { sourceHash } from '../../../src/delivery/input.js'
import { workspaceSnapshot } from '../../../src/gates/snapshot.js'
import { acceptanceFixture } from '../../support/acceptance.js'
import { entry } from '../../support/delivery.js'
import { environmentRecipe } from '../../support/environment.js'

it('allows only selected source byte and allocated-path differences between execution identities', () => {
  const recipe = environmentRecipe('/fixture/baseline', 'baseline')
  recipe.files.push({
    id: 'fixture',
    repository: 'app',
    ref: 'fixture.json',
    sha256: sourceHash('private fixture data'),
    kind: 'fixture',
  })
  const candidate = structuredClone(recipe)
  entry(candidate.repositories, 0).root = '/fixture/candidate'
  entry(candidate.files, 0).sha256 = sourceHash('candidate')
  expect(privateExecutionIdentity(candidate)).toBe(privateExecutionIdentity(recipe))
  for (const change of ['command', 'network', 'image', 'file', 'limits', 'fixture'] as const) {
    const changed = structuredClone(candidate)
    if (change === 'command') entry(changed.services, 0).start.argv.push('--weakened')
    if (change === 'network') changed.network.runtime = 'none'
    if (change === 'image') entry(changed.services, 0).image = `node@sha256:${'a'.repeat(64)}`
    if (change === 'file') entry(changed.files, 0).ref = 'different-app.cjs'
    if (change === 'limits') changed.limits.outputBytes++
    if (change === 'fixture') entry(changed.files, 1).sha256 = sourceHash('weakened fixture')
    expect(privateExecutionIdentity(changed), change).not.toBe(privateExecutionIdentity(recipe))
  }
})
it('observes the actual clean Git base and refuses dirty, untracked or wrong-base substitutes', () =>
  acceptanceFixture(async ({ root, delivery }) => {
    const text = readFileSync(join(root, 'app.txt'), 'utf8'),
      recipe = environmentRecipe(root, text)
    entry(recipe.files, 0).ref = 'app.txt'
    const snapshot = workspaceSnapshot(root),
      record = {
        candidates: [
          {
            repository: 'app',
            path: root,
            head: snapshot.head,
            snapshot: snapshot.digest,
            content: 'a'.repeat(64),
          },
        ],
      }
    expect(privateBaseline(record, recipe, delivery).status).toBe('observed-clean-base')
    writeFileSync(join(root, 'app.txt'), 'changed application\n')
    expect(privateBaseline(record, recipe, delivery).status).toBe('not-clean-base')
    writeFileSync(join(root, 'app.txt'), text)
    writeFileSync(join(root, 'untracked.txt'), 'new behavior\n')
    expect(privateBaseline(record, recipe, delivery).status).toBe('not-clean-base')
    expect(
      privateBaseline(
        { candidates: [{ ...entry(record.candidates, 0), head: 'b'.repeat(40) }] },
        recipe,
        delivery,
      ).status,
    ).toBe('not-clean-base')
  }))
it('refuses a selected baseline input that was never part of the pinned Git base', () =>
  acceptanceFixture(async ({ root, delivery }) => {
    const snapshot = workspaceSnapshot(root),
      recipe = environmentRecipe(root, 'absent')
    const record = {
      candidates: [
        {
          repository: 'app',
          path: root,
          head: snapshot.head,
          snapshot: snapshot.digest,
          content: 'a'.repeat(64),
        },
      ],
    }
    expect(privateBaseline(record, recipe, delivery).status).toBe('unavailable')
  }))

it.each([
  ['passed', 'failed', true],
  ['failed', 'failed', false],
  ['passed', 'unavailable', false],
  ['failed', 'passed', false],
] as const)('separates control %s from relevant mismatch %s', (control, relevant, expected) => {
  expect(
    relevantBaselineFailure(
      [
        { id: 'control', status: control },
        { id: 'regression', status: relevant },
      ],
      ['regression'],
    ),
  ).toBe(expected)
})
