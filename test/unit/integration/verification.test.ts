import { expect, it } from 'vitest'
import { DeliveryAcceptance } from '../../../src/acceptance/store.js'
import { integrationVerificationSelection } from '../../../src/integration/verification.js'
import { integrationFixture } from '../../support/integration.js'

it('requires pre-builder contract fingerprints and the approved combined procedure', () =>
  integrationFixture(async ({ store, request }) => {
    const candidate = store.prepare(request).candidate,
      input = request.inputs.find((i) => i.kind === 'acceptance')
    if (!input) throw new Error('Missing fixture acceptance')
    const plan = new DeliveryAcceptance(store.planning.sources.files.root).get(input.ref).plan
    expect(integrationVerificationSelection(candidate, plan).missing).toHaveLength(2)
    const test = plan.cases[0],
      contract = candidate.contracts[0]
    if (!test || !contract) throw new Error('Missing definition')
    test.fixture.sha256 = contract.sha256
    test.actions.push(candidate.dependencies.procedure)
    expect(integrationVerificationSelection(candidate, plan)).toMatchObject({
      missing: [],
      cases: [test.id],
    })
  }))
it.each(['wrong-contract', 'wrong-procedure', 'human-only', 'not-applicable'])(
  'refuses %s as executable whole-milestone coverage',
  (reason) =>
    integrationFixture(async ({ store, request }) => {
      const candidate = store.prepare(request).candidate,
        input = request.inputs.find((i) => i.kind === 'acceptance')
      if (!input) throw new Error('Missing fixture acceptance')
      const plan = new DeliveryAcceptance(store.planning.sources.files.root).get(input.ref).plan,
        test = plan.cases[0],
        contract = candidate.contracts[0]
      if (!test || !contract) throw new Error('Missing definition')
      test.fixture.sha256 = contract.sha256
      test.actions.push(candidate.dependencies.procedure)
      if (reason === 'wrong-contract') test.fixture.sha256 = 'f'.repeat(64)
      if (reason === 'wrong-procedure') test.actions = ['An unrelated action.']
      if (reason === 'human-only') test.owner = 'human'
      if (reason === 'not-applicable') test.applicability = 'not-applicable'
      expect(integrationVerificationSelection(candidate, plan).missing.length).toBeGreaterThan(0)
    }),
)
