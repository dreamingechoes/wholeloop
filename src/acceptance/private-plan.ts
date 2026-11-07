// Stores private acceptance definitions as controller data, never repository assets or worker
// context.
import { existsSync } from 'node:fs'
import { contractDigest } from '../contracts/compatibility.js'
import { readSourceFile } from '../delivery/input.js'
import { DeliveryJournalError } from '../delivery/journal-error.js'
import { deliveryAttempts } from '../delivery/reducer.js'
import { type AcceptanceCase, AcceptanceError } from './contracts.js'
import {
  type PrivateAcceptancePlan,
  privateCaseReference,
  privateDefinition,
} from './private-input.js'
import type { DeliveryAcceptance } from './store.js'

/** Private controller data, never repository assets, worker context or a result-import endpoint. */
export class PrivateAcceptance {
  constructor(readonly acceptance: DeliveryAcceptance) {}
  prepare(value: unknown) {
    const plan = privateDefinition(value),
      delivery = this.acceptance.planning.getPlan(plan.run, plan.revision)
    if (delivery.digest !== plan.plan || delivery.plan.source !== plan.source)
      throw new AcceptanceError('private-plan-binding')
    const digest = contractDigest(plan),
      files = this.acceptance.planning.sources.files
    return files.locked(() => {
      const pin = this.pin(plan)
      if (existsSync(files.path(pin))) {
        if (this.read(pin).digest !== digest)
          throw new AcceptanceError('pinned-private-definitions')
        return this.get(digest)
      }
      try {
        const state = this.acceptance.budgets.lifecycle.journal.view(plan.run)
        if (
          deliveryAttempts(state).records.some((a) => a.role === 'builder' && a.basis === plan.plan)
        )
          throw new AcceptanceError('private-defined-after-builder-admission')
      } catch (error) {
        if (!(error instanceof DeliveryJournalError && error.problem === 'unknown-run')) throw error
      }
      const body = `${JSON.stringify({ digest, plan })}\n`
      files.atomic(`delivery/private-acceptance/${digest}.json`, body)
      files.atomic(pin, body)
      return { digest, plan }
    })
  }
  get(digest: string) {
    if (!/^[a-f0-9]{64}$/.test(digest)) throw new AcceptanceError('invalid-private-digest')
    const current = this.read(`delivery/private-acceptance/${digest}.json`)
    if (current.digest !== digest || this.read(this.pin(current.plan)).digest !== digest)
      throw new AcceptanceError('changed-private-plan')
    return current
  }
  forCase(digest: string, test: AcceptanceCase) {
    const pinned = this.acceptance.get(digest).plan,
      privatePlan = this.get(privateCaseReference(test))
    if (
      privatePlan.plan.run !== pinned.run ||
      privatePlan.plan.revision !== pinned.revision ||
      privatePlan.plan.plan !== pinned.plan ||
      privatePlan.plan.source !== pinned.source ||
      privatePlan.plan.case !== test.id ||
      test.fixture.sha256 !== privatePlan.digest
    )
      throw new AcceptanceError('private-case-binding')
    return privatePlan
  }
  private pin(plan: PrivateAcceptancePlan) {
    return `delivery/private-acceptance-pins/${plan.run}/${plan.revision}/${plan.case}.json`
  }
  private read(path: string) {
    const record = JSON.parse(
      readSourceFile(this.acceptance.planning.sources.files.root, path, 2 * 1024 * 1024),
    ) as { digest: string; plan: unknown }
    if (Object.keys(record).sort().join(',') !== 'digest,plan')
      throw new AcceptanceError('private-record-shape')
    const plan = privateDefinition(record.plan)
    if (contractDigest(plan) !== record.digest) throw new AcceptanceError('changed-private-bytes')
    return { digest: record.digest, plan }
  }
}
