import { contractDigest } from '../../src/contracts/compatibility.js'
import type { EffectIntent } from '../../src/delivery/effect-events.js'
import { DeliveryEffects, type EffectHost } from '../../src/delivery/effects.js'
import { publicationFixture } from './runner-publication.js'

export const FAULT_OPERATIONS = [
  'workspace.create',
  'code.write',
  'test.run',
  'git.commit',
  'git.push',
  'pr.create',
  'pr.ready',
  'pr.update',
  'pr.merge',
  'report.write',
] as const
export const FAULT_BOUNDARIES = [
  'crash-after-prepare',
  'crash-after-issue',
  'lost-response',
  'unavailable-read',
  'duplicate-observation',
  'denied-host',
  'revoked-before-issue',
] as const
export interface FaultResult {
  operation: (typeof FAULT_OPERATIONS)[number]
  boundary: (typeof FAULT_BOUNDARIES)[number]
  writes: number
  status: string
  secondIssueRefused: boolean
  journalStableOnReplay: boolean
}

/**
 * One effect boundary under one fault, against the real ledger and a synthetic
 * remote. It certifies ledger semantics, not a hosted service or native client.
 */
export async function effectBoundary(
  operation: FaultResult['operation'],
  boundary: FaultResult['boundary'],
): Promise<FaultResult> {
  let result: FaultResult | undefined
  await publicationFixture(
    async ({ store, plan, target, grant }) => {
      const remote = { applied: false, writes: 0, reads: 0 }
      const effects = new DeliveryEffects(store.files.root, store.now, store.budgets.clock),
        observe = (intent: Readonly<EffectIntent>) => ({
          available: true as const,
          value: {
            binding: contractDigest(intent),
            status: remote.applied ? ('applied' as const) : ('not-applied' as const),
            reason: 'observed' as const,
            provenance: 'host-observed' as const,
            invocationState: 'stopped' as const,
            evidence: contractDigest({ applied: remote.applied }),
            ...(remote.applied ? { resource: { ref: intent.ref, revision: target.head } } : {}),
          },
        }),
        host: EffectHost = {
          eligible: () => ({
            allowed: boundary !== 'denied-host',
            provenance: 'host-observed',
            evidence: 'f'.repeat(64),
          }),
          invoke: async () => {
            // A crash after issue: the invocation never reached the remote.
            if (boundary === 'crash-after-issue') throw new Error('Controller lost before invoke.')
            remote.writes++
            remote.applied = true
            if (boundary === 'lost-response') throw new Error('Response lost after apply.')
          },
          observe: async (intent) => {
            remote.reads++
            if (boundary === 'unavailable-read' && remote.reads === 1)
              return { available: false, reason: 'unavailable-read' }
            return observe(intent)
          },
        }
      // A report is an artifact; every other operation mutates the owned topic.
      const prepared = effects.prepare(
        plan.run,
        operation === 'report.write'
          ? {
              key: 'fault-effect',
              operation,
              ref: 'artifacts/fault-report.md',
              inputDigest: contractDigest({ operation, boundary }),
            }
          : {
              key: 'fault-effect',
              operation,
              repository: 'app',
              ref: target.branch,
              expectedHead: target.head,
              inputDigest: contractDigest({ operation, boundary }),
            },
      )
      if (boundary === 'revoked-before-issue')
        store.lifecycle.authority.revoke({
          schema: 'wholeloop/delivery-revocation-request@1',
          grant,
          operator: 'Fixture Operator',
          reason: 'Withdraw authority between intent and issue.',
        })
      // A restarted controller holds only the journal: the prepared intent is reused.
      const ledger =
        boundary === 'crash-after-prepare'
          ? new DeliveryEffects(store.files.root, store.now, store.budgets.clock)
          : effects
      try {
        await ledger.execute(plan.run, prepared.intent.id, host)
      } catch {
        /* Refusals are recorded below through the unchanged effect status. */
      }
      let record = ledger.get(plan.run, prepared.intent.id)
      if (['pending', 'unknown'].includes(record.status))
        record = await ledger.reconcile(plan.run, prepared.intent.id, host)
      const before = contractDigest(store.lifecycle.journal.events())
      if (['applied', 'not-applied'].includes(record.status))
        await ledger.reconcile(plan.run, prepared.intent.id, host)
      const stable = contractDigest(store.lifecycle.journal.events()) === before
      let refused = false
      try {
        await new DeliveryEffects(store.files.root, store.now, store.budgets.clock).execute(
          plan.run,
          prepared.intent.id,
          host,
        )
      } catch {
        refused = true
      }
      result = {
        operation,
        boundary,
        writes: remote.writes,
        status: ledger.get(plan.run, prepared.intent.id).status,
        secondIssueRefused: refused,
        journalStableOnReplay: stable,
      }
    },
    {
      endpoint: 'to-merge',
      effects: [
        'source.read',
        'report.write',
        'workspace.create',
        'code.write',
        'test.run',
        'git.commit',
        'git.push',
        'pr.create',
        'pr.ready',
        'pr.update',
        'pr.merge',
      ],
    },
  )
  if (!result) throw new Error('Fault scenario did not run')
  return result
}
/** The expected retained outcome for each boundary; no fault may produce a second write. */
export const EXPECTED: Record<FaultResult['boundary'], { writes: number; status: string }> = {
  'crash-after-prepare': { writes: 1, status: 'applied' },
  'crash-after-issue': { writes: 0, status: 'not-applied' },
  'lost-response': { writes: 1, status: 'applied' },
  'unavailable-read': { writes: 1, status: 'applied' },
  'duplicate-observation': { writes: 1, status: 'applied' },
  'denied-host': { writes: 0, status: 'prepared' },
  'revoked-before-issue': { writes: 0, status: 'prepared' },
}
