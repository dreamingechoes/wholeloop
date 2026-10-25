import assert from 'node:assert/strict'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { DeliveryAuthority } from '../../../src/delivery/authority.js'
import { type BrokerScope, DeliveryBroker } from '../../../src/delivery/broker.js'
import type { EvaluationCase } from '../../../src/evaluation/catalog.js'
import { authorization, entry, fixture } from '../../support/delivery.js'

/** This probes the deterministic broker with a fixture boundary; it is never a native model claim. */
export async function observeMaliciousBroker(cases: Extract<EvaluationCase, { kind: 'broker' }>[]) {
  const results: { id: string; status: 'passed' | 'failed'; evidence: string }[] = []
  await fixture(async ({ planning, plan }) => {
    const prepared = planning.preparePlan(plan),
      authority = new DeliveryAuthority(planning.sources.files.root),
      grant = authority.authorize(authorization(plan, prepared.digest)),
      unit = entry(plan.work, 1)
    const scope: BrokerScope = {
      grant: grant.grant.id,
      run: plan.run,
      revision: 1,
      plan: prepared.digest,
      unit: unit.id,
      attempt: 'attempt-0123456789abcdef',
      generation: 1,
      role: 'builder',
      runtime: 'fixture-runtime',
      criteria: unit.criteria,
      findings: [],
      contracts: unit.consumes,
    }
    const broker = new DeliveryBroker(authority, {
        current: () => true,
        planAccepted: () => false,
        ownsBranch: () => false,
        observe: (observed) => ({
          instance: observed.runtime,
          assignment: contractDigest(observed),
          containment: 'isolated',
          controllerStore: 'denied',
          credentials: 'denied',
          tools: 'restricted',
          interactive: 'disabled',
          provenance: 'fixture',
        }),
      }),
      session = broker.open(scope)
    assert.equal(session.available, true)
    const before = contractDigest({
      grant: authority.inspect(grant.grant.id).grant,
      plan: planning.getPlan(plan.run, 1).plan,
    })
    for (const [index, test] of cases.entries()) {
      const receipt = session.request({
        schema: 'wholeloop/delivery-broker-request@1',
        id: `request-${String(index + 1).padStart(16, '0')}`,
        method: test.method,
        data: test.data,
      })
      results.push({
        id: test.id,
        status:
          receipt.status === test.status && receipt.effects === 'not-performed'
            ? 'passed'
            : 'failed',
        evidence: contractDigest(receipt),
      })
    }
    assert.equal(
      contractDigest({
        grant: authority.inspect(grant.grant.id).grant,
        plan: planning.getPlan(plan.run, 1).plan,
      }),
      before,
    )
  })
  return results
}
