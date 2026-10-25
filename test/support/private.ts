import type { AcceptancePlan } from '../../src/acceptance/contracts.js'
import type { PrivateAcceptancePlan } from '../../src/acceptance/private-input.js'

export function privatePlan(plan: AcceptancePlan): PrivateAcceptancePlan {
  return {
    schema: 'wholeloop/private-acceptance@1',
    run: plan.run,
    revision: plan.revision,
    plan: plan.plan,
    source: plan.source,
    case: plan.cases[0]?.id ?? 'missing',
    behavior: {
      schema: 'wholeloop/behavior-input@1',
      kind: 'api',
      service: 'web',
      port: 3000,
      steps: [
        {
          id: 'empty',
          kind: 'request',
          method: 'POST',
          path: '/tasks',
          body: '{"title":""}',
          headers: { 'content-type': 'application/json' },
        },
      ],
    },
    assertions: [
      {
        id: 'empty-title',
        subject: 'status',
        operator: 'equals',
        expected: '400',
        description: 'Reject an empty task title.',
      },
    ],
    sensitivity: { mode: 'regression', relevant: ['empty-title'] },
  }
}
