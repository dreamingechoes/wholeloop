import type { AcceptanceBoundary } from '../../src/acceptance/boundary.js'
import type { AcceptanceBindings, AcceptancePlan } from '../../src/acceptance/contracts.js'
import { type AcceptanceHost, DeliveryAcceptance } from '../../src/acceptance/store.js'
import { contractDigest } from '../../src/contracts/compatibility.js'
import type { DeliveryPlan } from '../../src/delivery/plan.js'
import { workspaceSnapshot } from '../../src/gates/snapshot.js'
import { authorization, entry, fixture } from './delivery.js'

export async function acceptanceFixture(
  run: (context: {
    acceptance: DeliveryAcceptance
    plan: AcceptancePlan
    delivery: DeliveryPlan
    boundary: AcceptanceBoundary
    bindings: AcceptanceBindings
    host: AcceptanceHost
    calls: { count: number }
    dir: string
    root: string
  }) => Promise<void>,
  options: { human?: boolean; artifactBytes?: number; now?: () => string } = {},
) {
  await fixture(async ({ planning, plan: delivery, dir, root }) => {
    if (options.human) entry(delivery.criteria, 0).acceptance = 'human'
    if (options.artifactBytes !== undefined) delivery.budgets.artifactBytes = options.artifactBytes
    const prepared = planning.preparePlan(delivery)
    const acceptance = new DeliveryAcceptance(
      planning.sources.files.root,
      options.now ? { now: options.now } : {},
    )
    const grant = acceptance.budgets.lifecycle.authority.authorize(
      authorization(delivery, prepared.digest),
    )
    acceptance.budgets.lifecycle.track({ run: delivery.run, revision: 1, grant: grant.grant.id })
    const snapshot = workspaceSnapshot(root)
    const bindings: AcceptanceBindings = {
      environment: `environment-${'a'.repeat(32)}`,
      recipe: 'b'.repeat(64),
      runtime: 'c'.repeat(64),
      candidates: [{ repository: 'app', head: snapshot.head, snapshot: snapshot.digest }],
    }
    const boundary: AcceptanceBoundary = {
      provenance: 'fixture',
      async observe() {
        return structuredClone(bindings)
      },
    }
    const plan: AcceptancePlan = {
      schema: 'wholeloop/acceptance-plan@1',
      run: delivery.run,
      revision: 1,
      plan: prepared.digest,
      source: delivery.source,
      cases: [
        {
          id: 'find-title',
          criteria: ['search'],
          owner: options.human ? 'human' : 'machine',
          applicability: 'applicable',
          rationale: 'This is an agreed observable criterion.',
          initial: 'Two tasks exist with distinct titles.',
          actions: ['Search for one title through the public entrypoint.'],
          assertions: [
            {
              id: 'matching-ids',
              description: 'Return only the matching task ID.',
              subject: 'json',
              operator: 'equals',
              path: '/ids',
              expected: '["task-2"]',
            },
          ],
          failureConditions: ['Missing or additional task IDs fail the criterion.'],
          runner: {
            kind: options.human ? 'human' : 'api',
            capability: options.human ? 'manual.observe' : 'http.request',
            input: '{}',
          },
          fixture: {
            ref: 'fixture:two-tasks',
            sha256: contractDigest(['First task', 'Second task']),
          },
          timeoutMs: 10000,
        },
      ],
      retention: { reviewAfterMs: 86400000, expiryAction: 'retain' },
    }
    const calls = { count: 0 }
    const host: AcceptanceHost = {
      id: 'fixture-http',
      version: '1',
      capability: 'http.request',
      provenance: 'fixture',
      async execute(_test, context) {
        calls.count++
        const artifact = context.capture(
          Buffer.from(JSON.stringify({ ids: ['task-2'] })),
          'application/json',
        )
        return {
          status: 'passed',
          origin: 'controller-observation',
          invocationState: 'stopped',
          assertions: [{ id: 'matching-ids', status: 'passed', evidence: artifact }],
          artifacts: [artifact],
          reason: 'Observed fixture response.',
        }
      },
      async stop() {
        return 'stopped'
      },
    }
    await run({ acceptance, plan, delivery, boundary, bindings, host, calls, dir, root })
  })
}
